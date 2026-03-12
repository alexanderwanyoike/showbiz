## Release: vX.Y.Z

### What's Included

<!-- List features, fixes, and changes in this release. -->

#### Features
-

#### Fixes
-

#### Chores
-

### Pre-merge Checklist

- [ ] All feature branches merged into `dev`
- [ ] `yarn test` — all tests pass
- [ ] `cargo test` — all Rust tests pass
- [ ] `yarn build:frontend` — no build errors
- [ ] Full app tested in `yarn dev` (Linux/macOS/Windows as applicable)
- [ ] Version bumped in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
- [ ] CHANGELOG updated (if applicable)

### Post-merge

- [ ] Tag `vX.Y.Z` on `main` after merge
- [ ] CI creates draft GitHub Release with built artifacts
- [ ] Verify release artifacts on GitHub
