# Generation usage

Usage & billing belongs to the open project and is available from its Project navigator. Records travel inside the self-contained `.showbiz` file. Credentials remain in device settings.

Each generation request retains its provider, model, kind, bounded settings, optional shot or asset identity, immutable price snapshot, preflight estimate and final outcome. USD amounts use integer microdollars. Provider receipts are distinct from estimates, including a reported zero. Known receipts survive failed media delivery. A running request becomes interrupted when its document is reopened.

The project summary separates reported charges, unconfirmed estimates and requests with unknown charges. It never adds an estimate to the same request's reported charge. Unknown provider charges are not described as free. Local hardware and electricity costs are outside provider billing. The history is paginated; totals cover the entire project.

The estimate calculator supports per-image, per-megapixel and per-second rates, with resolution, audio and generation-kind facets. Automatic video duration requires a supported duration range. Missing or ambiguous rates and invalid quantities produce an unavailable estimate. Rates older than seven days are marked stale. An estimate is neither an invoice nor a spending cap.

The receipt pattern follows [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting): a provider-reported cost is evidence separate from a preflight calculation. No provider implementation code was copied.

Agents can read `get_generation_usage` and `get_generation_cost_summary` for the selected project. Receipt-writing commands are not exposed as agent tools. Generation integrations populate the ledger through the main-process commands; this accounting foundation does not itself submit paid generation requests or discover provider rates.
