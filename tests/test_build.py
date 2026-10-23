"""Integration checks for the actual release archives (stdlib unittest)."""
import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

class ReleaseBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, 'build.py'], cwd=ROOT, check=True, capture_output=True)
        cls.version = json.loads((ROOT/'src/manifest.json').read_text())['version']

    def test_languages_have_identical_executable_behavior(self):
        prefix = 'keep-reader-ready-' + self.version
        with ZipFile(ROOT/'dist'/(prefix+'-en-US.xpi')) as en, ZipFile(ROOT/'dist'/(prefix+'-zh-CN.xpi')) as zh:
            self.assertEqual(en.namelist(), zh.namelist())
            for name in en.namelist():
                if name not in ['manifest.json', 'preferences.xhtml', 'locale-data.js']:
                    self.assertEqual(en.read(name), zh.read(name), name)
            for archive, locale in [(en,'en-US'), (zh,'zh-CN')]:
                manifest = json.loads(archive.read('manifest.json'))
                self.assertEqual(manifest['applications']['zotero']['id'], 'keep-reader-ready@local.invalid')
                self.assertTrue(manifest['applications']['zotero']['update_url'].endswith('/'+locale+'.json'))
                pane = archive.read('preferences.xhtml').decode()
                self.assertNotIn('{{', pane)
                ET.fromstring(pane)
                self.assertEqual('keep-reader-ready-preload"' in pane, self.version != '1.1.1')
            self.assertIn('Retain rendered pages as you read', en.read('preferences.xhtml').decode())
            self.assertIn('保留已浏览页面的渲染缓存', zh.read('preferences.xhtml').decode())

    def test_build_is_reproducible_and_checksums_match(self):
        before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'dist').glob('*.xpi')}
        subprocess.run([sys.executable, 'build.py'], cwd=ROOT, check=True, capture_output=True)
        self.assertEqual(before, {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'dist').glob('*.xpi')})
        for line in (ROOT/'dist/SHA256SUMS.txt').read_text().splitlines():
            digest, name = line.split('  ')
            self.assertEqual(digest, hashlib.sha256((ROOT/'dist'/name).read_bytes()).hexdigest())

if __name__ == '__main__':
    unittest.main()
