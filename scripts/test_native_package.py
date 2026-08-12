#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUFFIX = ".exe" if platform.system().lower() == "windows" else ""


def run(command: list[str], *, cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, check=False, capture_output=True, text=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    binary = ROOT / "target" / "release" / f"proped{SUFFIX}"
    if not binary.is_file():
        raise SystemExit(f"release binary missing: {binary}")

    with tempfile.TemporaryDirectory(prefix="proped-native-package-") as raw_tmp:
        tmp = Path(raw_tmp)
        dist = tmp / "dist"
        packaged = run(
            [
                "python3" if os.name != "nt" else "python",
                "scripts/package_native_cli.py",
                "--output",
                str(dist),
                "--allow-dev",
            ]
        )
        if packaged.returncode != 0:
            raise SystemExit(packaged.stderr or packaged.stdout)
        report = json.loads(packaged.stdout)
        archive = Path(report["archive"])
        checksum = Path(report["checksum"])
        if sha256(archive) != report["sha256"]:
            raise SystemExit("archive checksum does not match package report")
        checksum_text = checksum.read_text().strip()
        if not checksum_text.startswith(f'{report["sha256"]}  '):
            raise SystemExit("checksum sidecar does not match package report")

        extract_root = tmp / "extract"
        extract_root.mkdir()
        with tarfile.open(archive, "r:gz") as tar:
            members = tar.getmembers()
            for member in members:
                destination = (extract_root / member.name).resolve()
                if extract_root.resolve() not in destination.parents and destination != extract_root.resolve():
                    raise SystemExit(f"archive contains unsafe path: {member.name}")
            tar.extractall(extract_root, filter="data")

        roots = [entry for entry in extract_root.iterdir() if entry.is_dir()]
        if len(roots) != 1:
            raise SystemExit(f"expected one package root, found {len(roots)}")
        package_root = roots[0]
        packaged_binary = package_root / "bin" / f"proped{SUFFIX}"
        runtime_root = package_root / "lib" / "proped"
        for required in [
            packaged_binary,
            runtime_root / "scripts" / "proped.mjs",
            runtime_root / "protocol" / "web-project-inspect.mjs",
            runtime_root / "web" / "playwright-browser" / "managed-browser-runtime.mjs",
        ]:
            if not required.is_file():
                raise SystemExit(f"packaged runtime file missing: {required}")

        version = run([str(packaged_binary), "-V"], cwd=tmp)
        if version.returncode != 0 or not version.stdout.startswith("proped "):
            raise SystemExit(version.stderr or version.stdout)

        project = tmp / "fixture"
        (project / "src").mkdir(parents=True)
        (project / "package.json").write_text(
            json.dumps(
                {
                    "name": "native-package-fixture",
                    "packageManager": "npm@11.0.0",
                    "scripts": {"build": "vite build", "preview": "vite preview"},
                    "dependencies": {"vite": "8.0.0"},
                }
            )
            + "\n"
        )
        (project / "package-lock.json").write_text("{}\n")
        (project / "src" / "app.js").write_text("localStorage.setItem('ready','yes');\n")
        inspection = run([str(packaged_binary), "web", "inspect", str(project), "--json"], cwd=tmp)
        if inspection.returncode != 0:
            raise SystemExit(inspection.stderr or inspection.stdout)
        inspection_report = json.loads(inspection.stdout)
        if inspection_report["framework"]["name"] != "vite":
            raise SystemExit(f"unexpected packaged inspection: {inspection_report['framework']}")

        if any("node_modules" in Path(member.name).parts for member in members):
            raise SystemExit("release archive unexpectedly embeds node_modules")

        doctor = run([str(packaged_binary), "doctor", "--json"], cwd=tmp)
        if doctor.returncode not in {0, 2}:
            raise SystemExit(f"packaged doctor returned an uncontrolled status: {doctor.stdout} {doctor.stderr}")
        doctor_report = json.loads(doctor.stdout)
        if doctor.returncode == 0:
            if not doctor_report.get("webRuntime", {}).get("managedBrowser", {}).get("executableReady"):
                raise SystemExit(f"successful packaged doctor lacks managed-browser readiness: {doctor_report}")
        elif doctor_report.get("diagnostic", {}).get("code") != "product_runtime_probe_failed":
            raise SystemExit(f"packaged doctor did not return a controlled runtime diagnostic: {doctor_report}")

        print(
            json.dumps(
                {
                    "ok": True,
                    "runtime": "native-package-test",
                    "version": report["version"],
                    "platform": report["platform"],
                    "arch": report["arch"],
                    "checksum": True,
                    "installedLayoutDiscovery": True,
                    "webInspect": "vite",
                    "doctorControlled": True,
                    "nodeModulesEmbedded": False,
                },
                separators=(",", ":"),
            )
        )


if __name__ == "__main__":
    main()
