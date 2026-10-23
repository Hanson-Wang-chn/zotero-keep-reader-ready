const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeEnvironment } = require('./helpers.cjs');

test('preferences controls update real runtime options and live status', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader();
  env.Zotero.Reader._readers.push(reader);
  env.makeWindow([reader]);
  env.manager.start();
  await env.settle();
  env.Zotero.KeepReaderReady = env.manager;
  const names = [
    'pane', 'enabled', 'tabs', 'preload', 'preload-status', 'reapply', 'status', 'version', 'errors'
  ];
  const elements = Object.fromEntries(names.map(name => ['keep-reader-ready-' + name, {
    attributes: {}, isConnected: true, listeners: {},
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, callback) { this.listeners[type] = callback; }
  }]));
  const win = {
    document: { getElementById: id => elements[id] },
    listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; }
  };
  const context = vm.createContext({ Zotero: env.Zotero, window: win });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/preferences-controller.js'), 'utf8'), context);
  win.KeepReaderReadyPreferences.init(win);
  const master = elements['keep-reader-ready-enabled'];
  const tabs = elements['keep-reader-ready-tabs'];
  const preload = elements['keep-reader-ready-preload'];
  assert.equal(master.checked, true);
  assert.equal(preload.checked, false);
  assert.match(elements['keep-reader-ready-status'].textContent, /1 \/ 1/);
  master.checked = false;
  master.listeners.command();
  assert.equal(env.manager.enabled, false);
  assert.equal(tabs.disabled, true);
  assert.equal(preload.disabled, true);
  assert.match(elements['keep-reader-ready-status'].textContent, /已关闭/);
  master.checked = true;
  master.listeners.command();
  await env.settle();
  assert.equal(tabs.disabled, false);
  tabs.checked = false;
  tabs.listeners.command();
  assert.equal(env.manager.keepTabsLoaded, false);
  preload.checked = true;
  preload.listeners.command();
  assert.equal(env.manager.preloadWholePDF, true);
  preload.checked = false;
  preload.listeners.command();
  assert.equal(env.manager.preloadWholePDF, false);
  await elements['keep-reader-ready-reapply'].listeners.command();
  assert.equal(env.manager.getStatus().protectedReaders, 1);
  assert.equal(env.manager.listeners.size, 1);
  win.KeepReaderReadyPreferences.init(win);
  assert.equal(env.manager.listeners.size, 1);
  win.listeners.unload();
  assert.equal(env.manager.listeners.size, 0);
});

test('bootstrap registers settings, cleans up on disable and rolls back registration failure', async () => {
  const root = path.join(__dirname, '../src');
  const bootstrap = fs.readFileSync(path.join(root, 'bootstrap.js'), 'utf8');
  const env = makeEnvironment();
  const registrations = [];
  env.Zotero.PreferencePanes = { register: async options => registrations.push(options) };
  env.Services.scriptloader = { loadSubScript(uri, scope) {
    vm.runInNewContext(fs.readFileSync(uri.replace('file://', ''), 'utf8'), scope);
  }};
  const context = vm.createContext({ Zotero: env.Zotero, Services: env.Services, Components: env.Components });
  vm.runInContext(bootstrap, context);
  await context.startup({ id: 'keep-reader-ready@local.invalid', version: '1.0.0', rootURI: 'file://' + root + '/' });
  assert.equal(env.Zotero.KeepReaderReady.alive, true);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, 'keep-reader-ready-preferences');
  context.shutdown();
  assert.equal(env.Zotero.KeepReaderReady, undefined);
  assert.equal(env.observers.size, 0);
  env.Zotero.PreferencePanes.register = async () => { throw new Error('register failed'); };
  await assert.rejects(context.startup({ id: 'test', rootURI: 'file://' + root + '/' }), /register failed/);
  assert.equal(env.Zotero.KeepReaderReady, undefined);
  assert.equal(env.observers.size, 0);
});
