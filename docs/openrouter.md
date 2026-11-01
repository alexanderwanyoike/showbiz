# OpenRouter generation

Add an OpenRouter API key in Settings > Providers. Choose the OpenRouter entry for Nano Banana 2, Seedream 4.5 or Veo 3.1 in the existing model picker. Provider identity remains visible in selected shot controls and Bible image choices. Storyboard defaults and per-shot overrides work the same way as other providers.

Images use the dedicated JSON Image API with optional reference images for editing and composition. Videos use the asynchronous Video API, including text prompts, first/last frames, duration, resolution, aspect ratio and audio. The main-process HTTP proxy downloads media, which is saved through the existing image/video version commands into the project document.

Responses retain provider-reported USD charges separately from estimates. Missing charges stay unknown, including failed requests. A reported zero is retained as zero. Charges remain available when the provider produced media but its format or download could not be imported. Polling and authenticated download URLs are constructed from the job identity under the OpenRouter origin. Provider-supplied URLs do not receive the key.

The model capabilities were checked against the public image and video discovery endpoints on 31 October 2026. The integration follows the official [Image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) and [Video API](https://openrouter.ai/docs/guides/overview/multimodal/video-generation) contracts and the existing Showbiz transport composition pattern. No provider implementation code was copied.

Automated tests and the manual generation demo use local response fixtures. No paid generation was submitted. Request-scoped receipt observers are available to the dependent accounting integration; this provider change does not itself add the preflight cost display.

### Recovering status checks

OpenRouter and Replicate status polling retries up to three consecutive network,
HTTP 429 or HTTP 5xx failures. A successful status response resets that allowance.
The existing job is checked again; the generation POST is never resubmitted.
Terminal polling errors include the provider job identity so the request can be
checked before starting another generation. OpenRouter preserves monetary usage
from submission, including a reported zero, if later status responses omit usage.

KIE responses are checked for HTTP and API error codes before validating success
fields. This follows KIE's documented HTTP-200 error envelopes. Veo operations use
safe response validation and stop promptly on non-transient access errors.

Sources: [OpenRouter video generation](https://openrouter.ai/docs/api/api-reference/video-generation/create-videos),
[KIE task details](https://docs.kie.ai/market/common/get-task-detail),
[Google API troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).
Public OpenRouter catalog verification returned Veo 3.1 resolutions `720p`,
`1080p` and `4K`; resolution spelling remains provider-specific. No generation was
submitted during this verification.
