# Architecture

## Boundaries

The plugin targets Zotero 10.0.6 and its pinned reader/PDF.js implementation. It does not alter a PDF or the Zotero database. Preferences are Boolean values under `extensions.zotero.keepReaderReady.`.

`bootstrap.js` loads the generated locale data, localization helper, feature components, and runtime into the plugin scope. The preference pane loads the same selected catalog. Its controller is explicitly exported to the preference window for the XUL inline load handler.

## Background protection

`runtime.js` wraps the PDF reader’s `_handleVisibilityChange` while enabled. It cancels the native pending suspension timeout and resumes an already suspended reader once. Visibility itself is unchanged. The original property descriptor is restored on disable; an inactive wrapper delegates to its original if another plugin has subsequently wrapped it.

`Zotero.Reader.open` is observed without changing its exact return value or original errors. The runtime waits for the outer reader’s `_initPromise`, then protects readers that are still alive and registered.

## Automatic tab unloading

The native `unloadUnusedTabs` call is wrapped. During that synchronous automatic pass only, `unload` skips registered PDF readers. Other document types and direct/manual unload calls retain their normal behavior. The temporary interception is restored in `finally`.

## Retained canvases

`page-cache.js` suppresses the primary PDF view’s `_trimPageBuffer` and ordinary PDFPageView `destroy` calls while retention is active. This covers Zotero’s trim pass and PDF.js’s private buffer eviction. Explicit `deleteMe` operations temporarily allow the native destroy path. Native resets for zoom/edit state are preserved.

Disable restores hooks and releases distant page canvases, including page views already evicted from the native buffer. Closing/unloading a document stops the controller. Split-view behavior is not independently guaranteed; progress describes the primary reading view.

## Whole-PDF rendering (1.2.0)

The explicit driver in `pdf-preload.js` selects unfinished visible base pages, then visible detail views, then ongoing/paused background work and remaining base pages. It obtains a missing `pdfPage` using the document proxy and passes the actual view to the native queue’s `renderView`. That sets the native priority ID and resumes paused work; calling `draw()` alone can leave a canvas paused.

Page-rendered and view-change events schedule the next task. The driver does not wait for the top-level reader’s unresolved initialization promise or require document-wide page metadata to finish first. It does not rely on the native automatic priority selector discovering all remaining pages. It yields after each scheduling event instead of polling.

Native idle cleanup is guarded while a rendering pass still has unfinished work; otherwise it could reset an unfinished distant canvas while visible pages are already complete. Printing pauses new work. Errors are counted and skipped for that pass. Scale/rotation/layer events make needed new rendering eligible. Turning the option off invalidates pending asynchronous work and restores driver-only hooks.

## Localization and builds

Both languages share byte-identical executable feature files. `build.py` injects the selected JSON catalog into `locale-data.js`, renders XML-escaped preference strings, and selects localized manifest metadata/update URL. The other feature code is unchanged between language packages.

The legacy key `preloadWholePDF` stores reading-driven retention because existing 1.1 installations already use that key. The new real whole-PDF preloader uses `eagerRenderWholePDF` (1.2.0). This preserves the old saved choice without silently enabling proactive rendering.

## Upstream references

- [Zotero outer reader, 10.0.6](https://github.com/zotero/zotero/blob/10.0.6/chrome/content/zotero/xpcom/reader.js)
- [Zotero tabs, 10.0.6](https://github.com/zotero/zotero/blob/10.0.6/chrome/content/zotero/tabs.js)
- [Reader visibility handling, pinned revision](https://github.com/zotero/reader/blob/5802d14a76552e10000124d2431e352e92054f01/src/common/reader.js)
- [PDF view trimming, pinned revision](https://github.com/zotero/reader/blob/5802d14a76552e10000124d2431e352e92054f01/src/pdf/pdf-view.js)
- [PDF.js viewer](https://github.com/zotero/pdf.js/blob/37919f50c3c3584dfe474fc90ee1260c2b9f7058/web/pdf_viewer.js)
- [PDF.js rendering queue](https://github.com/zotero/pdf.js/blob/37919f50c3c3584dfe474fc90ee1260c2b9f7058/web/pdf_rendering_queue.js)
- [PDF.js page view](https://github.com/zotero/pdf.js/blob/37919f50c3c3584dfe474fc90ee1260c2b9f7058/web/pdf_page_view.js)
- [Zotero plugin/update manifest documentation](https://www.zotero.org/support/dev/zotero_7_for_developers)

Upstream sources retain their original licenses and are not redistributed as plugin implementation. Tests include our minimal behavior models; local research files may optionally supply the pinned upstream functions for comparison.
