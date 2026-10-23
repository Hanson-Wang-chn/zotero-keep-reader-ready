#!/usr/bin/env python3
"""Build reproducible XPI/source ZIP archives using only Python's stdlib."""
import hashlib
import json
import subprocess
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "src"
DIST = ROOT / "dist"


def write_archive(destination, entries):
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in sorted(entries):
            info = ZipInfo(name, (2026, 10, 22, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    with ZipFile(destination) as archive:
        assert archive.testzip() is None


def validate_manifest(manifest):
    """Zotero adds mandatory fields beyond Firefox's basic manifest schema."""
    app = manifest.get("applications", {}).get("zotero", {})
    for field in ["id", "update_url", "strict_max_version"]:
        if not app.get(field):
            raise ValueError(f"applications.zotero.{field} not provided")
    update = urlparse(app["update_url"])
    if update.scheme != "https" or not update.hostname:
        raise ValueError("update_url must be an absolute HTTPS URL")
    if app.get("strict_min_version") != "10.0.6" or app["strict_max_version"] != "10.0.*":
        raise ValueError("Unexpected Zotero compatibility range")
    if manifest.get("manifest_version") != 2:
        raise ValueError("Expected manifest_version 2")


def main():
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    validate_manifest(manifest)
    version = manifest["version"]
    for filename in ["preferences.xhtml", "icon.svg"]:
        ET.parse(SOURCE / filename)
    for filename in ["bootstrap.js", "runtime.js", "preferences-controller.js", "prefs.js"]:
        subprocess.run(["node", "--check", str(SOURCE / filename)], check=True)
    DIST.mkdir(exist_ok=True)
    xpi = DIST / f"keep-reader-ready-{version}.xpi"
    source_zip = DIST / f"keep-reader-ready-{version}-source.zip"
    plugin_entries = [(p.name, p) for p in SOURCE.iterdir() if p.is_file()]
    plugin_entries += [("README.md", ROOT / "README.md"), ("LICENSE", ROOT / "LICENSE")]
    write_archive(xpi, plugin_entries)
    source_entries = [("keep-reader-ready/" + str(p.relative_to(ROOT)), p)
                      for folder in [SOURCE, ROOT / "tests"]
                      for p in folder.rglob("*") if p.is_file()]
    source_entries += [("keep-reader-ready/" + name, ROOT / name)
                       for name in ["README.md", "LICENSE", "build.py", "VALIDATION.md"]]
    write_archive(source_zip, source_entries)
    report = {
        "version": version,
        "files": [{"name": p.name, "bytes": p.stat().st_size,
                   "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                  for p in [xpi, source_zip]]
    }
    (DIST / "checksums.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
