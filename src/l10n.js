/* SPDX-License-Identifier: MIT */
/* locale-data.js is generated from one checked-in translation catalog. */
var KeepReaderReadyL10n = {
  locale: KeepReaderReadyLocaleData.locale,
  strings: KeepReaderReadyLocaleData.strings,
  t(key, values = {}) {
    const message = this.strings[key];
    if (typeof message !== "string") throw new Error("Missing translation: " + key);
    return message.replace(/\{([A-Za-z]+)\}/g, (_, name) => {
      if (!(name in values)) throw new Error("Missing translation parameter: " + name);
      return String(values[name]);
    });
  }
};
