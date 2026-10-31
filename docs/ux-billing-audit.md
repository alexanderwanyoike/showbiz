# Billing interface scope audit

The audit follows the existing native document workspace and [Apple toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars): controls should make the content they affect clear. [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) keeps secondary explanations accessible without crowding the working view.

| Finding | Correction |
| --- | --- |
| A rate editor inside each shot or asset appeared to edit that item, but changed all projects on the device. | Model pricing opens a clearly titled device-wide dialog. The nearby generation control keeps read-only cost details. |
| Disabled providers invited key entry despite having no usable generation models. | Setup shows enabled providers and the optional FAL billing connection. Previously saved inactive credentials remain available for removal. |
| A saved API key was labeled Connected without checking connectivity. | Preferences says Key saved and counts saved credentials. Local server availability is not inferred from key storage. |
| Bundled published prices looked like live provider rates. | Published snapshots, cached API rates and manual estimates have distinct labels and source dates. |
| A provider historical average could be mistaken for a quote adjusted to the chosen video settings. | The estimate says provider history and states that duration, resolution, audio and input media are not included in that calculation. |
| Refresh only reloaded the local ledger. | Refresh charges reads supported provider billing APIs, prevents duplicate refreshes and then rereads recorded project totals. |
| Project totals could be mistaken for provider account billing. | The view says that only requests recorded in this project are included. |
| Missing or denied billing access provided no useful next step. | Charge unconfirmed reveals the reason, including FAL's separate optional billing credential and required read permissions. |
| Provider billing explanations competed with the request history. | The main explanation is short; provider limitations and longer per-request notes use named disclosures. |
