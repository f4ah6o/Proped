#!/usr/bin/env python3
"""Fail when private security disclosure material enters tracked public paths."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

for manifest in sorted((ROOT / "external" / "manifests").glob("*.json")):
    data = json.loads(manifest.read_text())
    visibility = data.get("findingVisibility")
    if visibility == "private-security":
        errors.append(
            f"{manifest.relative_to(ROOT)} is private-security; move its manifest, "
            "adapter, and evidence below .private/disclosures/ before committing"
        )
    elif visibility != "public-bug":
        errors.append(
            f"{manifest.relative_to(ROOT)} has unsupported findingVisibility={visibility!r}"
        )

tracked_private = subprocess.run(
    ["git", "ls-files", ".private"],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
).stdout.splitlines()
if tracked_private:
    errors.append("tracked files exist below .private/: " + ", ".join(tracked_private))

ignored_probe = subprocess.run(
    ["git", "check-ignore", "-q", ".private/disclosures/probe/summary.json"],
    cwd=ROOT,
).returncode
if ignored_probe != 0:
    errors.append(".private/disclosures is not ignored by git")

if errors:
    print("public disclosure check failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("public disclosure check passed")
