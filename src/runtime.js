/* SPDX-License-Identifier: MIT */
/* No network, database writes, idle loops, or periodic keep-alive timers. */
var KeepReaderReadyRuntime = class KeepReaderReadyRuntime {
  constructor({ Zotero, Services, Components, L10n, PageCache, PDFPreload }) {
    this.Zotero = Zotero;
    this.l10n = L10n;
    this.Services = Services;
    this.Components = Components;
    this.PageCache = PageCache;
    this.PDFPreload = PDFPreload;
    this.cacheRecords = new WeakMap();
    this.branch = "extensions.zotero.keepReaderReady.";
    this.alive = false;
    this.readerRecords = new WeakMap();
    this.pendingReaders = new WeakSet();
    this.windows = new Map();
    this.listeners = new Set();
    this.errors = [];
    this.failedReaders = new WeakSet();
    this.openRecord = null;
    this.prefObserver = { observe: () => this.refresh() };
  }

  get enabled() {
    return this.Services.prefs.getBoolPref(this.branch + "enabled", true);
  }

  get keepTabsLoaded() {
    return this.Services.prefs.getBoolPref(this.branch + "keepTabsLoaded", true);
  }

  get retainBrowsedPages() {
    // Preserve 1.1's existing checkbox value independently of the new eager
    // rendering preference introduced in 1.2.
    return this.Services.prefs.getBoolPref(this.branch + "preloadWholePDF", false);
  }

  get preloadWholePDF() {
    return this.Services.prefs.getBoolPref(this.branch + "eagerRenderWholePDF", false);
  }

  setOption(name, value) {
    if (!["enabled", "keepTabsLoaded", "retainBrowsedPages", "preloadWholePDF"].includes(name)) throw new Error(this.l10n.t("errorUnknownOption"));
    this.Services.prefs.setBoolPref(this.branch + (name === "retainBrowsedPages" ? "preloadWholePDF" : name === "preloadWholePDF" ? "eagerRenderWholePDF" : name), Boolean(value));
  }

  report(error) {
    const message = String(error?.message || error);
    if (!this.errors.includes(message)) this.errors.push(message);
    this.errors = this.errors.slice(-5);
    this.Zotero.logError(new Error("[Keep Reader Ready] " + message));
  }

  start() {
    if (this.alive) return;
    this.alive = true;
    this.Services.prefs.addObserver(this.branch, this.prefObserver);
    const owner = this.Zotero.Reader;
    if (typeof owner?.open === "function") {
      const original = owner.open;
      // Preserve the exact return value/promise and the original error semantics.
      const gate = { runtime: this };
      const wrapper = function (...args) {
        const result = Reflect.apply(original, this, args);
        const manager = gate.runtime;
        if (manager?.alive) {
          Promise.resolve(result).then(reader => manager.queueReader(reader))
            .catch(error => manager.alive && manager.report(error));
        }
        return result;
      };
      owner.open = wrapper;
      this.openRecord = { owner, original, wrapper, gate };
    } else {
      this.report(this.l10n.t("errorOpen"));
    }
    for (const win of this.Zotero.getMainWindows()) this.addWindow(win);
    this.applyToAll();
  }

  addWindow(win) {
    if (!this.alive || !win || !win.Zotero_Tabs || this.windows.has(win)) return;
    const tabs = win.Zotero_Tabs;
    const record = { win, tabs, original: null, wrapper: null, gate: null };
    this.windows.set(win, record);
    this.updateWindow(record);
    this.emit();
  }

  updateWindow(record) {
    const shouldProtect = this.alive && this.enabled && this.keepTabsLoaded;
    if (!shouldProtect) {
      this.restoreWindow(record);
      return;
    }
    if (record.wrapper) return;
    const { tabs } = record;
    if (typeof tabs?.unloadUnusedTabs !== "function" || typeof tabs.unload !== "function") {
      this.report(this.l10n.t("errorTabs"));
      return;
    }
    const original = tabs.unloadUnusedTabs;
    const gate = { active: true };
    const Zotero = this.Zotero;
    const wrapper = function (...args) {
      if (!gate.active) return Reflect.apply(original, this, args);
      const previousUnload = this.unload;
      // Block only PDF unloads during the synchronous automatic-cleanup pass.
      // Direct/manual unload calls, other reader types, and tab closing are kept.
      const guardedUnload = function (id, ...rest) {
        let isPDF = false;
        try { isPDF = Zotero.Reader.getByTabID(id)?.type === "pdf"; } catch (_) {}
        if (gate.active && isPDF) return;
        return Reflect.apply(previousUnload, this, [id, ...rest]);
      };
      this.unload = guardedUnload;
      try {
        return Reflect.apply(original, this, args);
      } finally {
        if (this.unload === guardedUnload) this.unload = previousUnload;
      }
    };
    tabs.unloadUnusedTabs = wrapper;
    Object.assign(record, { original, wrapper, gate });
  }

  restoreWindow(record) {
    if (!record.wrapper) return;
    record.gate.active = false;
    if (record.tabs.unloadUnusedTabs === record.wrapper) {
      record.tabs.unloadUnusedTabs = record.original;
    }
    record.original = record.wrapper = record.gate = null;
  }

  removeWindow(win) {
    const record = this.windows.get(win);
    if (!record) return;
    this.restoreWindow(record);
    this.windows.delete(win);
    this.emit();
  }

  async queueReader(outer) {
    if (!this.alive || !this.enabled || !outer || outer.type !== "pdf") return false;
    if (this.pendingReaders.has(outer)) return false;
    this.pendingReaders.add(outer);
    try {
      // A reader returned by open() can exist before its iframe initializes.
      await outer._initPromise;
      if (!this.alive || !this.enabled || outer._isUninitialized
          || !this.Zotero.Reader._readers.includes(outer)) return false;
      const protectedReader = this.patchReader(outer);
      if (this.retainBrowsedPages || this.preloadWholePDF) this.startCache(outer);
      return protectedReader;
    } catch (error) {
      if (this.alive && !outer._isUninitialized) this.report(error);
      return false;
    } finally {
      this.pendingReaders.delete(outer);
      if (this.alive) this.emit();
    }
  }

  startCache(outer) {
    if (!this.alive || !this.enabled || !(this.retainBrowsedPages || this.preloadWholePDF)) return;
    const current = this.cacheRecords.get(outer);
    if (current && !current.stopped) {
      current.setPreload(this.preloadWholePDF);
      return;
    }
    if (!this.PageCache) {
      this.report(this.l10n.t("errorCacheMissing"));
      return;
    }
    const job = new this.PageCache({
      outer, Components: this.Components, L10n: this.l10n,
      PDFPreload: this.PDFPreload, preload: this.preloadWholePDF,
      dispatch: callback => this.Services.tm.dispatchToMainThread(callback),
      isActive: () => this.alive && this.enabled && (this.retainBrowsedPages || this.preloadWholePDF)
        && this.Zotero.Reader._readers.includes(outer),
      onChange: () => this.alive && this.emit(),
      onError: error => this.report(error)
    });
    this.cacheRecords.set(outer, job);
    job.start().catch(error => this.alive && this.report(error));
  }

  stopCache(outer) {
    const job = this.cacheRecords.get(outer);
    job?.stop();
    this.cacheRecords.delete(outer);
  }

  patchReader(outer) {
    const reader = outer._internalReader;
    const win = outer._iframeWindow;
    if (!reader || !win || win.closed) return false;
    if (this.readerRecords.has(reader)) return true;
    if (typeof reader._handleVisibilityChange !== "function"
        || typeof reader.setSuspended !== "function") {
      if (!this.failedReaders.has(outer)) {
        this.failedReaders.add(outer);
        this.report(this.l10n.t("errorVisibility"));
      }
      return false;
    }
    const original = reader._handleVisibilityChange;
    const descriptor = Object.getOwnPropertyDescriptor(reader, "_handleVisibilityChange");
    const gate = { active: true };
    const callback = function (...args) {
      if (!gate.active) return Reflect.apply(original, this, args);
      // Keep document visibility and all other background throttling untouched.
    };
    // Export into the content iframe; a plain privileged function assignment is
    // unsafe across Firefox compartments.
    const replacement = this.Components.utils.exportFunction(callback, win);
    Object.defineProperty(reader, "_handleVisibilityChange", {
      value: replacement, configurable: true, writable: true, enumerable: false
    });
    const record = { original, descriptor, replacement, gate };
    this.readerRecords.set(reader, record);
    try {
      win.clearTimeout(reader._suspendTimeout);
      reader._suspendTimeout = null;
      if (reader._suspended) reader.setSuspended(false);
    } catch (error) {
      this.restoreReader(outer, false);
      throw error;
    }
    return true;
  }

  restoreReader(outer, resumeNative = true) {
    const reader = outer?._internalReader;
    if (!reader) return;
    const record = this.readerRecords.get(reader);
    if (!record) return;
    record.gate.active = false;
    try {
      const win = outer._iframeWindow;
      if (!win || win.closed || outer._isUninitialized) return;
      if (reader._handleVisibilityChange === record.replacement) {
        if (record.descriptor) {
          Object.defineProperty(reader, "_handleVisibilityChange", record.descriptor);
        } else {
          delete reader._handleVisibilityChange;
        }
      }
      // If another plugin wrapped ours, its inner wrapper now delegates to the
      // original, rather than staying a no-op after we are disabled.
      if (resumeNative) Reflect.apply(reader._handleVisibilityChange, reader, []);
    } catch (error) {
      this.report(error);
    } finally {
      this.readerRecords.delete(reader);
    }
  }

  applyToAll() {
    if (!this.alive) return Promise.resolve([]);
    return Promise.all(this.Zotero.Reader._readers.slice().map(reader => this.queueReader(reader)));
  }

  refresh() {
    if (!this.alive) return;
    if (!this.enabled || !(this.retainBrowsedPages || this.preloadWholePDF)) {
      for (const reader of this.Zotero.Reader._readers.slice()) this.stopCache(reader);
    }
    for (const reader of this.Zotero.Reader._readers.slice()) {
      this.cacheRecords.get(reader)?.setPreload(this.enabled && this.preloadWholePDF);
    }
    if (this.enabled) this.applyToAll();
    else {
      for (const reader of this.Zotero.Reader._readers.slice()) this.restoreReader(reader);
    }
    for (const record of this.windows.values()) this.updateWindow(record);
    this.emit();
  }

  getStatus() {
    let loaded = 0, protectedReaders = 0;
    const cache = { ready: 0, total: 0, waiting: 0, documents: 0, failed: 0 };
    const preload = { ready: 0, total: 0, waiting: 0, documents: 0, failed: 0, unavailable: 0 };
    for (const outer of this.Zotero.Reader._readers) {
      if (outer.type !== "pdf" || outer._isUninitialized) continue;
      loaded++;
      if (outer._internalReader && this.readerRecords.has(outer._internalReader)) protectedReaders++;
      const job = this.cacheRecords.get(outer);
      if (job) {
        const status = job.getStatus();
        cache.documents++;
        cache.ready += status.ready;
        cache.total += status.total;
        cache.failed += status.failed;
        if (status.phase === "waiting") cache.waiting++;
        if (this.preloadWholePDF) {
          preload.documents++;
          preload.ready += status.ready;
          preload.total += status.total;
          preload.failed += status.failed;
          if (status.preloadPhase === "waiting") preload.waiting++;
          if (status.preloadPhase === "failed") preload.unavailable++;
        }
      }
    }
    return {
      enabled: this.alive && this.enabled,
      keepTabsLoaded: this.keepTabsLoaded,
      retainBrowsedPages: this.retainBrowsedPages,
      cache,
      preloadWholePDF: this.preloadWholePDF,
      preload,
      version: this.Zotero.version,
      loaded, protectedReaders,
      protectedWindows: [...this.windows.values()].filter(record => !!record.wrapper).length,
      errors: this.errors.slice()
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) {
      try { listener(this.getStatus()); } catch (_) {}
    }
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;
    this.Services.prefs.removeObserver(this.branch, this.prefObserver);
    for (const outer of this.Zotero.Reader._readers.slice()) this.stopCache(outer);
    for (const outer of this.Zotero.Reader._readers.slice()) this.restoreReader(outer);
    for (const win of [...this.windows.keys()]) this.removeWindow(win);
    if (this.openRecord) {
      const { owner, original, wrapper, gate } = this.openRecord;
      gate.runtime = null;
      if (owner.open === wrapper) owner.open = original;
      this.openRecord = null;
    }
    this.emit();
    this.listeners.clear();
  }
};
