#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "external_harness", ROOT / "scripts" / "external_harness.py"
)
assert SPEC is not None and SPEC.loader is not None
external_harness = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(external_harness)


class ExternalHarnessTests(unittest.TestCase):
    def test_all_tracked_manifests_validate(self) -> None:
        manifests = sorted((ROOT / "external" / "manifests").glob("*.json"))
        self.assertGreaterEqual(len(manifests), 8)
        for path in manifests:
            with self.subTest(path=path.name):
                result = external_harness.validate_path(path)
                self.assertTrue(result["ok"], result["errors"])

    def test_duplicate_keys_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.json"
            path.write_text('{"id":"one","id":"two"}', encoding="utf-8")
            with self.assertRaises(external_harness.DuplicateKeyError):
                external_harness.load_json(path)

    def test_action_scaffold_covers_payloadless_and_small_scalars(self) -> None:
        source = """
        enum Mode {
          Read
          Write
        }
        enum Msg {
          NoOp
          Toggle(Bool)
          SetCount(Int)
          SetName(String)
          SetMaybe(Option[Int])
          SetMode(Mode)
          Unsupported(Bytes)
        }
        """
        result = external_harness.generate_action_scaffold(source, max_actions=128)
        constructors = {action["constructor"] for action in result["actions"]}
        self.assertIn("NoOp", constructors)
        self.assertIn("Toggle(false)", constructors)
        self.assertIn("Toggle(true)", constructors)
        self.assertIn("SetCount(-2147483648)", constructors)
        self.assertIn("SetCount(2147483647)", constructors)
        self.assertIn('SetName("日本語")', constructors)
        self.assertIn("SetMaybe(None)", constructors)
        self.assertIn("SetMaybe(Some(1))", constructors)
        self.assertIn("SetMode(Read)", constructors)
        self.assertIn("SetMode(Write)", constructors)
        self.assertEqual(
            result["skipped"],
            [
                {
                    "variant": "Unsupported",
                    "reason": "unsupported payload type",
                    "types": ["Bytes"],
                }
            ],
        )
        action_ids = [action["actionId"] for action in result["actions"]]
        self.assertEqual(len(action_ids), len(set(action_ids)))

    def test_scaffold_is_bounded_and_deterministic(self) -> None:
        source = "enum Msg { Pair(Int, String) }"
        first = external_harness.generate_action_scaffold(source, max_actions=7)
        second = external_harness.generate_action_scaffold(source, max_actions=7)
        self.assertEqual(first, second)
        self.assertEqual(len(first["actions"]), 7)
        self.assertTrue(first["truncated"])

    def test_single_source_hash_matches_plain_sha256(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.mbt"
            source.write_bytes(b"enum Msg { NoOp }\n")
            self.assertEqual(
                external_harness.source_sha256([source]),
                hashlib.sha256(source.read_bytes()).hexdigest(),
            )

    def test_multi_source_hash_is_order_independent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "a.mbt"
            second = Path(directory) / "b.mbt"
            first.write_text("a", encoding="utf-8")
            second.write_text("b", encoding="utf-8")
            self.assertEqual(
                external_harness.source_sha256([first, second]),
                external_harness.source_sha256([second, first]),
            )

    def test_update_is_preview_only_without_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.mbt"
            source.write_text("enum Msg { NoOp }\n", encoding="utf-8")
            manifest_path = Path(directory) / "manifest.json"
            manifest = {
                "id": "fixture",
                "repository": "owner/repo",
                "revision": "0" * 40,
                "license": "MIT",
                "packages": ["app"],
                "entryPoints": {
                    "model": "Model",
                    "message": "Msg",
                    "update": "update",
                    "view": "view",
                },
                "strategy": "pure",
                "effectPolicy": "none",
                "sourceSha256": "0" * 64,
                "properties": ["panic-free"],
                "findingVisibility": "public-bug",
            }
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            before = manifest_path.read_bytes()
            result = external_harness.update_manifest(
                manifest_path, "1" * 40, [source], None
            )
            self.assertEqual(before, manifest_path.read_bytes())
            self.assertEqual(result["newRevision"], "1" * 40)
            self.assertEqual(
                result["newSourceSha256"],
                hashlib.sha256(source.read_bytes()).hexdigest(),
            )


if __name__ == "__main__":
    unittest.main()
