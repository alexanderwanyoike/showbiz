# Local generation

Run a LocalAI server with image and/or video models installed. In Settings > Providers > LocalAI, enter its root server URL without `/v1` or another path and the installed model names, then save. The default server address is `http://127.0.0.1:8080`. Add the optional local server key only if authentication is enabled.

Choose Local image in the Bible or a shot's image model control, and Local video in the shot controls. Storyboard defaults and per-shot overrides retain these choices. The configured model names and server address belong to the device and are excluded from portable project data.

Images use LocalAI's OpenAI-compatible JSON image generation endpoint. Videos use its JSON `/video` endpoint with optional starting-image conditioning and duration. Both request URL output and retrieve media as binary; servers that return base64 remain supported. Download credentials are sent only to the configured server's origin, and an invalid media download retains the originating request ID. Auto duration leaves the choice to the installed model. The generic local entries do not advertise image editing, reference composition, audio switches or ending-frame support. The Bible disables reference-only actions for models without those capabilities; text-only frame generation remains available.

The protocols follow the official [LocalAI image generation](https://localai.io/docs/features/image-generation/) and [LocalAI video generation](https://localai.io/docs/features/video-generation/) documentation. No LocalAI implementation code was copied. Showbiz does not install models or launch the inference server.

Local responses do not supply a monetary charge. Usage integrations keep that charge unknown and distinguish provider billing from local hardware and electricity costs.

Manual verification used a small HTTP server implementing the documented JSON response shapes with disposable image/video fixtures, not a running inference model. Saved the configuration through the real Settings UI without a key, generated and saved an image and video, played the video and checked disabled unsupported actions. The test server runs outside the production application.


Local inference uses a bounded one-hour request window. Its explicitly scoped Undici dispatcher disables the ordinary five-minute header/body inactivity limits; cloud requests keep their existing dispatcher. Provider error messages and nested native connection causes are retained so missing models, refused connections and deadlines can be distinguished. This follows the official [Undici Agent](https://github.com/nodejs/undici/blob/main/docs/docs/api/Agent.md) pattern; the MIT-licensed dependency is pinned and its notice is included by the bundle licence collector.

Regression verification includes real loopback HTTP requests with delayed responses and bounded deadlines, URL/binary and base64 compatibility, credential isolation on cross-origin media URLs, invalid media/URL handling and request identity after a failed download. These checks use disposable fixtures, not paid providers or a user's LocalAI installation.
