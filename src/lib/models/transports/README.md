# Transports

Transports handle the actual API communication for a provider. Most models can reuse an existing transport — you only need a new transport when adding a new API provider.

## Existing Transports

| Transport | Provider | Used By |
|-----------|----------|---------|
| `kie-video` | kie.ai | Kling, Seedance, Hailuo, Wan, Sora, Runway, Grok |
| `kie-image` | kie.ai | Flux Kontext, Seedream |
| `google-video` | Google AI | Veo 3, Veo 3.1 Fast |
| `google-image` | Google AI | Imagen 4, Nano Banana, Nano Banana Pro |
| `ltx` | LTX Labs | LTX Video |

## Adding a New Transport

Only needed when integrating a completely new API provider.

1. Create `transports/your-transport.ts` implementing `VideoTransport` and/or `ImageTransport` from `transports/types.ts`
2. Register it in `transports/index.ts`
3. If the provider uses a new API key, add the key provider to the settings system
4. Create JSON configs in `providers/video/` or `providers/image/` referencing your transport name
5. Run `yarn test`
6. Submit PR
