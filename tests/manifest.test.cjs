const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
const installer = path.join(root, 'research/fetch-xulrunner-10.0.6.sh');

function installationErrors(input) {
  const errors = [];
  if (fs.existsSync(installer)) {
    const source = fs.readFileSync(installer, 'utf8');
    const block = source.match(/replace_line 'manifest = normalized.value;' '([\s\S]*?)' modules\/Extension.sys.mjs/);
    assert.ok(block, 'Pinned Zotero installer gate must be found');
    vm.runInNewContext(block[1], {
      type: 'extension', normalized: { value: structuredClone(input) },
      manifestError: message => errors.push(message)
    });
  } else {
    // Mirrors Zotero's additional pre-install checks, not generic JSON validity.
    for (const key of ['id', 'update_url', 'strict_max_version']) {
      if (!input.applications?.zotero?.[key]) errors.push('applications.zotero.' + key + ' not provided');
    }
  }
  return errors;
}

test('packaged manifest passes Zotero-specific required-field checks', () => {
  assert.deepEqual(installationErrors(manifest), []);
  assert.equal(new URL(manifest.applications.zotero.update_url).protocol, 'https:');
});

test('regression: old missing-update_url manifest reproduces pre-install rejection', () => {
  const old = structuredClone(manifest);
  delete old.applications.zotero.update_url;
  assert.deepEqual(installationErrors(old), ['applications.zotero.update_url not provided']);
});

test('build rejects both a missing and an insecure update URL', () => {
  const script = `
import json, sys
from build import validate_manifest
manifest = json.load(sys.stdin)
validate_manifest(manifest)
`;
  const run = value => spawnSync(process.env.PYTHON || 'python3', ['-c', script], {
    cwd: root, input: JSON.stringify(value), encoding: 'utf8'
  });
  assert.equal(run(manifest).status, 0);
  const missing = structuredClone(manifest);
  delete missing.applications.zotero.update_url;
  assert.notEqual(run(missing).status, 0);
  const insecure = structuredClone(manifest);
  insecure.applications.zotero.update_url = 'file:///updates.json';
  assert.notEqual(run(insecure).status, 0);
});
