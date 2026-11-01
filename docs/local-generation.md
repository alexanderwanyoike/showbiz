# Local generation

Run a LocalAI server with image and/or video models installed. In Settings > Providers > LocalAI, enter its server URL and the installed model names, then save. The default server address is `http://127.0.0.1:8080`. Add the optional local server key only if authentication is enabled.

Choose Local image in the Bible or a shot's image model control, and Local video in the shot controls. Storyboard defaults and per-shot overrides retain these choices. The configured model names and server address belong to the device and are excluded from portable project data.

Images use LocalAI's OpenAI-compatible JSON image generation endpoint and base64 output. Videos use its JSON `/video` endpoint with optional starting-image conditioning and duration. Auto duration leaves the choice to the installed model. The generic local entries do not advertise image editing, reference composition, audio switches or ending-frame support. The Bible disables reference-only actions for models without those capabilities; text-only frame generation remains available.

The protocols follow the official [LocalAI image generation](https://localai.io/docs/features/image-generation/) and [LocalAI video generation](https://localai.io/docs/features/video-generation/) documentation. No LocalAI implementation code was copied. Showbiz does not install models or launch the inference server.

Local responses do not supply a monetary charge. Usage integrations keep that charge unknown and distinguish provider billing from local hardware and electricity costs.

Manual verification used a small HTTP server implementing the documented JSON response shapes with disposable image/video fixtures, not a running inference model. Saved the configuration through the real Settings UI without a key, generated and saved an image and video, played the video and checked disabled unsupported actions. The test server runs outside the production application.
