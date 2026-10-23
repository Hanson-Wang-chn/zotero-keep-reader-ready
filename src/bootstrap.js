/* SPDX-License-Identifier: MIT */
var runtime;
var runtimeScope;

function install() {}
function uninstall() {}

async function startup({ id, version, rootURI }) {
  runtimeScope = { Zotero, Services, Components };
  Services.scriptloader.loadSubScript(rootURI + "locale-data.js", runtimeScope);
  Services.scriptloader.loadSubScript(rootURI + "l10n.js", runtimeScope);
  Services.scriptloader.loadSubScript(rootURI + "pdf-preload.js", runtimeScope);
  Services.scriptloader.loadSubScript(rootURI + "page-cache.js", runtimeScope);
  Services.scriptloader.loadSubScript(rootURI + "runtime.js", runtimeScope);
  runtime = new runtimeScope.KeepReaderReadyRuntime({
    Zotero, Services, Components, L10n: runtimeScope.KeepReaderReadyL10n, PageCache: runtimeScope.KeepReaderReadyPageCache,
    PDFPreload: runtimeScope.KeepReaderReadyPDFPreload
  });
  runtime.start();
  Zotero.KeepReaderReady = runtime;
  try {
    await Zotero.PreferencePanes.register({
      pluginID: id,
      id: "keep-reader-ready-preferences",
      label: runtime.l10n.t("paneTitle"),
      src: rootURI + "preferences.xhtml",
      scripts: [rootURI + "locale-data.js", rootURI + "l10n.js", rootURI + "preferences-controller.js"],
      stylesheets: [rootURI + "preferences.css"],
      image: rootURI + "icon.svg"
    });
  } catch (error) {
    runtime.stop();
    if (Zotero.KeepReaderReady === runtime) delete Zotero.KeepReaderReady;
    runtime = null;
    runtimeScope = null;
    throw error;
  }
  Zotero.debug("[Keep Reader Ready] Started " + version);
}

function onMainWindowLoad({ window }) {
  runtime?.addWindow(window);
}

function onMainWindowUnload({ window }) {
  runtime?.removeWindow(window);
}

function shutdown() {
  if (runtime) {
    runtime.stop();
    if (Zotero.KeepReaderReady === runtime) delete Zotero.KeepReaderReady;
  }
  runtime = null;
  runtimeScope = null;
}
