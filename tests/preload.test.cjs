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
    renderView(page) {
      if (page.renderingState === 0) page.draw().finally(() => this.renderHighestPriority());
    }
  };
}

function makePDF(env, { count = 14, startAt = 1, delayed = false } = {}) {
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
  const app = { initializedPromise: Promise.resolve(), pdfViewer: viewer, pdfRenderingQueue: queue, eventBus };
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
  const create = options => new env.Preloader({
    outer, Components: env.Components, isActive: () => true,
    onChange() {}, onError: error => env.errors.push(error.message), ...options
  });
  const complete = async id => {
    if (!pending.has(id)) throw new Error('No pending render for ' + id);
    pending.get(id)();
    await env.settle();
  };
  const drain = async () => {
    for (let tries = 0; tries < count * 3 && pending.size; tries++) {
      await complete(pending.keys().next().value);
    }
    assert.equal(pending.size, 0, 'preload render queue must finish rather than loop');
  };
  return { outer, viewer, view, win, queue, eventBus, busEvents, domEvents,
    pending, order, destroyed, create, complete, drain, ready: () => resolvePages?.() };
}

test('full preload renders every real page view and retains pages beyond both eviction layers', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const job = pdf.create();
  assert.equal(await job.start(), true);
  await pdf.drain();
  assert.equal(job.getStatus().ready, 14);
  assert.equal(job.getStatus().phase, 'complete');
  assert.equal(new Set(pdf.order).size, 14);
  assert.deepEqual(pdf.destroyed, []);
  assert.equal(pdf.viewer.currentPageNumber, 1);
  assert.equal(pdf.viewer.scrollTop, 1234);
  assert.equal(pdf.viewer.currentScale, 1.25);
});

test('initial visible page wins over whole-document preload', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { startAt: 7 });
  await pdf.create().start();
  assert.equal(pdf.order[0], 7);
});

test('newly visible pages regain priority during preload', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  await pdf.create().start();
  pdf.viewer.currentPageNumber = 10;
  await pdf.complete(1);
  assert.equal(pdf.order[1], 10);
});

test('turning off restores methods and stops scheduling distant pages', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const originalPriority = pdf.queue.getHighestPriority;
  const originalDestroy = pdf.viewer._pages[12].destroy;
  const job = pdf.create();
  await job.start();
  job.stop();
  assert.equal(pdf.queue.getHighestPriority, originalPriority);
  assert.equal(pdf.viewer._pages[12].destroy, originalDestroy);
  await pdf.complete(1);
  assert.equal(pdf.order.every(id => id <= 2), true);
  assert.equal(job.stopped, true);
});

test('turning off releases retained off-screen pages, including evicted ones', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const job = pdf.create();
  await job.start();
  await pdf.drain();
  job.stop();
  assert.ok(pdf.destroyed.includes(5));
  assert.equal(pdf.viewer._pages[0].renderingState, 3);
});

test('explicit PDF page deletion still calls the original destroy method', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  await pdf.create().start();
  pdf.viewer._pages[8].deleteMe();
  assert.ok(pdf.destroyed.includes(9));
});

test('zoom/reset is not blocked and the queue pre-renders the new scale again', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 6 });
  const job = pdf.create();
  await job.start();
  await pdf.drain();
  for (const page of pdf.viewer._pages) page.reset();
  pdf.viewer.currentScale = 2;
  pdf.viewer.update();
  await pdf.drain();
  assert.equal(job.getStatus().ready, 6);
  assert.equal(pdf.order.length, 12);
});

test('pending page initialization can be cancelled without late patching', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { delayed: true });
  const original = pdf.queue.getHighestPriority;
  const job = pdf.create();
  const starting = job.start();
  await env.settle();
  job.stop();
  pdf.ready();
  await starting;
  assert.equal(pdf.queue.getHighestPriority, original);
  assert.equal(pdf.order.length, 0);
});

test('page teardown restores hooks and removes event handlers', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const original = pdf.queue.getHighestPriority;
  const job = pdf.create();
  await job.start();
  pdf.eventBus.dispatch('pagesdestroy', { source: pdf.viewer });
  assert.equal(job.stopped, true);
  assert.equal(pdf.queue.getHighestPriority, original);
  assert.equal(pdf.domEvents.size, 0);
  assert.equal(pdf.busEvents.get('pagesdestroy').size, 0);
});

test('PDF iframe unloading stops the preload job', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const job = pdf.create();
  await job.start();
  pdf.domEvents.get('pagehide')();
  assert.equal(job.stopped, true);
});

test('thumbnail queues keep their original selection behavior', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const job = pdf.create();
  await job.start();
  const thumbnail = { id: 1, renderingState: 3 };
  const thumbnailPages = [thumbnail];
  const visible = { views: [{ view: thumbnail }], ids: new Set([1]), first: { id: 1 }, last: { id: 1 } };
  assert.equal(pdf.queue.getHighestPriority(visible, thumbnailPages, true), null);
});

test('render failures are counted without retrying the same failed page forever', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const job = pdf.create();
  await job.start();
  pdf.eventBus.dispatch('pagerendered', { pageNumber: 8, error: new Error('bad page') });
  await pdf.drain();
  assert.equal(job.getStatus().failed, 1);
  assert.equal(job.getStatus().ready, 13);
  assert.equal(pdf.order.includes(8), false);
});

test('a partial patch failure rolls back all hooks already installed', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const originalTrim = pdf.view._trimPageBuffer;
  pdf.viewer._pages[4].destroy = null;
  const job = pdf.create();
  assert.equal(await job.start(), false);
  assert.equal(pdf.view._trimPageBuffer, originalTrim);
  assert.equal(Object.hasOwn(pdf.viewer._pages[0], 'deleteMe'), true);
  assert.equal(env.errors.length, 1);
});

test('runtime option starts on existing PDFs without changing old option values', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  env.Zotero.Reader._readers.push(pdf.outer);
  env.makeWindow([pdf.outer]);
  env.manager.start();
  await env.settle();
  assert.equal(env.manager.preloadWholePDF, false);
  assert.equal(pdf.order.length, 0);
  env.manager.setOption('preloadWholePDF', true);
  for (let i = 0; i < 5; i++) await env.settle();
  assert.equal(pdf.order[0], 1);
  assert.equal(env.manager.enabled, true);
  assert.equal(env.manager.keepTabsLoaded, true);
  await pdf.drain();
  assert.equal(env.manager.getStatus().preload.ready, 14);
  env.manager.setOption('preloadWholePDF', false);
  assert.equal(env.manager.getStatus().protectedReaders, 1);
  assert.equal(env.manager.getStatus().preload.documents, 0);
});

test('runtime applies full preload to newly opened PDF readers', async () => {
  const env = makeEnvironment({ preloadWholePDF: true });
  const pdf = makePDF(env);
  env.Zotero.Reader.open = async () => {
    env.Zotero.Reader._readers.push(pdf.outer);
    return pdf.outer;
  };
  env.manager.start();
  await env.Zotero.Reader.open();
  for (let i = 0; i < 5; i++) await env.settle();
  assert.equal(pdf.order[0], 1);
  assert.equal(env.manager.getStatus().preload.documents, 1);
});

test('plugin shutdown stops full preload and restores its hooks', async () => {
  const env = makeEnvironment({ preloadWholePDF: true });
  const pdf = makePDF(env);
  env.Zotero.Reader._readers.push(pdf.outer);
  const original = pdf.queue.getHighestPriority;
  env.manager.start();
  for (let i = 0; i < 5; i++) await env.settle();
  assert.notEqual(pdf.queue.getHighestPriority, original);
  env.manager.stop();
  assert.equal(pdf.queue.getHighestPriority, original);
  assert.equal(pdf.domEvents.size, 0);
});
