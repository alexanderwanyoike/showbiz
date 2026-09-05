# Automatic update delivery

## Release artifact contract (Card 6)

Every supported platform is built in isolation with `yarn build --publish never`.
The public GitHub provider is explicitly configured as
`alexanderwanyoike/showbiz`. The builder generates updater metadata locally;
platform jobs have no release-write permission. Only release PRs from this
repository's `dev` branch into `main`, and `v*` tag builds, run packaging and
distribution assembly. Release PRs never create a GitHub Release.

Feature PRs and ordinary `dev`/`main` branch builds run `yarn test` only, including
the distribution-contract tests, without building or uploading installers. Every
PR runs tests, including documentation-only changes, so the required `test` check
can complete. Failed tests prevent packaging through the job dependency.

The current supported architectures match the published installers and website:

| Platform | Required release assets for version `X.Y.Z` |
| --- | --- |
| Linux x64 | `Showbiz-X.Y.Z.AppImage`, `showbiz_X.Y.Z_amd64.deb`, `latest-linux.yml` |
| macOS arm64 | `Showbiz-X.Y.Z-arm64.dmg`, `Showbiz-X.Y.Z-arm64.dmg.blockmap`, `Showbiz-X.Y.Z-arm64-mac.zip`, `Showbiz-X.Y.Z-arm64-mac.zip.blockmap`, `latest-mac.yml` |
| Windows x64 | `Showbiz.Setup.X.Y.Z.exe`, `Showbiz.Setup.X.Y.Z.exe.blockmap`, `latest.yml` |

AppImage is the initial Linux automatic-update target. Its blockmap is embedded
in the AppImage, with its size in the metadata and file footer. The `.deb` remains
a manual installation/recovery option; builder also lists its checksum in Linux
metadata. macOS needs both the DMG for manual installation and the ZIP for the
updater. Windows uses NSIS. Do not rename assets after packaging: metadata and the
website refer to these exact names, including dots in the Windows filename.

Each `latest*.yml` carries the release version, asset-relative URLs, SHA-512
checksums, and sizes. Relative filenames resolve within the same versioned GitHub
Release. The validator rejects arbitrary hosts, paths, other versions, missing or
duplicate metadata entries, missing/empty artifacts, byte/checksum or size
mismatches, unreadable companion blockmaps, and invalid embedded AppImage maps.
The SHA-512 values verify build consistency; they do not establish publisher
identity or replace code signing.

`scripts/prepare-release.mjs` stages only the validated contract files in a new
directory, excluding builder diagnostics and unpacked applications. An existing
output directory is rejected to avoid mixing assets from different builds.

```bash
yarn test:distribution
yarn build --publish never
yarn prepare:release --tag v1.0.2 --platform linux-x64 --source dist-package --output release-platform
```

Use the version in the build's `package.json`. CI sets it from a stable `vX.Y.Z`
tag before packaging. To validate a merged platform set, omit `--platform` and
point `--source` at a directory containing all eleven contract files.

## Draft review and stable publication

1. Platform jobs validate and upload separate workflow artifacts.
2. One assembly job downloads all platforms, verifies the full contract again,
   and stores the validated `release-set` workflow artifact.
3. Only a tag run can reach the release job. It requires the tag's commit to be
   on `main`, then creates one draft GitHub Release with that validated set.
   Ordinary PR and branch builds never create or modify releases.
4. The owner reviews the draft before publishing a stable release. Drafts are
   invisible to public updater clients. Prerelease/build-suffixed tags are rejected
   by this stable pipeline. Future updater clients must also disable prereleases
   and downgrades explicitly.

Release creation refuses to overwrite an existing release, including an existing
draft on a workflow rerun. Inspect a failed run before retrying; never force-push
an existing tag or replace published update assets. Bump the patch version for a
released artifact correction. Workflow artifacts expire after one day for the
platform sets and seven days for the complete set; GitHub Release assets persist.

Only a **published stable** release is eligible for automatic updates. The
builder's `releaseType: draft` also preserves draft creation if its publisher is
used explicitly in the future. It is not a client-side release filter.

## Remaining delivery and release gates

Card 6 supplies update-ready packaging, not an updater-enabled application.
Cards 7-9 add the main-process updater, user controls, and protection for active
work. Downloads and installation must remain explicit user actions; background
checks must never force a restart.

Signing and real platform installation verification remain Card 10. The current
workflow retains disabled signing autodiscovery and does not claim signed output.
Before publishing the updater bridge release, the owner must provision signing
and notarization, restrict signing secrets to protected release jobs, and record
clean-install and update-install evidence on every supported target. macOS
automatic updates require a signed application.

Card 11 is the one-time manual bridge installation for existing users, followed
by a real automatic patch update on every supported target. It depends on Cards
1-3 and 6-10. Credential encryption and migration (Cards 4-5) are deferred and are
not bridge-release dependencies. Verify preservation of existing credentials,
SQLite data, media, and projects without introducing an encryption migration.
OpenRouter and spending reports remain outside this delivery.

## References

- [Electron updater targets, metadata, and signing requirements](https://www.electron.build/v26/docs/features/auto-update/)
- [Electron builder publishing configuration](https://www.electron.build/v26/docs/publish/)
- Installed `app-builder-lib/out/publish/PublishManager.js` and
  `updateInfoBuilder.js` (26.15.3) confirm local metadata generation with
  `--publish never` when a provider is configured.
- Jolt Console and Spoke release assembly scripts provided the pattern of
  isolated platform builds followed by one complete-set validation gate.
