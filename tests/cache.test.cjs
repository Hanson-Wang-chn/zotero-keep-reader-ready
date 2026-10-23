const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnvironment } = require('./helpers.cjs');
const { makePDF } = require('./pdf-fixture.cjs');

test('retention starts without scheduling or rendering unread pages', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const originalPriority = pdf.queue.getHighestPriority;
  const originalRender = pdf.queue.renderView;
  const job = pdf.create();
  await job.start();
  assert.deepEqual(pdf.order, []);
  assert.equal(pdf.queue.getHighestPriority, originalPriority);
  assert.equal(pdf.queue.renderView, originalRender);
  job.stop();
});

test('scrolling renders requested pages and retains canvases beyond both eviction layers', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const job = pdf.create();
  await job.start();
  for (let id = 1; id <= 8; id++) {
    pdf.viewer.currentPageNumber = id;
    pdf.viewer.update();
    await pdf.complete(id);
  }
  assert.deepEqual(pdf.order.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(pdf.order.every(id => id <= 9));
  // Native PDF.js lookahead may start one neighbor; the cache controller adds
  // no scheduling of its own. Previously visited page 1 is still rendered.
  assert.equal(pdf.viewer._pages[0].renderingState, 3);
  assert.deepEqual(pdf.destroyed, []);
  job.stop();
  if (pdf.pending.has(9)) await pdf.complete(9);
  assert.ok(pdf.destroyed.includes(1));
});

test('manual PDF deletion, resets and teardown remain functional', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env);
  const original = pdf.view._trimPageBuffer;
  const job = pdf.create();
  await job.start();
  pdf.viewer._pages[8].deleteMe();
  assert.ok(pdf.destroyed.includes(9));
  pdf.viewer._pages[0].renderingState = 3;
  pdf.viewer._pages[0].reset();
  assert.equal(pdf.viewer._pages[0].renderingState, 0);
  pdf.eventBus.dispatch('pagesdestroy', { source: pdf.viewer });
  assert.equal(job.stopped, true);
  assert.equal(pdf.view._trimPageBuffer, original);
  assert.equal(pdf.domEvents.size, 0);
});

test('legacy 1.1 checkbox value is inherited by the renamed retention option', async () => {
  const env = makeEnvironment({ retainBrowsedPages: true });
  const pdf = makePDF(env);
  env.Zotero.Reader._readers.push(pdf.outer);
  env.manager.start();
  await env.settle();
  assert.equal(env.manager.retainBrowsedPages, true);
  assert.equal(env.manager.getStatus().cache.documents, 1);
  assert.deepEqual(pdf.order, []);
  env.manager.setOption('retainBrowsedPages', false);
  assert.equal(env.values.get('extensions.zotero.keepReaderReady.preloadWholePDF'), false);
  assert.equal(env.manager.getStatus().cache.documents, 0);
  env.manager.stop();
});

test('cancel pending initialization and roll back partial patch errors', async () => {
  const env = makeEnvironment();
  const pdf = makePDF(env, { delayed: true });
  let resolveOuter;
  pdf.outer._initPromise = new Promise(resolve => { resolveOuter = resolve; });
  const job = pdf.create();
  const starting = job.start();
  await env.settle();
  job.stop();
  pdf.ready();
  resolveOuter();
  await starting;
  assert.deepEqual(pdf.order, []);
  const second = makePDF(env);
  const original = second.view._trimPageBuffer;
  second.viewer._pages[5].destroy = null;
  assert.equal(await second.create().start(), false);
  assert.equal(second.view._trimPageBuffer, original);
  assert.equal(env.errors.length, 1);
});
