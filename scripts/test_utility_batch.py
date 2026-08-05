from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import utility_batch


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(cwd), *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout.strip()


class UtilityBatchTests(unittest.TestCase):
    def test_revision_diff_reports_only_tracked_source_changes(self) -> None:
        with tempfile.TemporaryDirectory() as root_text:
            root = Path(root_text)
            upstream = root / "upstream"
            upstream.mkdir()
            git(upstream, "init", "-b", "main")
            git(upstream, "config", "user.email", "test@example.com")
            git(upstream, "config", "user.name", "Test")
            (upstream / "app.mbt").write_text("fn main { }\n")
            (upstream / "README.md").write_text("one\n")
            git(upstream, "add", ".")
            git(upstream, "commit", "-m", "initial")
            pinned = git(upstream, "rev-parse", "HEAD")

            checkout_root = root / "checkouts"
            checkout = checkout_root / "owner__repo"
            subprocess.run(
                ["git", "clone", str(upstream), str(checkout)], check=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            git(checkout, "remote", "set-head", "origin", "main")

            report = {
                "entries": [{
                    "repository": "owner/repo",
                    "revision": pinned,
                    "paths": ["app.mbt"],
                    "classification": "supported",
                }]
            }
            errors, changes = utility_batch.revision_diff_report(
                report, checkout_root, fetch=False
            )
            self.assertEqual(errors, [])
            self.assertFalse(changes[0]["changed"])

            (upstream / "README.md").write_text("two\n")
            git(upstream, "add", ".")
            git(upstream, "commit", "-m", "docs")
            git(checkout, "fetch", "origin")
            errors, changes = utility_batch.revision_diff_report(
                report, checkout_root, fetch=False
            )
            self.assertEqual(errors, [])
            self.assertTrue(changes[0]["changed"])
            self.assertFalse(changes[0]["sourceChanged"])
            self.assertEqual(changes[0]["changedPaths"], [])

            (upstream / "app.mbt").write_text("fn main { println(1) }\n")
            git(upstream, "add", ".")
            git(upstream, "commit", "-m", "source")
            git(checkout, "fetch", "origin")
            errors, changes = utility_batch.revision_diff_report(
                report, checkout_root, fetch=False
            )
            self.assertEqual(errors, [])
            change = changes[0]
            self.assertTrue(change["sourceChanged"])
            self.assertEqual(change["changedPaths"], ["app.mbt"])
            self.assertEqual(change["commitCount"], 2)
            self.assertRegex(change["remoteSourceSha256"], r"^[0-9a-f]{64}$")

    def test_validate_rejects_vendored_unknown_license(self) -> None:
        report = json.loads(utility_batch.DEFAULT_REPORT.read_text())
        report["entries"][0]["license"] = "unknown"
        report["entries"][0]["sourceVendored"] = True
        errors = utility_batch.validate_report(report)
        self.assertTrue(any("unknown-license source" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
