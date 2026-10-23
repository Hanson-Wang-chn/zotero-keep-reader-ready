/* SPDX-License-Identifier: MIT */
/* Explicit, event-driven rendering of the real reader page views. */
var KeepReaderReadyPDFPreload = class KeepReaderReadyPDFPreload {
  constructor(cache) {
    this.cache = cache;
    this.stopped = false;
    this.scheduled = false;
    this.loading = false;
    this.events = [];
    this.failedDetails = new Set();
  }

  valid() {
    return !this.stopped && this.cache.valid() && this.cache.preloadEnabled;
  }

  start() {
    const cache = this.cache;
    if (typeof cache.queue?.renderView !== "function"
        || typeof cache.app?.pdfDocument?.getPage !== "function") {
      throw new Error(this.cache.l10n.t("errorRenderAPI"));
    }
    const listen = (type, callback) => {
      const fn = cache.Components.utils.exportFunction(callback, cache.win);
      cache.app.eventBus.on(type, fn);
      this.events.push(() => cache.app.eventBus.off(type, fn));
    };
    // Native rendering can finish without another visible-page request. These
    // events explicitly drive the next page, even if forceRendering returns
    // false or the native getHighestPriority function is captured elsewhere.
    listen("pagerendered", event => {
      if (event.error && event.isDetailView) {
        this.failedDetails.add("detail" + event.pageNumber);
      }
      this.schedule();
    });
    listen("updateviewarea", () => this.schedule());
    for (const type of ["scalechanging", "rotationchanging", "optionalcontentconfigchanged"]) {
      listen(type, () => {
        cache.failures.clear();
        this.failedDetails.clear();
        this.schedule();
      });
    }
    listen("afterprint", () => this.schedule());
    const queue = cache.queue;
    if (typeof queue.onIdle === "function") {
      const driver = this;
      const original = queue.onIdle;
      const descriptor = Object.getOwnPropertyDescriptor(queue, "onIdle");
      const replacement = cache.Components.utils.exportFunction(function (...args) {
        // Native idle cleanup resets unfinished canvases. A distant page can
        // still be rendering even though all visible pages are ready.
        if (driver.valid() && driver.selectPage()) return;
        return Reflect.apply(original, this, args);
      }, cache.win);
      Object.defineProperty(queue, "onIdle", {
        value: replacement, configurable: true, writable: true, enumerable: false
      });
      this.events.push(() => {
        if (queue.onIdle !== replacement) return;
        if (descriptor) Object.defineProperty(queue, "onIdle", descriptor);
        else delete queue.onIdle;
      });
      // Clear a timer that may already hold the previous onIdle callback.
      queue.renderHighestPriority();
    }
    this.schedule();
  }

  schedule() {
    if (!this.valid() || this.scheduled || this.loading) return;
    // One task per render/view event; this is not a polling or keep-alive loop.
    // A privileged task target avoids depending on a hidden iframe's timers.
    this.scheduled = true;
    this.cache.dispatch(() => {
      this.scheduled = false;
      this.step().catch(error => this.valid() && this.cache.onError(error));
    });
  }

  selectPage() {
    const { viewer, failures } = this.cache;
    const usable = page => page && page.renderingState !== 3 && !failures.has(page.id);
    const visible = viewer._getVisiblePages();
    const visiblePages = [];
    // This does not call the native priority selector or scroll the reader.
    for (const entry of visible.views || []) {
      const page = entry.view || viewer._pages[entry.id - 1];
      if (usable(page)) return page;
      if (page) visiblePages.push(page);
    }
    for (const page of visiblePages) {
      const detail = page.detailView;
      if (detail && detail.renderingState !== 3 && !this.failedDetails.has(detail.renderingId)) return detail;
    }
    // Resume an existing background render before allocating another canvas.
    let next = null;
    for (const page of viewer._pages) {
      if (!usable(page)) continue;
      if (page.renderingState === 1 || page.renderingState === 2) return page;
      if (!next) next = page;
    }
    return next;
  }

  async step() {
    if (!this.valid() || this.loading || this.cache.queue.printing) return;
    const cache = this.cache;
    const page = this.selectPage();
    if (!page) { cache.onChange(); return; }
    this.loading = true;
    try {
      if (!page.pdfPage) {
        // pagesPromise is metadata readiness, not canvas readiness. Explicitly
        // acquire lazy pages too, then draw the same PDFPageView the reader uses.
        const proxy = await cache.app.pdfDocument.getPage(page.id);
        if (!this.valid()) return;
        if (!page.pdfPage) page.setPdfPage(proxy);
      }
      if (!this.valid()) return;
      // Navigation may have changed during getPage(). Re-select so that the
      // user's newly visible page always takes priority.
      if (this.selectPage() !== page) return;
      // renderView sets the queue's private highest-priority ID and resumes
      // paused pages. Calling page.draw() alone can leave its canvas paused.
      cache.queue.renderView(page);
    } catch (error) {
      if (!this.valid()) return;
      if (page.pageView) this.failedDetails.add(page.renderingId);
      else cache.failures.add(page.id);
      cache.onError(new Error(cache.l10n.t("errorPage", { page: page.id, error: error?.message || error })));
      cache.onChange();
    } finally {
      this.loading = false;
      // A queued native render emits pagerendered to advance. Metadata failure
      // or navigation during the await needs an explicit next task instead.
      if (this.valid() && (cache.failures.has(page.id) || this.selectPage() !== page)) this.schedule();
    }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.scheduled = false;
    for (const remove of this.events.splice(0)) {
      try { remove(); } catch (_) {}
    }
  }
};
