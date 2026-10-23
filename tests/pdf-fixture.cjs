const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeEnvironment } = require('./helpers.cjs');

function loadQueueClass() {
  const pinned = path.join(__dirname, '../research/pdfjs-rendering-queue-37919f5.js');
  if (fs.existsSync(pinned)) {
    const source = fs.readFileSync(pinned, 'utf8');
    const start = source.indexOf('class PDFRenderingQueue');
    const end = source.lastIndexOf('export {');
    return vm.runInNewContext(source.slice(start, end) + '\nPDFRenderingQueue;', {
      RenderingStates: { INITIAL: 0, RUNNING: 1, PAUSED: 2, FINISHED: 3 },
      PDFJSDev: { test: () => false },
      RenderingCancelledException: class extends Error {},
      console, setTimeout, clearTimeout, CLEANUP_TIMEOUT: 30000
    });
  }
  // Source ZIPs do not redistribute upstream code. This minimal queue preserves
  // its visible-first/render-next contract for portable unit tests.
  return class {
    setViewer(viewer) { this.viewer = viewer; }
    getHighestPriority(visible, pages) {
      return visible.views.map(x => x.view).find(page => page.renderingState !== 3) || null;
    }
    renderHighestPriority() { this.viewer.forceRendering(); }
    isHighestPriority(page) { return this.highest === page.renderingId; }
    renderView(page) {
      if (page.renderingState === 3) return false;
      this.highest = page.renderingId;
      if (page.renderingState === 2) page.resume();
      else if (page.renderingState === 0) {
        page.draw().finally(() => this.renderHighestPriority()).catch(() => {});
      }
      return true;
    }
  };
}

function makePDF(env, { count = 14, startAt = 1, delayed = false, lazy = false } = {}) {
  const busEvents = new Map();
  const eventBus = {
    on(type, listener) {
      if (!busEvents.has(type)) busEvents.set(type, new Set());
      busEvents.get(type).add(listener);
    },
    off(type, listener) { busEvents.get(type)?.delete(listener); },
    dispatch(type, event) { for (const listener of [...busEvents.get(type) || []]) listener(event); }
  };
  const domEvents = new Map();
  const win = {
    closed: false,
    setTimeout, clearTimeout,
    addEventListener(type, listener) { domEvents.set(type, listener); },
    removeEventListener(type, listener) {
      if (domEvents.get(type) === listener) domEvents.delete(type);
    }
  };
  const pending = new Map();
  const order = [];
  const destroyed = [];
  const cached = new Set();
  const Queue = loadQueueClass();
  const queue = new Queue();
  let resolvePages;
  const viewer = {
    renderingQueue: queue,
    currentPageNumber: startAt,
    scrollTop: 1234,
    currentScale: 1.25,
    pagesPromise: delayed ? new Promise(resolve => { resolvePages = resolve; }) : Promise.resolve(),
    _pages: [],
    _getVisiblePages() {
      const view = this._pages[this.currentPageNumber - 1];
      return { views: [{ view }], ids: new Set([view.id]), first: { id: view.id }, last: { id: view.id } };
    },
    getCachedPageViews() { return new Set(cached); },
    forceRendering() {
      const page = queue.getHighestPriority(this._getVisiblePages(), this._pages, true, false, false);
      if (!page) return false;
      queue.renderView(page);
      return true;
    },
    update() { queue.renderHighestPriority(); }
  };
  for (let i = 1; i <= count; i++) {
    viewer._pages.push({
      id: i, renderingId: 'page' + i, renderingState: 0,
      pdfPage: lazy ? null : { pageNumber: i },
      setPdfPage(proxy) { this.pdfPage = proxy; this.reset(); },
      destroy() { destroyed.push(this.id); this.renderingState = 0; },
      deleteMe() { this.destroy(); },
      reset() { this.renderingState = 0; },
      async draw() {
        this.renderingState = 1;
        order.push(this.id);
        cached.add(this);
        if (cached.size > 2) {
          const evicted = cached.values().next().value;
          cached.delete(evicted);
          evicted.destroy();
        }
        await new Promise(resolve => pending.set(this.id, resolve));
        pending.delete(this.id);
        this.renderingState = 3;
        eventBus.dispatch('pagerendered', { source: this, pageNumber: this.id });
      }
    });
  }
  queue.setViewer(viewer);
  const loadedPages = [];
  const document = {
    async getPage(id) { loadedPages.push(id); return { pageNumber: id }; }
  };
  viewer.pdfDocument = document;
  const app = { initializedPromise: Promise.resolve(), pdfDocument: document, pdfViewer: viewer, pdfRenderingQueue: queue, eventBus };
  win.PDFViewerApplication = app;
  const view = {
    initializedPromise: Promise.resolve(), _iframeWindow: win,
    _trimPageBuffer() {
      for (const page of viewer._pages) {
        if (page.id < viewer.currentPageNumber - 1 || page.id > viewer.currentPageNumber + 1) page.destroy();
      }
    }
  };
  eventBus.on('pagerendered', () => view._trimPageBuffer(2));
  const outer = env.makeReader();
  // Match the pinned build: this top-level promise never resolves. The plugin
  // must use the outer wrapper and PDFView readiness contracts instead.
  outer._internalReader.initializedPromise = new Promise(() => {});
  outer._internalReader._primaryView = view;
  const create = options => new env.PageCache({
    outer, Components: env.Components, L10n: env.L10n, isActive: () => true,
    PDFPreload: env.PDFPreload, dispatch: callback => setTimeout(callback, 0),
    onChange() {}, onError: error => env.errors.push(error.message), ...options
  });
  const complete = async id => {
    if (!pending.has(id)) throw new Error('No pending render for ' + id);
    pending.get(id)();
    await env.settle();
    await new Promise(resolve => setTimeout(resolve, 3));
    await env.settle();
  };
  const drain = async () => {
    let idle = 0;
    for (let tries = 0; tries < count * 5 + 10; tries++) {
      await new Promise(resolve => setTimeout(resolve, 3));
      await env.settle();
      if (pending.size) {
        idle = 0;
        await complete(pending.keys().next().value);
      } else if (++idle >= 3) return;
    }
    assert.fail('preload render queue must finish rather than loop');
  };
  return { outer, viewer, view, win, queue, eventBus, busEvents, domEvents,
    app, loadedPages, pending, order, destroyed, create, complete, drain, ready: () => resolvePages?.() };
}


module.exports = { makePDF };
