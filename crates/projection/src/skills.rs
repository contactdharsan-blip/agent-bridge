//! Skill placement — `SKILL.md` is already a cross-agent standard, so projecting
//! a skill is *placement* (copy the folder verbatim into each agent's skills
//! dir), never translation (plan §3a).
//!
//! The planner ([`plan_skill_placement`]) is pure: path joins only, no IO, so it
//! is 🟢-testable. The copy ([`place_skill`]) is the one effectful function and is
//! tested against a real tempdir.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use canonical::Skill;
use serde::{Deserialize, Serialize};

use crate::Target;

/// A planned placement of one skill into one target's skills dir.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillPlacement {
    /// Target agent.
    pub target: Target,
    /// Skill name (the destination folder name).
    pub skill: String,
    /// Absolute source directory (contains `SKILL.md`).
    pub source_dir: String,
    /// Absolute destination directory the folder is copied to.
    pub target_dir: String,
}

/// The conventional skills root for a target under `home`. No path is hardcoded;
/// the caller resolves `home` dynamically (honoring "no hardcoded absolute paths").
pub fn default_skills_root(target: Target, home: &Path) -> PathBuf {
    match target {
        Target::Claude => home.join(".claude").join("skills"),
        Target::Codex => home.join(".codex").join("skills"),
        Target::Cursor => home.join(".cursor").join("skills"),
    }
}

/// Plan where each skill folder is placed for `target`, under `skills_root`.
/// Pure — produces the ops, performs none.
pub fn plan_skill_placement(target: Target, skills: &[Skill], skills_root: &Path) -> Vec<SkillPlacement> {
    skills
        .iter()
        .map(|s| SkillPlacement {
            target,
            skill: s.name.clone(),
            source_dir: s.source_dir.clone(),
            target_dir: skills_root.join(&s.name).to_string_lossy().into_owned(),
        })
        .collect()
}

/// Execute one placement: recursively copy the skill folder verbatim. The
/// destination is replaced if it already exists, so re-projecting is idempotent.
pub fn place_skill(placement: &SkillPlacement) -> io::Result<()> {
    let src = Path::new(&placement.source_dir);
    let dst = Path::new(&placement.target_dir);
    if dst.exists() {
        fs::remove_dir_all(dst)?;
    }
    copy_dir_recursive(src, dst)
}

/// Recursively copy `src` → `dst`, creating directories as needed.
fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placement_targets_the_skill_folder_under_root() {
        let skills = vec![Skill { name: "profile".into(), source_dir: "/src/profile".into() }];
        let root = Path::new("/home/u/.claude/skills");
        let plan = plan_skill_placement(Target::Claude, &skills, root);
        assert_eq!(plan.len(), 1);
        assert_eq!(plan[0].target_dir, "/home/u/.claude/skills/profile");
        assert_eq!(plan[0].source_dir, "/src/profile");
    }

    #[test]
    fn default_roots_differ_per_agent() {
        let home = Path::new("/home/u");
        assert!(default_skills_root(Target::Claude, home).ends_with(".claude/skills"));
        assert!(default_skills_root(Target::Codex, home).ends_with(".codex/skills"));
        assert!(default_skills_root(Target::Cursor, home).ends_with(".cursor/skills"));
    }
}
