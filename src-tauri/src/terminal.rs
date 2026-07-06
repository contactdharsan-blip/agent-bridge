//! One-click "open native login" (FR47/FR23): the app never runs an agent's
//! auth flow on the user's behalf — it doesn't know each agent's exact login
//! invocation reliably enough to trust auto-executing it, and PRD plan §5
//! says surface each agent's native login, don't own it. Instead this opens a
//! real, visible terminal in the session's working directory so the user can
//! run their agent's own CLI there themselves — the same command AGENT
//! BRIDGE itself would spawn over ACP, just interactively, so the user can
//! complete whatever OAuth/browser step it needs.
//!
//! Real process spawning, not a pure engine — like `doctor.rs`'s version
//! probes, this is 🔴-adjacent surface (external process, OS-specific) that's
//! execution-verified rather than unit-tested (only Windows/Linux couldn't be
//! run in the sandbox that wrote this; macOS was).

use std::process::Command;

/// Open the OS's terminal application, targeting `cwd` if non-empty.
/// Best-effort across platforms — surfaces a real error rather than silently
/// doing nothing, since a silent no-op here is indistinguishable from "it's
/// still thinking" to the user.
pub fn open_terminal(cwd: &str) -> Result<(), String> {
    let cwd = cwd.trim();

    if cfg!(target_os = "macos") {
        // `open -a Terminal <dir>` is the documented way to target a folder —
        // `open` hands off to Launch Services, so a plain `current_dir` on
        // this Command wouldn't reach the terminal Launch Services actually
        // opens.
        let mut cmd = Command::new("open");
        cmd.args(["-a", "Terminal"]);
        if !cwd.is_empty() {
            cmd.arg(cwd);
        }
        return cmd
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("couldn't open Terminal: {e}"));
    }

    if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "cmd", "/K"]);
        if !cwd.is_empty() {
            cmd.current_dir(cwd);
        }
        return cmd
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("couldn't open a command prompt: {e}"));
    }

    // Linux: no universal terminal — try a short list of common emulators,
    // each inheriting this Command's `current_dir` as their initial shell's
    // working directory. First one that spawns without an OS error wins.
    let candidates = ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"];
    let mut last_err = "no known terminal emulator found".to_string();
    for term in candidates {
        let mut cmd = Command::new(term);
        if !cwd.is_empty() {
            cmd.current_dir(cwd);
        }
        match cmd.spawn() {
            Ok(_) => return Ok(()),
            Err(e) => last_err = format!("{term}: {e}"),
        }
    }
    Err(format!("couldn't open a terminal — {last_err}"))
}

/// Tauri command wrapper (FR47): open a terminal in `cwd` so the user can run
/// their agent's own login flow. Never claims a specific login subcommand —
/// the frontend's own copy is what stays honest about what to type.
#[tauri::command]
pub fn open_agent_login_terminal(cwd: String) -> Result<(), String> {
    open_terminal(&cwd)
}
