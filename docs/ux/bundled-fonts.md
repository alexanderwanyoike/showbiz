# Bundled interface font

Manrope is imported from the application TypeScript entry point, before the application stylesheet. This follows [Fontsource's Vite integration](https://fontsource.org/docs/guides/vite), allowing Vite to resolve the package-relative font URLs and emit hashed local assets. No runtime CDN, asset-copy script or custom loader is required. The existing relative Vite base also keeps those URLs usable from packaged file paths.

Importing this package through the Tailwind application stylesheet left its `./files/*.woff2` URLs unresolved during production optimization. Development and test-mode CSS transforms did not reveal the defect. The regression therefore builds the actual production entry point with `NODE_ENV=production` and checks that every referenced Manrope font is present in the emitted asset bundle.

The typeface remains Manrope Variable with its existing weight range and character subsets. Manrope is copyright 2019 The Manrope Project Authors and distributed under SIL Open Font License 1.1. Its complete notice is shipped in `public/fonts/Manrope-OFL.txt` alongside the application's bundled font resources.
