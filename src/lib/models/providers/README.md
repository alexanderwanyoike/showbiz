# Model Providers

Config-driven model system. Adding a model = adding a JSON file.

## Adding a New Video Model

1. Copy an existing JSON config from `video/` (e.g., `kling-3.json` for kie.ai models)
2. Update: `id`, `name`, `description`, `models` (API model IDs), `capabilities`, `defaults`
3. Set `transport` to match the API provider (`kie-video`, `google-video`, or `ltx`)
4. Set `apiKeyProvider` to the key this model needs (`gemini`, `ltx`, or `kie`)
5. Run `yarn test` — validation catches mistakes automatically
6. Submit PR

### Video Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (added to `VideoModelId` type) |
| `name` | Yes | Display name |
| `description` | Yes | Short description for UI |
| `transport` | Yes | `kie-video`, `google-video`, or `ltx` |
| `enabled` | Yes | Set `false` to hide from UI |
| `apiKeyProvider` | Yes | `gemini`, `ltx`, or `kie` |
| `models.textToVideo` | One required | Model ID for text-to-video |
| `models.imageToVideo` | One required | Model ID for image-to-video |
| `paramMapping` | No | Maps settings to API field names |
| `fixedParams` | No | Always-sent parameters |
| `capabilities` | Yes | What the model supports (durations, resolutions, etc.) |
| `defaults` | Yes | Default values for settings |

## Adding a New Image Model

1. Copy an existing JSON config from `image/` (e.g., `nano-banana.json` for Google models)
2. Update: `id`, `name`, `description`, `models.generate`
3. Set `transport` to `google-image` or `kie-image`
4. Run `yarn test`
5. Submit PR

### Image Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `name` | Yes | Display name |
| `description` | Yes | Short description |
| `transport` | Yes | `google-image` or `kie-image` |
| `enabled` | Yes | Set `false` to hide |
| `apiKeyProvider` | Yes | `gemini`, `ltx`, or `kie` |
| `models.generate` | Yes | Model ID for generation |
| `models.edit` | No | Model ID for editing (if different) |
| `supportsEditing` | Yes | Whether editing is supported |
| `supportsInpainting` | Yes | Whether inpainting is supported |
