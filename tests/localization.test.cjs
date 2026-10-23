const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeEnvironment } = require('./helpers.cjs');
const root = path.join(__dirname, '..');
const catalogs = Object.fromEntries(['en-US', 'zh-CN'].map(locale => [locale,
  JSON.parse(fs.readFileSync(path.join(root, 'locales', locale + '.json'), 'utf8'))]));

test('translation catalogs cover the same keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(catalogs['en-US']).sort(), Object.keys(catalogs['zh-CN']).sort());
  for (const key of Object.keys(catalogs['en-US'])) {
    const params = value => [...value.matchAll(/\{([A-Za-z]+)\}/g)].map(x => x[1]).sort();
    assert.deepEqual(params(catalogs['en-US'][key]), params(catalogs['zh-CN'][key]), key);
    assert.ok(catalogs['en-US'][key] && catalogs['zh-CN'][key]);
  }
});

for (const locale of ['en-US', 'zh-CN']) {
  test(locale + ' renders statuses and errors in the selected language with unchanged options', async () => {
    const env = makeEnvironment({ locale });
    const reader = env.makeReader();
    env.Zotero.Reader._readers.push(reader);
    env.manager.start();
    await env.settle();
    assert.equal(env.manager.getStatus().protectedReaders, 1);
    env.manager.setOption('retainBrowsedPages', true);
    assert.equal(env.values.get('extensions.zotero.keepReaderReady.preloadWholePDF'), true);
    assert.equal(env.L10n.t('cacheProgress', { ready: 5, total: 20 }),
      locale === 'en-US' ? 'Page retention: 5 / 20 page(s) cached' : '已浏览页面缓存保留：已缓存 5 / 20 页');
    assert.throws(() => env.manager.setOption('invalid', true), { message: catalogs[locale].errorUnknownOption });
    env.manager.stop();
  });
}

test('all preference template tokens and translation calls have catalog entries', () => {
  const source = fs.readdirSync(path.join(root, 'src')).filter(x => /\.(js|xhtml)$/.test(x))
    .map(x => fs.readFileSync(path.join(root, 'src', x), 'utf8')).join('\n');
  const keys = [...source.matchAll(/(?:\.t\(|\bt\()"([A-Za-z]+)"/g)].map(x => x[1]);
  keys.push(...[...source.matchAll(/\{\{([A-Za-z]+)\}\}/g)].map(x => x[1]));
  for (const key of keys) assert.equal(typeof catalogs['en-US'][key], 'string', key);
});
