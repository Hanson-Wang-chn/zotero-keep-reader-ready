const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnvironment } = require('./helpers.cjs');
const { makePDF } = require('./pdf-fixture.cjs');
const tick = async () => new Promise(resolve => setTimeout(resolve, 5));

test('explicit preload renders all 14 model page views with native automatic selection disabled', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { lazy: true });
  pdf.viewer.forceRendering = () => false;
  const originalPriority = pdf.queue.getHighestPriority;
  const job = pdf.create({ preload: true });
  assert.equal(await job.start(), true);
  await tick();
  await pdf.drain();
  assert.equal(job.getStatus().ready, 14);
  assert.equal(job.getStatus().preloadPhase, 'complete');
  assert.equal(new Set(pdf.order).size, 14);
  assert.equal(pdf.loadedPages.length, 14);
  assert.deepEqual(pdf.destroyed, []);
  assert.equal(pdf.queue.getHighestPriority, originalPriority);
  assert.equal(pdf.viewer.currentPageNumber, 1);
  assert.equal(pdf.viewer.scrollTop, 1234);
  assert.equal(pdf.viewer.currentScale, 1.25);
  job.stop(false);
});

test('preload does not wait for document-wide metadata or the unresolved top-level reader promise', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { delayed: true, count: 4, lazy: true });
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  assert.equal(pdf.order[0], 1);
  await pdf.drain();
  assert.equal(job.getStatus().ready, 4);
  job.stop(false);
});

test('visible page and newly visible page take priority over unread background pages', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { startAt: 7 });
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  assert.equal(pdf.order[0], 7);
  pdf.viewer.currentPageNumber = 12;
  await pdf.complete(7);
  assert.equal(pdf.order[1], 12);
  await pdf.drain();
  assert.equal(job.getStatus().ready, 14);
  job.stop(false);
});

test('native queue receives a paused page to resume, rather than calling draw again', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 2 });
  const page = pdf.viewer._pages[0];
  let resumed = 0;
  page.renderingState = 2;
  page.resume = () => { resumed++; page.renderingState = 1; };
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  assert.equal(resumed, 1);
  assert.equal(pdf.order.includes(1), false);
  job.stop(false);
});

test('turning off eager rendering retains accumulated canvases when retention stays on', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  pdf.viewer.forceRendering = () => false;
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  await pdf.complete(1);
  job.setPreload(false);
  const count = pdf.order.length;
  for (const id of [...pdf.pending.keys()]) await pdf.complete(id);
  await tick();
  assert.equal(pdf.order.length, count);
  assert.equal(pdf.viewer._pages[0].renderingState, 3);
  assert.deepEqual(pdf.destroyed, []);
  job.stop(false);
});

test('zoom resets canvases and explicitly schedules a new full pass', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 5 });
  pdf.viewer.forceRendering = () => false;
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  await pdf.drain();
  for (const page of pdf.viewer._pages) page.reset();
  pdf.viewer.currentScale = 2;
  pdf.eventBus.dispatch('scalechanging', { scale: 2 });
  await tick();
  await pdf.drain();
  assert.equal(job.getStatus().ready, 5);
  assert.equal(pdf.order.length, 10);
  job.stop(false);
});

test('metadata failure is reported once and remaining pages continue rendering', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 5, lazy: true });
  pdf.viewer.forceRendering = () => false;
  pdf.app.pdfDocument.getPage = async id => {
    if (id === 3) throw new Error('bad PDF page');
    return { pageNumber: id };
  };
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  await pdf.drain();
  assert.equal(job.getStatus().ready, 4);
  assert.equal(job.getStatus().failed, 1);
  assert.equal(env.errors.length, 1);
  assert.equal(pdf.order.includes(3), false);
  job.stop(false);
});

test('native canvas error is counted without repeatedly scheduling that page', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 6 });
  pdf.viewer.forceRendering = () => false;
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  pdf.eventBus.dispatch('pagerendered', { pageNumber: 5, error: new Error('render error') });
  await pdf.drain();
  assert.equal(job.getStatus().ready, 5);
  assert.equal(job.getStatus().failed, 1);
  assert.equal(pdf.order.includes(5), false);
  job.stop(false);
});

test('disabling while getPage is pending prevents late page assignment or rendering', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { lazy: true });
  let resolvePage;
  pdf.app.pdfDocument.getPage = () => new Promise(resolve => { resolvePage = resolve; });
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  job.setPreload(false);
  resolvePage({ pageNumber: 1 });
  await tick();
  assert.equal(pdf.viewer._pages[0].pdfPage, null);
  assert.deepEqual(pdf.order, []);
  job.stop(false);
});

test('preload starts on existing and newly opened PDFs using an independent preference', async () => {
  const env = makeEnvironment({ retainBrowsedPages: true });
  const first = makePDF(env, { count: 3 });
  const second = makePDF(env, { count: 2 });
  env.Zotero.Reader.open = async () => { env.Zotero.Reader._readers.push(second.outer); return second.outer; };
  env.Zotero.Reader._readers.push(first.outer);
  env.manager.start();
  await env.settle();
  assert.equal(env.manager.preloadWholePDF, false);
  assert.deepEqual(first.order, []);
  env.manager.setOption('preloadWholePDF', true);
  await tick();
  await first.drain();
  assert.equal(env.manager.getStatus().preload.ready, 3);
  await env.Zotero.Reader.open();
  await tick();
  await second.drain();
  assert.equal(env.manager.getStatus().preload.documents, 2);
  assert.equal(env.manager.getStatus().preload.ready, 5);
  env.manager.setOption('preloadWholePDF', false);
  assert.equal(env.manager.retainBrowsedPages, true);
  assert.equal(env.manager.getStatus().cache.documents, 2);
  env.manager.stop();
});

test('preload alone retains canvases and restores native trimming when both options are off', async () => {
  const env = makeEnvironment({ preloadWholePDF: true });
  const pdf = makePDF(env, { count: 8 });
  env.Zotero.Reader._readers.push(pdf.outer);
  const original = pdf.view._trimPageBuffer;
  env.manager.start();
  await tick();
  await pdf.drain();
  assert.equal(env.manager.getStatus().preload.ready, 8);
  assert.equal(env.manager.retainBrowsedPages, false);
  env.manager.setOption('preloadWholePDF', false);
  assert.equal(pdf.view._trimPageBuffer, original);
  assert.ok(pdf.destroyed.includes(4));
  env.manager.stop();
});

test('closing a PDF or disabling the plugin removes preload handlers and queued work', async () => {
  const env = makeEnvironment({ preloadWholePDF: true });
  const pdf = makePDF(env);
  env.Zotero.Reader._readers.push(pdf.outer);
  env.manager.start();
  await env.settle();
  env.manager.stop();
  const count = pdf.order.length;
  await tick();
  assert.equal(pdf.order.length, count);
  assert.equal(pdf.domEvents.size, 0);
  assert.equal(pdf.busEvents.get('updateviewarea')?.size || 0, 0);
  const second = makePDF(env);
  const job = second.create({ preload: true });
  await job.start();
  second.domEvents.get('pagehide')();
  await tick();
  assert.equal(second.order.length, 0);
});

test('content arrays need no privileged callbacks passed into find or filter', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 3 });
  pdf.viewer.forceRendering = () => false;
  pdf.viewer._pages = new Proxy(pdf.viewer._pages, {
    get(target, key, receiver) {
      if (key === 'find' || key === 'filter') throw new Error('cross-compartment callback blocked');
      return Reflect.get(target, key, receiver);
    }
  });
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  await pdf.drain();
  assert.equal(job.getStatus().ready, 3);
  job.stop(false);
});

test('printing pauses new preload work and resumes it on afterprint', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 3 });
  pdf.queue.printing = true;
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  assert.deepEqual(pdf.order, []);
  pdf.queue.printing = false;
  pdf.eventBus.dispatch('afterprint', {});
  await tick();
  await pdf.drain();
  assert.equal(job.getStatus().ready, 3);
  job.stop(false);
});

test('visible high-resolution detail render completes before background pages', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 3 });
  pdf.viewer.forceRendering = () => false;
  const page = pdf.viewer._pages[0];
  page.renderingState = 3;
  let finish;
  let draws = 0;
  page.detailView = {
    id: 1, pageView: page, renderingId: 'detail1', renderingState: 0, pdfPage: page.pdfPage,
    async draw() {
      draws++;
      this.renderingState = 1;
      await new Promise(resolve => { finish = resolve; });
      this.renderingState = 3;
      pdf.eventBus.dispatch('pagerendered', { source: this, pageNumber: 1, isDetailView: true });
    }
  };
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  assert.equal(draws, 1);
  assert.deepEqual(pdf.order, []);
  finish();
  await tick();
  await pdf.drain();
  assert.equal(job.getStatus().ready, 3);
  job.stop(false);
});

test('native idle cleanup waits for distant renders and its callback is restored on stop', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { count: 3 });
  pdf.viewer.forceRendering = () => false;
  let cleanups = 0;
  const original = () => { cleanups++; };
  pdf.queue.onIdle = original;
  const job = pdf.create({ preload: true });
  await job.start();
  await tick();
  pdf.queue.onIdle();
  assert.equal(cleanups, 0);
  await pdf.drain();
  pdf.queue.onIdle();
  assert.equal(cleanups, 1);
  job.setPreload(false);
  assert.equal(pdf.queue.onIdle, original);
  // Clear the native private timeout before ending this Node.js test.
  pdf.queue.onIdle = null;
  pdf.queue.renderHighestPriority();
  job.stop(false);
});
