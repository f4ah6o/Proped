#!/usr/bin/env python3
"""Validate and refresh the pinned public Rabbita utility-app batch.

This script never writes to upstream repositories. `validate` works from the
committed report and vendored fixtures; `inspect` additionally verifies local
read-only checkouts at their pinned revisions and recomputes source hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPORT = ROOT / "external" / "utility-apps.json"
CLASSIFICATIONS = {"supported", "partial", "unsupported"}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def source_sha256(paths: Sequence[Path]) -> str:
    if not paths:
        raise ValueError("at least one source path is required")
    normalized = [path.resolve() for path in paths]
    for path in normalized:
        if not path.is_file():
            raise ValueError(f"source path is not a file: {path}")
    if len(normalized) == 1:
        return hashlib.sha256(normalized[0].read_bytes()).hexdigest()
    digest = hashlib.sha256()
    common = Path(os.path.commonpath([str(path.parent) for path in normalized]))
    for path in sorted(normalized, key=lambda item: item.as_posix()):
        label = path.relative_to(common).as_posix()
        digest.update(label.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def checkout_name(repository: str) -> str:
    return repository.replace("/", "__")


def run_git(path: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(path), *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout.strip()




def remote_head(checkout: Path) -> str:
    """Resolve origin's default branch head without changing the checkout."""
    run_git(checkout, "remote", "set-head", "origin", "--auto")
    symbolic = run_git(checkout, "symbolic-ref", "refs/remotes/origin/HEAD")
    return run_git(checkout, "rev-parse", symbolic)


def revision_diff_report(
    report: dict[str, Any], checkout_root: Path, *, fetch: bool
) -> tuple[list[str], list[dict[str, Any]]]:
    """Compare every pinned revision with origin's current default branch head.

    The operation is read-only with respect to upstream repositories and never
    changes the detached worktree used by `inspect`. When `fetch` is true only
    remote-tracking refs are updated.
    """
    errors: list[str] = []
    changes: list[dict[str, Any]] = []
    for entry in report["entries"]:
        repository = entry["repository"]
        checkout = checkout_root / checkout_name(repository)
        item: dict[str, Any] = {
            "repository": repository,
            "pinnedRevision": entry["revision"],
            "changed": False,
            "sourceChanged": False,
            "changedPaths": [],
            "commitCount": 0,
        }
        if not (checkout / ".git").is_dir():
            errors.append(f"{repository}: checkout missing: {checkout}")
            changes.append(item)
            continue
        try:
            if fetch:
                run_git(checkout, "fetch", "--prune", "origin")
            head = remote_head(checkout)
            item["remoteRevision"] = head
            item["changed"] = head != entry["revision"]
            if item["changed"]:
                item["commitCount"] = int(
                    run_git(checkout, "rev-list", "--count", f"{entry['revision']}..{head}")
                )
                names = run_git(
                    checkout, "diff", "--name-only", entry["revision"], head, "--", *entry["paths"]
                )
                changed_paths = [line for line in names.splitlines() if line]
                item["changedPaths"] = changed_paths
                item["sourceChanged"] = bool(changed_paths)
                if item["sourceChanged"]:
                    with tempfile.TemporaryDirectory(prefix="utility-batch-diff-") as temp_dir:
                        materialized: list[Path] = []
                        root = Path(temp_dir)
                        for relative in entry["paths"]:
                            output = root / relative
                            output.parent.mkdir(parents=True, exist_ok=True)
                            try:
                                blob = subprocess.run(
                                    ["git", "-C", str(checkout), "show", f"{head}:{relative}"],
                                    check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                ).stdout
                            except subprocess.CalledProcessError:
                                continue
                            output.write_bytes(blob)
                            materialized.append(output)
                        if materialized:
                            item["remoteSourceSha256"] = source_sha256(materialized)
            changes.append(item)
        except (subprocess.CalledProcessError, ValueError) as error:
            detail = error.stderr.strip() if isinstance(error, subprocess.CalledProcessError) else str(error)
            errors.append(f"{repository}: revision diff failed: {detail}")
            changes.append(item)
    return errors, changes

def load_report(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_report(report: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if report.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if report.get("upstreamWritePolicy") != "read-only":
        errors.append("upstreamWritePolicy must be read-only")
    entries = report.get("entries")
    if not isinstance(entries, list) or not entries:
        return errors + ["entries must be a non-empty array"]
    repositories: set[str] = set()
    for index, entry in enumerate(entries):
        prefix = f"entries[{index}]"
        repository = entry.get("repository")
        if not isinstance(repository, str) or repository.count("/") != 1:
            errors.append(f"{prefix}.repository must be owner/name")
            continue
        if repository in repositories:
            errors.append(f"duplicate repository: {repository}")
        repositories.add(repository)
        if not HEX40.fullmatch(str(entry.get("revision", ""))):
            errors.append(f"{repository}: revision must be lowercase 40-hex")
        if not HEX64.fullmatch(str(entry.get("sourceSha256", ""))):
            errors.append(f"{repository}: sourceSha256 must be lowercase 64-hex")
        if entry.get("classification") not in CLASSIFICATIONS:
            errors.append(f"{repository}: invalid classification")
        paths = entry.get("paths")
        if not isinstance(paths, list) or not paths or not all(isinstance(p, str) for p in paths):
            errors.append(f"{repository}: paths must be a non-empty string array")
        if not isinstance(entry.get("rationale"), str) or not entry["rationale"].strip():
            errors.append(f"{repository}: rationale is required")
        source_vendored = entry.get("sourceVendored")
        if not isinstance(source_vendored, bool):
            errors.append(f"{repository}: sourceVendored must be boolean")
        if entry.get("license") == "unknown" and source_vendored:
            errors.append(f"{repository}: unknown-license source must not be vendored")
        if entry.get("classification") == "supported":
            if entry.get("genericExecution") != report.get("supportedTarget"):
                errors.append(f"{repository}: supported target lacks generic execution")
            fixtures = entry.get("fixturePaths")
            if not isinstance(fixtures, list) or not fixtures:
                errors.append(f"{repository}: supported target requires fixturePaths")
    expected = {
        "chnlkw/moonxi_board",
        "xz-xuezhe/moonblox",
        "CAIMEOX/symweb",
        "CAIMEOX/calculus-singularity",
        "bobzhang/issues",
        "bobzhang/games",
        "beso1225/fullstack_trial_moonbit",
        "tekihei2317/moonbit-rpc-poc",
        "moonbitlang/OSC2026",
        "moonbit-community/proton",
    }
    missing = sorted(expected - repositories)
    if missing:
        errors.append(f"missing repositories: {', '.join(missing)}")
    return errors


def validate_fixtures(report: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for entry in report["entries"]:
        if entry.get("classification") != "supported":
            continue
        fixture_paths = [ROOT / value for value in entry.get("fixturePaths", [])]
        try:
            actual = source_sha256(fixture_paths)
        except ValueError as error:
            errors.append(f"{entry['repository']}: {error}")
            continue
        expected = entry.get("fixtureSha256", entry["sourceSha256"])
        if actual != expected:
            errors.append(
                f"{entry['repository']}: fixture hash mismatch "
                f"expected={expected} actual={actual}"
            )
    return errors


def inspect_checkouts(report: dict[str, Any], checkout_root: Path) -> tuple[list[str], list[dict[str, Any]]]:
    errors: list[str] = []
    results: list[dict[str, Any]] = []
    for entry in report["entries"]:
        repository = entry["repository"]
        checkout = checkout_root / checkout_name(repository)
        item: dict[str, Any] = {
            "repository": repository,
            "classification": entry["classification"],
            "checkout": str(checkout),
            "revisionMatches": False,
            "sourceHashMatches": False,
        }
        if not (checkout / ".git").is_dir():
            errors.append(f"{repository}: checkout missing: {checkout}")
            results.append(item)
            continue
        try:
            revision = run_git(checkout, "rev-parse", "HEAD")
        except subprocess.CalledProcessError as error:
            errors.append(f"{repository}: git rev-parse failed: {error.stderr.strip()}")
            results.append(item)
            continue
        item["actualRevision"] = revision
        item["revisionMatches"] = revision == entry["revision"]
        if not item["revisionMatches"]:
            errors.append(
                f"{repository}: revision mismatch expected={entry['revision']} actual={revision}"
            )
        source_paths = [checkout / value for value in entry["paths"]]
        try:
            actual_hash = source_sha256(source_paths)
        except ValueError as error:
            errors.append(f"{repository}: {error}")
            results.append(item)
            continue
        item["actualSourceSha256"] = actual_hash
        item["sourceHashMatches"] = actual_hash == entry["sourceSha256"]
        if not item["sourceHashMatches"]:
            errors.append(
                f"{repository}: source hash mismatch expected={entry['sourceSha256']} "
                f"actual={actual_hash}"
            )
        combined = "\n".join(path.read_text(encoding="utf-8") for path in source_paths)
        item["boundaries"] = {
            "rabbita": "@rabbita" in combined or "moonbit-community/rabbita" in combined,
            "model": "struct Model" in combined or "Model::" in combined,
            "message": "enum Msg" in combined,
            "update": "fn update" in combined or "::update(" in combined,
            "view": "fn view" in combined or "::view(" in combined,
            "subscription": "@sub." in combined or "fn subscriptions" in combined,
            "command": "@cmd." in combined or "@rabbita.Cmd" in combined,
        }
        results.append(item)
    return errors, results


def sync_checkouts(report: dict[str, Any], checkout_root: Path) -> list[str]:
    errors: list[str] = []
    checkout_root.mkdir(parents=True, exist_ok=True)
    for entry in report["entries"]:
        repository = entry["repository"]
        checkout = checkout_root / checkout_name(repository)
        try:
            if not (checkout / ".git").is_dir():
                subprocess.run(
                    [
                        "git",
                        "clone",
                        "--filter=blob:none",
                        "--no-checkout",
                        f"https://github.com/{repository}.git",
                        str(checkout),
                    ],
                    check=True,
                    text=True,
                )
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(checkout),
                    "fetch",
                    "--depth=1",
                    "origin",
                    entry["revision"],
                ],
                check=True,
                text=True,
            )
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(checkout),
                    "checkout",
                    "--detach",
                    entry["revision"],
                ],
                check=True,
                text=True,
            )
        except subprocess.CalledProcessError as error:
            errors.append(f"{repository}: sync failed with exit {error.returncode}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["validate", "inspect", "sync", "diff"])
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument(
        "--checkout-root",
        type=Path,
        default=ROOT / ".tmp" / "rabbita-usage-scan",
    )
    args = parser.parse_args()
    report_path = args.report.resolve()
    report = load_report(report_path)
    errors = validate_report(report)
    errors.extend(validate_fixtures(report))
    inspections: list[dict[str, Any]] = []
    revision_changes: list[dict[str, Any]] = []
    checkout_root = args.checkout_root.resolve()
    if args.command == "sync":
        errors.extend(sync_checkouts(report, checkout_root))
    if args.command in {"inspect", "sync"}:
        checkout_errors, inspections = inspect_checkouts(report, checkout_root)
        errors.extend(checkout_errors)
    if args.command == "diff":
        diff_errors, revision_changes = revision_diff_report(report, checkout_root, fetch=True)
        errors.extend(diff_errors)
    payload = {
        "ok": not errors,
        "command": args.command,
        "report": str(report_path),
        "entryCount": len(report.get("entries", [])),
        "supportedCount": sum(
            1 for entry in report.get("entries", []) if entry.get("classification") == "supported"
        ),
        "upstreamWritePerformed": False,
        "errors": errors,
        "inspections": inspections,
        "revisionChanges": revision_changes,
        "changedCount": sum(1 for item in revision_changes if item.get("changed")),
        "sourceChangedCount": sum(1 for item in revision_changes if item.get("sourceChanged")),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
