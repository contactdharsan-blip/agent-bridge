#!/usr/bin/env python3
"""Print a JSON manifest of locally available agent session history.

Deterministic data-gathering only — NO analysis, NO transcript contents. The
Profile Skill runs this to compute the `data` coverage block (sessionsAnalyzed,
daysCovered) without re-walking the tree, and to confirm which agents have
local history at all. Stdlib only; never raises on a missing dir.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
from pathlib import Path


def _scan(paths: list[Path], patterns: list[str]) -> dict:
    """Count matching files under existing dirs and find their mtime range."""
    files: list[Path] = []
    for base in paths:
        if not base.exists():
            continue
        for pat in patterns:
            files.extend(p for p in base.rglob(pat) if p.is_file())

    if not files:
        return {"available": False, "fileCount": 0, "daysCovered": 0,
                "earliest": None, "latest": None}

    mtimes = [f.stat().st_mtime for f in files]
    earliest = min(mtimes)
    latest = max(mtimes)
    days = max(1, round((latest - earliest) / 86400) + 1)
    iso = lambda t: _dt.datetime.fromtimestamp(t, _dt.timezone.utc).strftime("%Y-%m-%d")
    return {
        "available": True,
        "fileCount": len(files),
        "daysCovered": days,
        "earliest": iso(earliest),
        "latest": iso(latest),
    }


def main() -> None:
    home = Path(os.path.expanduser("~"))
    manifest = {
        "claude": _scan([home / ".claude" / "projects"], ["*.jsonl", "*.json"]),
        "codex": _scan(
            [home / ".codex" / "sessions", home / ".codex" / "archived_sessions"],
            ["*.jsonl"],
        ),
        # Cursor exposes the least; probe a couple of conventional spots.
        "cursor": _scan(
            [home / ".cursor", home / "Library" / "Application Support" / "Cursor" / "User" / "History"],
            ["*.json", "*.jsonl"],
        ),
    }
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
