# Maintained TypeScript checks

Run `yarn typecheck` before the frontend and Electron builds. CI runs the same check before the test suite. The check includes application code, Electron commands and tests; strict mode stays enabled.

Model IDs originate in validated provider configuration rather than a second handwritten union. The registry still rejects unknown IDs at runtime. Provider JSON is narrowed through explicit response schemas before its fields are read, following [TypeScript's narrowing guidance](https://www.typescriptlang.org/docs/handbook/2/narrowing.html). No reference implementation code was copied.

The HTTP bridge retains the response content type so video transports can distinguish JSON job responses from binary media, and media blobs use owned ArrayBuffers. Provider error and media tests retain their coverage. Testing Library role queries use the supported accessible-name options.
