# Generation usage

Usage & billing belongs to the open project and is available from its Project navigator. Records travel inside the self-contained `.showbiz` file. Credentials remain in device settings.

Each generation request retains its provider, model, kind, bounded settings, optional shot or asset identity, immutable price snapshot, preflight estimate and final outcome. USD amounts use integer microdollars. Provider receipts are distinct from estimates, including a reported zero. Known receipts survive failed media delivery. A running request becomes interrupted when its document is reopened.

The project summary separates reported charges, unconfirmed estimates and requests with unknown charges. It never adds an estimate to the same request's reported charge. Unknown provider charges are not described as free. Local compute estimates use your saved rate; hardware and electricity costs are otherwise unknown. The history is paginated; totals cover the entire project.

The estimate calculator supports per-image, per-megapixel and per-second rates, with resolution, audio and generation-kind facets. Automatic video duration requires a supported duration range. Missing or ambiguous rates and invalid quantities produce an unavailable estimate. Rates older than seven days are marked stale. An estimate is neither an invoice nor a spending cap.

The receipt pattern follows [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting): a provider-reported cost is evidence separate from a preflight calculation. No provider implementation code was copied.

Agents can read `get_generation_usage` and `get_generation_cost_summary` for the selected project. Receipt-writing commands are not exposed as agent tools. Image generation, edits, reference composition and shot generation populate the ledger before submitting work, then retain receipts and the final outcome.

Generation controls show the estimate before submission and the last reported charge or unconfirmed estimate afterward. Rate details show the provider, pricing source and date. OpenRouter prices are discovered from its model metadata and cached on the device. Bundled Gemini and selected FAL rates follow their published pricing; unsupported or missing prices stay explicit. Input-token charges and dimension-dependent adjustments may be excluded, as shown beside the rate.

Use Set your rate for a custom USD-per-image or USD-per-second estimate, including local compute. Video rates apply to the selected resolution and audio settings. Overrides and cached prices belong to the device; frozen request history travels with the project. Changing a rate never rewrites previous requests. Use provider rate removes the override.

Pricing patterns and sources: [Google image pricing](https://ai.google.dev/gemini-api/docs/pricing), [FAL Seedance 2](https://fal.ai/models/bytedance/seedance-2.0/image-to-video), [FAL Veo 3.1](https://fal.ai/models/fal-ai/veo3.1/first-last-frame-to-video), and [OpenRouter video generation](https://openrouter.ai/docs/guides/overview/multimodal/video-generation). No provider implementation code was copied.
