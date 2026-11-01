# Generation usage and provider billing

Usage & billing belongs to the open project. Only requests recorded by this project are included. Totals are not an account balance, invoice or a view of all activity on a provider account. History and immutable preflight price snapshots travel inside the self-contained `.showbiz` file. Credentials, custom rates and cached prices stay on the device.

Generation controls show an approximate cost before submission. Last request shows the subject's latest image or video attempt, with its original model, provider and outcome, even when a different model is selected for future work. It is not a claim about the currently visible take. Each request retains its provider, model, generation kind, shot or asset identity, bounded settings, price basis, outcome and provider request ID when returned. Reported monetary charges are separate from unconfirmed estimates, including a genuine reported zero. A failed download can still have a provider charge. A missing price or receipt is never treated as free.

## Provider behavior

- **FAL:** authenticated pricing and estimate API calls use the selected generation endpoint, including edits, composition and separate end-frame video endpoints. The current provider unit price is retained. The preflight amount uses FAL's historical per-request estimate because units such as tokens, megapixels and model-specific units cannot safely be equated with video duration. It is explicitly labeled as provider history and is not presented as a settings-specific quote. Billing events supply the actual discounted charge for the exact provider request ID. All matching pages are read before a charge is recorded.
- **OpenRouter:** image endpoint metadata and video model metadata supply API rates, with supported duration, resolution and audio facets. Image output estimates can exclude input charges. Generation responses supply actual charges when available. Delayed charges are read from the video job or generation metadata endpoint using the provider ID; no media generation is resubmitted to check a charge.
- **Gemini:** the normal generation API does not return a per-request monetary receipt. Bundled published rates are labeled as published snapshots, with their source and date. They remain estimates, including any stated input-charge exclusions.
- **Local:** running cost is unknown unless a custom compute estimate is entered. A custom estimate is not a provider-reported charge.

API rate caches refresh after one hour. If an OpenRouter refresh fails, an older cached estimate is marked unconfirmed with its original retrieval date. Published snapshots retain their source date; their age is separate from an API refresh failure. Changing a provider key clears its account price cache; manual rates remain. Automatic duration requires a supported range for settings-based estimates. Missing or ambiguous prices stay unavailable.

## Confirming charges

Provider request identities are saved before queue polling. Showbiz checks pending charges after generation finishes, including failed delivery. Opening Usage & billing or choosing Refresh charges checks the displayed requests and then rereads project totals. Missing receipts, denied permissions, malformed responses and incomplete pagination retain the original unconfirmed estimate; they do not invent a final charge. Refresh can be retried later when a provider publishes delayed billing events.

FAL billing requires `billing:usage:read`, `auth:keys:read` and `account:users:read`. Settings offers an optional **fal.ai billing** key using the provider's `BILLING` preset, separate from the generation key. The normal FAL key is used when a separate billing key has not been provided. Showbiz does not create keys or expand permissions. A saved key is labeled **Key saved**, not a verified connection.

## Custom model rates

Model pricing opens a dialog that explicitly applies to this model on this device across all projects. Video overrides apply to the selected resolution and audio settings. Saving or removing an override affects future estimates and never rewrites recorded history. Local compute estimates can use the same mechanism. Escape, Close and Cancel discard the staged rate without changing the saved rate. A pending save keeps the dialog open until it finishes.

Agents can read project usage, totals and saved price bases. Credential and receipt-writing commands are not exposed as MCP tools. The reconciler reads provider APIs rather than accepting a caller-supplied charge.

## Sources and verification

The request identity and receipt workflow follows the providers' documented APIs. No provider implementation code was copied.

- [FAL unit pricing](https://fal.ai/docs/platform-apis/v1/models/pricing)
- [FAL cost estimates](https://fal.ai/docs/platform-apis/v1/models/pricing/estimate)
- [FAL billing events and permissions](https://fal.ai/docs/platform-apis/v1/models/billing-events)
- [FAL SDK request identity handling](https://github.com/fal-ai/fal-js/blob/main/libs/client/src/response.ts)
- [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
- [OpenRouter video job metadata](https://openrouter.ai/docs/api/api-reference/video-generation/get-videos)
- [OpenRouter generation charge metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and [usage metadata](https://ai.google.dev/api/generate-content#UsageMetadata)

Read-only live verification used the configured FAL generation key: pricing and historical estimates returned HTTP 200; billing events returned HTTP 403 and stayed unconfirmed. The production pricing helpers parsed live OpenRouter image rates for Seedream 4.5 and Nano Banana 2 and video rates for Veo 3.1. Video catalog validation is scoped to the selected model so unrelated editing or upscaling entries with no resolution list cannot disable valid pricing. No paid generation was submitted. Discounted receipts, delayed receipts, denied access, missing data, malformed responses, partial pagination, actual zero, request scoping and document reopen are verified through isolated API-contract tests. Authenticated OpenRouter receipt lookup and a successful FAL billing read require suitable credentials and were not claimed as live-verified.

## Accounting failures after generation

Receipt or outcome storage errors do not turn successful media delivery into a failed generation. The generated result is returned with explicit accounting warnings, also shown beside the affected subject's generation costs. No receipt amount is invented when storage fails. A failure to begin the usage record still stops the operation before submitting a generation request.

Provider reconciliation runs after media is delivered. Usage & billing displays recorded project rows and totals before provider lookups finish, keeps the ledger visible during refresh, and updates receipts when the background check completes. Automatic checks of an unconfirmed request back off for one minute on this device; changing its billing credential or choosing Refresh charges retries immediately. Identical in-flight selections share one check. Reported counts include only newly written charges, so concurrent receipts cannot inflate them.

Custom rates override only matching generation settings. Other resolutions or audio settings use their own provider price basis, retaining provider source labels rather than inheriting custom-rate provenance. Removing a custom rate removes only its exact settings signature. If a saved rate applies across resolutions or audio settings, Model pricing labels it as a shared custom rate before removal; other custom rates remain saved.


FAL cache entries are separated by generation endpoint, including first/last-frame video endpoints. A failed refresh can retain only a matching historical estimate from the same device credential, with its original retrieval date and an explicit refresh-unavailable label. Account-specific cache writes check the initiating key again at the synchronous device-storage boundary; key material is not stored in the price basis or project history.

A zero returned by FAL's historical estimate API is treated as an unavailable quote, not a zero-cost estimate for the next request. It is not included in a new request's unconfirmed estimate total. Explicit manual zero rates and actual zero monetary receipts remain valid. The API documentation does not define zero as proof of missing account history. Historical per-call amounts remain separate from live unit prices: converting units into a settings-specific quote requires a documented billable quantity, rather than assuming tokens or model-specific units are video seconds.
