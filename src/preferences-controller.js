/* SPDX-License-Identifier: MIT */
// Zotero loads pane scripts in a sandbox, whereas inline XUL handlers execute
// in the preferences window. Export the controller explicitly to that window.
window.KeepReaderReadyPreferences = {
  init(win) {
    const doc = win.document;
    const root = doc.getElementById("keep-reader-ready-pane");
    if (!root || root.hasAttribute("data-initialized")) return;
    root.setAttribute("data-initialized", "true");
    const api = Zotero.KeepReaderReady;
    const enabled = doc.getElementById("keep-reader-ready-enabled");
    const tabs = doc.getElementById("keep-reader-ready-tabs");
    const apply = doc.getElementById("keep-reader-ready-reapply");
    const render = () => {
      if (!root.isConnected) return;
      const status = api?.getStatus();
      if (!status) {
        doc.getElementById("keep-reader-ready-status").textContent = "插件未运行，请在“工具 → 插件”中启用。";
        enabled.disabled = tabs.disabled = apply.disabled = true;
        return;
      }
      enabled.checked = status.enabled;
      tabs.checked = status.keepTabsLoaded;
      tabs.disabled = apply.disabled = !status.enabled;
      doc.getElementById("keep-reader-ready-status").textContent = status.enabled
        ? `已启用 · 已保护 ${status.protectedReaders} / ${status.loaded} 个已加载 PDF 阅读器`
        : "已关闭 · 使用 Zotero 原有的缓存清理和标签页卸载规则";
      doc.getElementById("keep-reader-ready-version").textContent =
        `当前 Zotero：${status.version} · 标签页卸载保护：${status.enabled && status.keepTabsLoaded ? status.protectedWindows + " 个主窗口" : "关闭"}`;
      const errors = doc.getElementById("keep-reader-ready-errors");
      errors.hidden = !status.errors.length;
      errors.textContent = status.errors.length ? "检查结果：" + status.errors.join("；") : "";
    };
    enabled.addEventListener("command", () => api.setOption("enabled", enabled.checked));
    tabs.addEventListener("command", () => api.setOption("keepTabsLoaded", tabs.checked));
    apply.addEventListener("command", async () => {
      await api.applyToAll();
      render();
    });
    const unsubscribe = api?.subscribe(render);
    win.addEventListener("unload", () => unsubscribe?.(), { once: true });
    render();
  }
};
