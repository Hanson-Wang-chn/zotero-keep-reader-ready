/* SPDX-License-Identifier: MIT */
/* Extend the existing PDF.js render queue; never scroll or run a keep-alive loop. */
var KeepReaderReadyPreloader = class KeepReaderReadyPreloader {
  constructor({ outer, Components, isActive, onChange, onError }) {
    this.outer = outer;
    this.Components = Components;
    this.isActive = isActive;
    this.onChange = onChange;
    this.onError = onError;
    this.stopped = false;
    this.phase = "waiting";
    this.patches = [];
    this.events = [];
    this.failures = new Set();
    this.gate = { active: true, allowDestroy: 0 };
    this.viewer = this.view = this.win = this.queue = null;
  }

  valid() {
    return !this.stopped && this.isActive() && !this.outer._isUninitialized;
  }

  patch(object, name, makeReplacement, targetWindow = this.win) {
    const original = object[name];
    if (typeof original !== "function") throw new Error("预加载接口不可用：" + name);
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    const replacement = this.Components.utils.exportFunction(makeReplacement(original), targetWindow);
    Object.defineProperty(object, name, {
      value: replacement, configurable: true, writable: true, enumerable: false
    });
    this.patches.push({ object, name, descriptor, original, replacement });
  }

  listenBus(bus, type, callback) {
    const fn = this.Components.utils.exportFunction(callback, this.win);
    const add = bus.on || bus._on;
    const remove = bus.off || bus._off;
    Reflect.apply(add, bus, [type, fn]);
    this.events.push(() => Reflect.apply(remove, bus, [type, fn]));
  }

  async start() {
    try {
      // In this pinned reader build the top-level initializedPromise is not
      // resolved. The outer wrapper and PDFView have the actual ready signals.
      await this.outer._initPromise;
      if (!this.valid()) return this.stop(false);
      const view = this.outer._internalReader?._primaryView;
      if (!view) throw new Error("未找到 PDF 主阅读视图。");
      await view.initializedPromise;
      if (!this.valid()) return this.stop(false);
      const rawWindow = view._iframeWindow;
      const win = rawWindow?.wrappedJSObject || rawWindow;
      const app = win?.PDFViewerApplication;
      await app?.initializedPromise;
      if (!this.valid()) return this.stop(false);
      const viewer = app?.pdfViewer;
      await viewer?.pagesPromise;
      if (!this.valid()) return this.stop(false);
      const queue = app?.pdfRenderingQueue || viewer?.renderingQueue;
      if (!viewer?._pages?.length || typeof queue?.getHighestPriority !== "function"
          || typeof queue.renderHighestPriority !== "function"
          || typeof view._trimPageBuffer !== "function"
          || typeof app.eventBus?.on !== "function"
          || typeof app.eventBus?.off !== "function") {
        throw new Error("PDF 全文预加载所需的阅读器接口不可用；原有缓存保护不受影响。");
      }
      this.view = view;
      this.win = win;
      this.viewer = viewer;
      this.queue = queue;
      const gate = this.gate;
      const failures = this.failures;

      // PDF.js's private page buffer cannot be resized from a plugin. Keep
      // canvases on the real page views when buffer eviction calls destroy().
      // reset(), zooming, annotation edits and explicit page deletion still work.
      this.patch(view, "_trimPageBuffer", original => function (...args) {
        if (!gate.active) return Reflect.apply(original, this, args);
      }, this.outer._iframeWindow);

      for (const page of viewer._pages) {
        this.patch(page, "destroy", original => function (...args) {
          if (gate.active && !gate.allowDestroy) return;
          return Reflect.apply(original, this, args);
        });
        if (typeof page.deleteMe === "function") {
          this.patch(page, "deleteMe", original => function (...args) {
            gate.allowDestroy++;
            try { return Reflect.apply(original, this, args); }
            finally { gate.allowDestroy--; }
          });
        }
      }

      // Preserve all original visible-page/detail-view priorities. Only when
      // they are satisfied do we offer the next unrendered page to PDF.js.
      this.patch(queue, "getHighestPriority", original => function (...args) {
        const preferred = Reflect.apply(original, this, args);
        if (preferred || !gate.active || this.printing) return preferred;
        const pages = args[1];
        // Waived and non-waived Firefox wrappers can differ by identity. The
        // page rendering IDs also distinguish this document from thumbnails.
        if (pages !== viewer._pages && (pages?.length !== viewer._pages.length
            || pages?.[0]?.renderingId !== viewer._pages[0]?.renderingId)) return preferred;
        return pages.find(page => page.renderingState !== 3 && !failures.has(page.id)) || null;
      });

      this.listenBus(app.eventBus, "pagerendered", event => {
        if (!this.valid()) return;
        if (event.error && !event.isDetailView) this.failures.add(event.pageNumber);
        this.onChange();
      });
      this.listenBus(app.eventBus, "pagesdestroy", event => {
        if (!event.source || event.source === viewer) this.stop(false);
      });
      const close = this.Components.utils.exportFunction(() => this.stop(false), win);
      win.addEventListener("pagehide", close, { once: true });
      win.addEventListener("unload", close, { once: true });
      this.events.push(() => {
        win.removeEventListener("pagehide", close);
        win.removeEventListener("unload", close);
      });
      this.phase = "running";
      this.kick();
      this.onChange();
      return true;
    } catch (error) {
      const report = this.valid();
      this.stop(false);
      this.phase = "failed";
      if (report) this.onError(error);
      this.onChange();
      return false;
    }
  }

  kick() {
    if (this.valid() && this.queue) this.queue.renderHighestPriority();
  }

  getStatus() {
    const pages = this.viewer?._pages || [];
    const ready = pages.filter(page => page.renderingState === 3 && !this.failures.has(page.id)).length;
    return {
      phase: this.phase === "running" && ready === pages.length && pages.length ? "complete" : this.phase,
      ready, total: pages.length, failed: this.failures.size
    };
  }

  stop(release = true) {
    if (this.stopped) return;
    this.stopped = true;
    this.gate.active = false;
    for (const remove of this.events.splice(0)) {
      try { remove(); } catch (_) {}
    }
    for (const record of this.patches.splice(0).reverse()) {
      try {
        if (record.object[record.name] === record.replacement) {
          if (record.descriptor) Object.defineProperty(record.object, record.name, record.descriptor);
          else delete record.object[record.name];
        }
      } catch (_) {}
    }
    if (release && this.viewer && !this.win?.closed) {
      try {
        // Many retained pages have already fallen out of PDF.js's private
        // buffer. Explicitly release those as well when this option is off.
        const visible = this.viewer._getVisiblePages();
        const keep = new Set();
        for (const id of visible.ids) keep.add(id - 1).add(id).add(id + 1);
        const recent = [...this.viewer.getCachedPageViews()].slice(-2);
        for (const page of recent) keep.add(page.id);
        for (const page of this.viewer._pages) {
          if (!keep.has(page.id)) page.destroy();
        }
        this.view._trimPageBuffer(2);
        this.viewer.update();
      } catch (error) {
        this.onError(error);
      }
    }
    this.phase = "stopped";
    this.onChange();
  }
};
