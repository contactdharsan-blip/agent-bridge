//! Native config file I/O — real reads/writes of the on-disk MCP/instructions
//! files the Projection Engine only ever *previewed* until now (FR24: the
//! Config panel's "apply" actually writing `.mcp.json`/`.codex/config.toml`/
//! `.cursor/mcp.json`/`CLAUDE.md`/etc.; FR26: the import wizard reading an
//! existing user's native files back into the canonical store).
//!
//! Deliberately outside the pure-engine crates: this is real, side-effecting
//! disk I/O keyed on a caller-supplied `cwd` + relative `path`, so it gets a
//! path-traversal guard (defense-in-depth — today's only callers are the
//! trusted `TARGET_FILE`/`INSTRUCTIONS_FILE` TS constants, but a caller-
//! supplied path should never be trusted implicitly).

use std::fs;
use std::path::{Component, Path, PathBuf};

/// Reject anything but a plain relative path (`Normal`/`CurDir` components
/// only) *before* touching the filesystem at all. There is no legitimate
/// caller that needs `..`, an absolute path, or a Windows prefix — every real
/// caller passes a known-safe constant (`TARGET_FILE`/`INSTRUCTIONS_FILE`).
/// This is the primary guard: it can't be defeated by a symlink race between
/// check and use, because it never depends on what's actually on disk.
fn reject_traversal(rel_path: &str) -> Result<(), String> {
    for component in Path::new(rel_path).components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("path must be a plain relative path: {rel_path:?}"));
            }
        }
    }
    Ok(())
}

/// Walk up from `path` to the nearest ancestor that actually exists on disk.
/// `path` itself need not exist (the common case for a write before the file
/// — or even its parent dir — has been created).
fn nearest_existing_ancestor(path: &Path) -> PathBuf {
    let mut probe = path;
    loop {
        if probe.exists() {
            return probe.to_path_buf();
        }
        match probe.parent() {
            Some(parent) => probe = parent,
            None => return probe.to_path_buf(),
        }
    }
}

/// Resolve `rel_path` under `cwd` and confirm the result cannot escape `cwd`.
///
/// First rejects any `..`/absolute component lexically (see
/// `reject_traversal`), then — as a second, symlink-aware layer — canonicalizes
/// `cwd` (the trust boundary), walks up from the joined target to the nearest
/// existing ancestor, canonicalizes *that*, and confirms it is still inside
/// the canonical `cwd`. This works whether or not the final file/parent dir
/// exists yet, so it's safe to call before `create_dir_all` for a write.
fn resolve_within(cwd: &str, rel_path: &str) -> Result<PathBuf, String> {
    reject_traversal(rel_path)?;

    let canonical_cwd = fs::canonicalize(cwd)
        .map_err(|e| format!("could not resolve working directory {cwd:?}: {e}"))?;
    let joined = canonical_cwd.join(rel_path);

    let ancestor = nearest_existing_ancestor(&joined);
    let canonical_ancestor = fs::canonicalize(&ancestor)
        .map_err(|e| format!("could not resolve path {rel_path:?}: {e}"))?;
    if !canonical_ancestor.starts_with(&canonical_cwd) {
        return Err(format!("path escapes working directory: {rel_path:?}"));
    }

    Ok(joined)
}

/// Read a native config/instructions file under `cwd`. `Ok(None)` if it simply
/// doesn't exist yet (not an error — most native files don't exist until the
/// user has written one) — only a real I/O error (permission denied, path
/// traversal, etc.) is `Err`.
#[tauri::command]
pub fn read_native_file(cwd: String, path: String) -> Result<Option<String>, String> {
    let resolved = resolve_within(&cwd, &path)?;
    match fs::read_to_string(&resolved) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("could not read {path}: {e}")),
    }
}

/// Write `contents` to a native file under `cwd`, creating any missing parent
/// directories first (needed for e.g. `.codex/config.toml`'s `.codex/` dir).
#[tauri::command]
pub fn write_native_file(cwd: String, path: String, contents: String) -> Result<(), String> {
    let resolved = resolve_within(&cwd, &path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("could not create directory for {path}: {e}"))?;
    }
    fs::write(&resolved, contents).map_err(|e| format!("could not write {path}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();

        write_native_file(cwd.clone(), ".codex/config.toml".into(), "[mcp_servers]\n".into())
            .expect("write should succeed");

        let read = read_native_file(cwd, ".codex/config.toml".into()).expect("read should succeed");
        assert_eq!(read, Some("[mcp_servers]\n".to_string()));
    }

    #[test]
    fn read_missing_file_returns_none_not_error() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();
        let read = read_native_file(cwd, ".mcp.json".into()).expect("missing file is not an error");
        assert_eq!(read, None);
    }

    #[test]
    fn path_traversal_write_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();

        let result = write_native_file(cwd, "../../etc/passwd".into(), "pwned".into());
        assert!(result.is_err(), "traversal write must be rejected");
    }

    #[test]
    fn path_traversal_read_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();

        let result = read_native_file(cwd, "../../etc/passwd".into());
        assert!(result.is_err(), "traversal read must be rejected");
    }

    #[test]
    fn traversal_is_rejected_lexically_even_for_a_nonexistent_target() {
        // Regression test for the case the ancestor-walk alone could miss:
        // a `..` path whose nearest existing ancestor still happens to sit
        // inside `cwd` (e.g. `sub/../../outside`, where `sub` exists but the
        // walk's early parents do too) must still be rejected up front by
        // `reject_traversal`, before any filesystem probing happens.
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();
        fs::create_dir_all(dir.path().join("sub")).unwrap();

        let result = write_native_file(cwd, "sub/../../outside/evil.toml".into(), "x".into());
        assert!(result.is_err(), "any `..` component must be rejected regardless of what exists on disk");
    }

    #[test]
    fn absolute_path_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();

        let result = write_native_file(cwd, "/etc/passwd".into(), "pwned".into());
        assert!(result.is_err(), "absolute path must be rejected");
    }
}
