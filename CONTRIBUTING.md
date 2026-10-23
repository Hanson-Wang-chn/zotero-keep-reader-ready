# Contributing

Thank you for helping improve reading performance in Zotero. English and Chinese reports and pull requests are welcome.

## Report a problem

Use the issue forms. Include the plugin version and language, exact Zotero and OS versions, enabled settings, reproduction steps, expected/observed behavior, and the settings diagnostics. If possible, reproduce with a public PDF. Remove personal metadata from logs and screenshots before posting.

Distinguish a page rendering again after a zoom/edit from losing an unchanged canvas after tab or desktop switching. Both are useful reports, but they exercise different paths.

## Make a change

1. Fork and create a focused branch from `main`.
2. Use Node.js 22+ and Python 3.12+; no third-party dependencies are needed.
3. Run `node --test tests/*.test.cjs` and `python3 -m unittest discover -s tests -p 'test_*.py'`.
4. Build both languages with `python3 build.py`.
5. For reader/runtime changes, test manually in a disposable Zotero profile. Record the exact Zotero version and which settings you exercised.
6. Explain the behavior change, evidence, and limitations in the PR. Contributions are licensed under the repository’s MIT license.

## Translations

Edit `locales/en-US.json` and `locales/zh-CN.json`. Keep the same keys and interpolation placeholders in both. UI text should describe implemented behavior positively and precisely. Runtime code and page scheduling must remain shared across languages. Third-party error messages can retain their original language.

## Reader internals

Prefer narrow, reversible wrappers. Restore original descriptors, respect later wrappers installed by another plugin, avoid replacing public globals, and do not spoof document visibility or introduce a periodic keep-alive loop. Closing a document, disabling settings, and unloading the plugin must stop scheduling and restore hooks.

## Compatibility reports

The supported range is intentionally narrow. Automated tests use simulated readers/page views and do not prove desktop compatibility. Reports on other Zotero or OS versions should state what was tested before proposing a wider manifest range.
