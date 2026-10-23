# Maintaining releases

## Versioned history

- `v1.0.0`, `v1.0.1`, `v1.1.0`: historical original source imports, with original installers archived in `archive/releases/` on `main`.
- `v1.1.1`, `v1.2.0`: community source snapshots with the corresponding feature set, both translation catalogs, tests and build tooling.
- `main`: current code plus release/archive maintenance. Tags are never retargeted to change a published package.

The same plugin ID is deliberately retained for in-place upgrades and shared settings. `en-US` and `zh-CN` are asset variants, not separate extension identities.

## Prepare a future version

1. Update `src/manifest.json`, both translation catalogs if necessary, changelog, compatibility notes and release notes.
2. Run the Node and Python test suites; build both language packages and perform desktop smoke tests.
3. Commit the change and create an annotated `vX.Y.Z` tag pointing to the tested source.
4. Add the version to `scripts/publish_releases.py` / the release-workflow options when publishing through that workflow.
5. Push the branch and tag. Run **Actions → Publish releases → Run workflow** for the desired version.

The workflow uses GitHub’s repository-scoped temporary token to attach artifacts. It does not require a personal access token or stored credentials. It builds current releases from their tags, publishes bilingual notes and source ZIPs, and then writes language-specific update manifests with SHA-256 hashes. Existing assets are compared before reuse; differing published assets cause a failure instead of being overwritten.

`SHA256SUMS.txt` covers the release XPIs and source ZIP. ZIP timestamps and file ordering are fixed. Source archives exclude `dist`, Git internals, optional research files, and Python caches.

## Update channels

`updates/en-US.json` and `updates/zh-CN.json` use Zotero’s JSON update format. Each points only to its matching language asset and includes compatibility bounds and the asset’s SHA-256 hash. Publish assets before updating the manifests. Future higher versions should be added without rewriting historical releases.

## Historical assets

Original packages are retained byte-for-byte in `archive/releases/`. Version 1.0.0 is explicitly marked as having a known install-manifest problem and its release is a historical prerelease. Historical releases are not the default download recommendation. Do not rebuild an old original artifact and silently replace its bytes.
