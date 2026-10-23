/* SPDX-License-Identifier: MIT */
window.KeepReaderReadyPreferences = {
  init(win) {
    const doc = win.document;
    const root = doc.getElementById("keep-reader-ready-pane");
    if (!root || root.hasAttribute("data-initialized")) return;
    root.setAttribute("data-initialized", "true");
    const api = Zotero.KeepReaderReady;
    const t = (key, values) => KeepReaderReadyL10n.t(key, values);
    const enabled = doc.getElementById("keep-reader-ready-enabled");
    const tabs = doc.getElementById("keep-reader-ready-tabs");
    const cache = doc.getElementById("keep-reader-ready-cache");
    const preload = doc.getElementById("keep-reader-ready-preload");
    const apply = doc.getElementById("keep-reader-ready-reapply");
    const render = () => {
      if (!root.isConnected) return;
      const status = api?.getStatus();
      if (!status) {
        doc.getElementById("keep-reader-ready-status").textContent = t("notRunning");
        for (const control of [enabled, tabs, cache, preload, apply]) {
          if (control) control.disabled = true;
        }
        return;
      }
      enabled.checked = status.enabled;
      tabs.checked = status.keepTabsLoaded;
      cache.checked = status.retainBrowsedPages;
      if (preload) preload.checked = status.preloadWholePDF;
      for (const control of [tabs, cache, preload, apply]) {
        if (control) control.disabled = !status.enabled;
      }
      doc.getElementById("keep-reader-ready-status").textContent = status.enabled
        ? t("protectedStatus", { protected: status.protectedReaders, loaded: status.loaded })
        : t("disabledStatus");
      doc.getElementById("keep-reader-ready-version").textContent = t("versionStatus", {
        version: status.version,
        windows: status.enabled && status.keepTabsLoaded
          ? t("windowsCount", { count: status.protectedWindows }) : t("off")
      });
      doc.getElementById("keep-reader-ready-cache-status").textContent = !status.enabled
        ? t("cacheOff") : !status.retainBrowsedPages
          ? t(status.preloadWholePDF ? "cachePreload" : "cacheOff")
          : t("cacheProgress", status.cache) +
            (status.cache.waiting ? t("initializing", { count: status.cache.waiting }) : "");
      if (preload) {
        const progress = status.preload;
        doc.getElementById("keep-reader-ready-preload-status").textContent =
          !status.enabled || !status.preloadWholePDF ? t("preloadOff") :
            t("preloadProgress", progress) +
            (progress.total && progress.ready === progress.total && !progress.waiting && !progress.unavailable ? t("complete") : "") +
            (progress.waiting ? t("initializing", { count: progress.waiting }) : "") +
            (progress.failed ? t("failedPages", { count: progress.failed }) : "") +
            (progress.unavailable ? t("failedDocuments", { count: progress.unavailable }) : "");
      }
      const errors = doc.getElementById("keep-reader-ready-errors");
      errors.hidden = !status.errors.length;
      errors.textContent = status.errors.length
        ? t("diagnostics", { errors: status.errors.join(t("errorSeparator")) }) : "";
    };
    enabled.addEventListener("command", () => api.setOption("enabled", enabled.checked));
    tabs.addEventListener("command", () => api.setOption("keepTabsLoaded", tabs.checked));
    cache.addEventListener("command", () => api.setOption("retainBrowsedPages", cache.checked));
    preload?.addEventListener("command", () => api.setOption("preloadWholePDF", preload.checked));
    apply.addEventListener("command", async () => { await api.applyToAll(); render(); });
    const unsubscribe = api?.subscribe(render);
    win.addEventListener("unload", () => unsubscribe?.(), { once: true });
    render();
  }
};
