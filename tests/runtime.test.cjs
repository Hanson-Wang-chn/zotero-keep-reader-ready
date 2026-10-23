const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnvironment } = require('./helpers.cjs');

async function fixture(options) {
  const env = makeEnvironment(options);
  env.reader = env.makeReader();
  env.Zotero.Reader._readers.push(env.reader);
  env.win = env.makeWindow([env.reader]);
  env.manager.start();
  await env.settle();
  return env;
}

test('native baseline trims immediately and schedules a 60-second suspension', () => {
  const env = makeEnvironment();
  const reader = env.makeReader();
  reader.setHidden(true);
  assert.equal(reader.calls.trim, 1);
  assert.equal([...reader.timers.values()][0].ms, 60000);
  reader.fireTimers();
  assert.equal(reader._internalReader._suspended, true);
});

test('existing PDF keeps cached pages after hiding without periodic timers', async () => {
  const env = await fixture();
  env.reader.setHidden(true);
  env.reader.fireTimers();
  assert.equal(env.reader.calls.trim, 0);
  assert.equal(env.reader.timers.size, 0);
  assert.equal(env.reader._internalReader._suspended, false);
  assert.equal(env.manager.getStatus().protectedReaders, 1);
});

test('enabling cancels an already scheduled suspension', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader({ hidden: true });
  reader._internalReader._handleVisibilityChange();
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  await env.settle();
  assert.equal(reader.timers.size, 0);
  reader.fireTimers();
  assert.equal(reader._internalReader._suspended, false);
});

test('enabling resumes a suspended reader once without repeated rendering', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader();
  reader._internalReader._suspended = true;
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  await env.settle();
  await env.manager.applyToAll();
  assert.deepEqual(reader.calls.suspend, [false]);
  assert.equal(env.exportCount, 1);
});

test('new reader is protected after opening; open returns exactly the same promise', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader();
  const expected = Promise.resolve(reader);
  env.Zotero.Reader.open = () => { env.Zotero.Reader._readers.push(reader); return expected; };
  env.manager.start();
  const actual = env.Zotero.Reader.open();
  assert.equal(actual, expected);
  await env.settle();
  reader.setHidden(true);
  assert.equal(reader.calls.trim, 0);
  assert.equal(env.manager.getStatus().protectedReaders, 1);
});

test('a newly created reader waits for iframe initialization', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader({ delayed: true });
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  await env.settle();
  assert.equal(env.exportCount, 0);
  reader.ready();
  await env.settle();
  assert.equal(env.exportCount, 1);
});

test('turning off while initialization is pending prevents a late patch', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader({ delayed: true });
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  env.manager.setOption('enabled', false);
  reader.ready();
  await env.settle();
  assert.equal(env.exportCount, 0);
});

test('master switch restores inherited handler and native hidden-page timer', async () => {
  const env = await fixture();
  env.reader.setHidden(true);
  env.manager.setOption('enabled', false);
  assert.equal(Object.hasOwn(env.reader._internalReader, '_handleVisibilityChange'), false);
  assert.equal(env.reader.calls.trim, 1);
  assert.equal(env.reader.timers.size, 1);
  assert.equal(env.manager.getStatus().protectedReaders, 0);
});

test('reenabling protects existing readers and cancels the native timer again', async () => {
  const env = await fixture();
  env.reader.setHidden(true);
  env.manager.setOption('enabled', false);
  env.manager.setOption('enabled', true);
  await env.settle();
  assert.equal(env.reader.timers.size, 0);
  assert.equal(env.manager.getStatus().protectedReaders, 1);
});

test('an original own-property descriptor is restored exactly', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader();
  const original = reader.prototype._handleVisibilityChange;
  const descriptor = { value: original, configurable: true, writable: true, enumerable: true };
  Object.defineProperty(reader._internalReader, '_handleVisibilityChange', descriptor);
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  await env.settle();
  env.manager.stop();
  assert.deepEqual(Object.getOwnPropertyDescriptor(reader._internalReader, '_handleVisibilityChange'), descriptor);
});

test('EPUB readers are not modified', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader({ type: 'epub' });
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  await env.settle();
  assert.equal(env.exportCount, 0);
});

test('unknown internal API fails safely and exposes an error', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader();
  reader._internalReader = {};
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  await env.settle();
  assert.equal(env.manager.getStatus().protectedReaders, 0);
  assert.equal(env.errors.length, 1);
});

test('reader closed during initialization is not retained or patched', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader({ delayed: true });
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  env.Zotero.Reader._readers.length = 0;
  reader._isUninitialized = true;
  reader.ready();
  await env.settle();
  assert.equal(env.exportCount, 0);
});

test('automatic cleanup keeps more than five PDF tabs loaded', async () => {
  const env = makeEnvironment();
  const readers = Array.from({ length: 8 }, (_, i) => env.makeReader({ id: 'p' + i }));
  env.Zotero.Reader._readers.push(...readers);
  const win = env.makeWindow(readers);
  env.manager.start();
  await env.settle();
  win.Zotero_Tabs.unloadUnusedTabs();
  assert.deepEqual(win.unloaded, []);
});

test('manual unloading and closing are not blocked', async () => {
  const env = await fixture();
  env.win.Zotero_Tabs.unload(env.reader.tabID);
  assert.deepEqual(env.win.unloaded, [env.reader.tabID]);
});

test('automatic cleanup still unloads non-PDF types', async () => {
  const env = makeEnvironment();
  const pdf = env.makeReader({ id: 'pdf' });
  const epub = env.makeReader({ id: 'epub', type: 'epub' });
  const note = env.makeReader({ id: 'note', type: 'note' });
  env.Zotero.Reader._readers.push(pdf, epub, note);
  const win = env.makeWindow([pdf, epub, note]);
  // These are older than 24 h in the pinned cleanup algorithm.
  win.Zotero_Tabs.unloadUnusedTabs = function () {
    for (const tab of this._tabs) this.unload(tab.id);
  };
  env.manager.start();
  await env.settle();
  win.Zotero_Tabs.unloadUnusedTabs();
  assert.deepEqual(win.unloaded, ['epub', 'note']);
});

test('tab-unload setting can be disabled independently of cache protection', async () => {
  const env = await fixture();
  const original = env.manager.windows.get(env.win).original;
  env.manager.setOption('keepTabsLoaded', false);
  assert.equal(env.win.Zotero_Tabs.unloadUnusedTabs, original);
  env.reader.setHidden(true);
  assert.equal(env.reader.calls.trim, 0);
});

test('automatic cleanup restores temporary interception even if cleanup throws', async () => {
  const env = makeEnvironment();
  const win = env.makeWindow();
  win.Zotero_Tabs.unloadUnusedTabs = function () { throw new Error('cleanup error'); };
  const originalUnload = win.Zotero_Tabs.unload;
  env.manager.start();
  assert.throws(() => win.Zotero_Tabs.unloadUnusedTabs(), /cleanup error/);
  assert.equal(win.Zotero_Tabs.unload, originalUnload);
});

test('disabling restores behavior even after another plugin wraps the handler', async () => {
  const env = await fixture();
  const wrapped = env.reader._internalReader._handleVisibilityChange;
  const otherPlugin = function (...args) { return Reflect.apply(wrapped, this, args); };
  env.reader._internalReader._handleVisibilityChange = otherPlugin;
  env.reader.setHidden(true);
  env.manager.setOption('enabled', false);
  assert.equal(env.reader._internalReader._handleVisibilityChange, otherPlugin);
  assert.equal(env.reader.calls.trim, 1);
});

test('shutdown restores hooks and removes observers and UI subscriptions', async () => {
  const env = await fixture();
  const originalOpen = env.manager.openRecord.original;
  const originalCleanup = env.manager.windows.get(env.win).original;
  env.manager.subscribe(() => {});
  env.manager.stop();
  assert.equal(env.Zotero.Reader.open, originalOpen);
  assert.equal(env.win.Zotero_Tabs.unloadUnusedTabs, originalCleanup);
  assert.equal(env.observers.size, 0);
  assert.equal(env.manager.listeners.size, 0);
  assert.equal(env.manager.windows.size, 0);
});

test('shutdown prevents initialization callbacks from reapplying a patch', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader({ delayed: true });
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  env.manager.stop();
  reader.ready();
  await env.settle();
  assert.equal(env.exportCount, 0);
});

test('start and repeated apply calls do not stack patches', async () => {
  const env = await fixture();
  const open = env.Zotero.Reader.open;
  env.manager.start();
  await env.manager.applyToAll();
  await env.manager.applyToAll();
  assert.equal(env.Zotero.Reader.open, open);
  assert.equal(env.exportCount, 1);
  assert.equal(env.observers.size, 1);
});

test('new main windows receive and release their automatic-unload guard', async () => {
  const env = await fixture();
  const win = env.makeWindow();
  const original = win.Zotero_Tabs.unloadUnusedTabs;
  env.manager.addWindow(win);
  assert.notEqual(win.Zotero_Tabs.unloadUnusedTabs, original);
  env.manager.removeWindow(win);
  assert.equal(win.Zotero_Tabs.unloadUnusedTabs, original);
});

test('starting with the master setting off leaves reader behavior unchanged', async () => {
  const env = await fixture({ enabled: false });
  assert.equal(env.exportCount, 0);
  env.reader.setHidden(true);
  assert.equal(env.reader.calls.trim, 1);
});

test('a failing cross-compartment export does not change the reader', async () => {
  const env = makeEnvironment();
  const reader = env.makeReader();
  env.Components.utils.exportFunction = () => { throw new Error('export failed'); };
  env.Zotero.Reader._readers.push(reader);
  env.manager.start();
  await env.settle();
  assert.equal(Object.hasOwn(reader._internalReader, '_handleVisibilityChange'), false);
  assert.match(env.errors[0], /export failed/);
});

test('open errors reach the caller and do not leave an unhandled rejection', async () => {
  const env = makeEnvironment();
  env.Zotero.Reader.open = async () => { throw new Error('open failed'); };
  env.manager.start();
  await assert.rejects(env.Zotero.Reader.open(), /open failed/);
  await env.settle();
  assert.equal(env.exportCount, 0);
});

test('invalid setting keys are rejected', async () => {
  const env = await fixture();
  assert.throws(() => env.manager.setOption('unrelated.pref', true), /Unknown option/);
});
