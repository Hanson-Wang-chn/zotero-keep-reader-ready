const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtimeSource = fs.readFileSync(path.join(__dirname, '../src/runtime.js'), 'utf8');
const enginePath = path.join(__dirname, '../research/zotero-engine-5802d14.js');
const tabsPath = path.join(__dirname, '../research/zotero-tabs-10.0.6.js');

function makeEnvironment({ enabled = true, keepTabsLoaded = true, retainBrowsedPages = false, locale = "zh-CN" } = {}) {
  const values = new Map([
    ['extensions.zotero.keepReaderReady.enabled', enabled],
    ['extensions.zotero.keepReaderReady.keepTabsLoaded', keepTabsLoaded],
    ['extensions.zotero.keepReaderReady.preloadWholePDF', retainBrowsedPages]
  ]);
  const observers = new Set();
  const errors = [];
  const Services = { prefs: {
    getBoolPref: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    setBoolPref(key, value) {
      values.set(key, value);
      for (const observer of observers) observer.observe(null, 'nsPref:changed', key);
    },
    addObserver: (_, observer) => observers.add(observer),
    removeObserver: (_, observer) => observers.delete(observer)
  }};
  const Zotero = {
    version: '10.0.6',
    debug() {},
    logError: error => errors.push(String(error.message || error)),
    getMainWindows: () => windows,
    Date: { getUnixTimestamp: () => 200000 },
    Reader: {
      _readers: [],
      getByTabID(id) { return this._readers.find(reader => reader.tabID === id); },
      async open(id, options = {}) {
        const reader = makeReader({ id, ...options });
        this._readers.push(reader);
        return reader;
      }
    }
  };
  let exports = 0;
  const Components = { utils: { exportFunction(fn, target) {
    if (!target || target.closed) throw new Error('Dead compartment');
    exports++;
    return function (...args) { return Reflect.apply(fn, this, args); };
  }}};
  const windows = [];
  const context = vm.createContext({ Zotero, Services, Components, KeepReaderReadyLocaleData: { locale, strings: JSON.parse(fs.readFileSync(path.join(__dirname, "../locales/" + locale + ".json"), "utf8")) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/l10n.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/page-cache.js'), 'utf8'), context);
  vm.runInContext(runtimeSource, context);
  const manager = new context.KeepReaderReadyRuntime({
    Zotero, Services, Components, L10n: context.KeepReaderReadyL10n, PageCache: context.KeepReaderReadyPageCache
  });

  function makeReader({ id = 'pdf-1', type = 'pdf', hidden = false, delayed = false } = {}) {
    let sequence = 0;
    const timers = new Map();
    const calls = { trim: 0, suspend: [], visibility: 0 };
    const document = { hidden };
    const win = {
      closed: false,
      document,
      setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; },
      clearTimeout(id) { timers.delete(id); }
    };
    const scope = vm.createContext({
      document, setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
      SUSPEND_WHEN_HIDDEN_AFTER: 60000
    });
    let visibility;
    if (fs.existsSync(enginePath)) {
      const source = fs.readFileSync(enginePath, 'utf8');
      const start = source.indexOf('\t_handleVisibilityChange() {');
      const end = source.indexOf('\n\t_ensureType()', start);
      if (start < 0 || end < 0) throw new Error('Pinned reader source contract changed');
      visibility = vm.runInContext('({' + source.slice(start, end) + '})._handleVisibilityChange', scope);
    } else {
      visibility = function () {
        win.clearTimeout(this._suspendTimeout);
        this._suspendTimeout = null;
        if (document.hidden) {
          this.trimMemory();
          this._suspendTimeout = win.setTimeout(() => this.setSuspended(true), 60000);
        } else this.setSuspended(false);
      };
    }
    const prototype = { _handleVisibilityChange: visibility };
    const internal = Object.assign(Object.create(prototype), {
      _suspended: false,
      _suspendTimeout: null,
      setSuspended(value) { this._suspended = value; calls.suspend.push(value); },
      trimMemory() { calls.trim++; }
    });
    let resolveInit;
    const outer = {
      type, tabID: id, _internalReader: internal, _iframeWindow: win,
      _isUninitialized: false,
      _initPromise: delayed ? new Promise(resolve => { resolveInit = resolve; }) : Promise.resolve(),
      ready() { resolveInit?.(); },
      setHidden(value) { document.hidden = value; internal._handleVisibilityChange(); },
      fireTimers() {
        for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); }
      },
      timers, calls, prototype
    };
    return outer;
  }

  function makeWindow(readers = []) {
    const unloaded = [];
    const tabs = {
      _tabs: readers.map((reader, i) => ({
        id: reader.tabID, type: reader.type === 'note' ? 'note' : 'reader', timeUnselected: i
      })),
      unload(id) { unloaded.push(id); },
      unloadUnusedTabs() {
        for (const tab of this._tabs.slice(5)) this.unload(tab.id);
      }
    };
    if (fs.existsSync(tabsPath)) {
      const source = fs.readFileSync(tabsPath, 'utf8');
      const start = source.indexOf('this.unloadUnusedTabs = function () {') + 'this.unloadUnusedTabs = '.length;
      const end = source.indexOf('\n\t};', start) + '\n\t}'.length;
      if (start < 25 || end < start) throw new Error('Pinned tab source contract changed');
      tabs.unloadUnusedTabs = vm.runInNewContext('(' + source.slice(start, end) + ')', {
        Zotero, MAX_LOADED_TABS: 5, UNLOAD_UNUSED_AFTER: 86400
      });
    }
    const win = { Zotero_Tabs: tabs, unloaded };
    windows.push(win);
    return win;
  }

  async function settle() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  return {
    manager, Zotero, Services, Components, L10n: context.KeepReaderReadyL10n, errors, windows, observers,
    PageCache: context.KeepReaderReadyPageCache,
    makeReader, makeWindow, settle, values,
    get exportCount() { return exports; },
    realPinnedSource: fs.existsSync(enginePath) && fs.existsSync(tabsPath)
  };
}

module.exports = { makeEnvironment };
