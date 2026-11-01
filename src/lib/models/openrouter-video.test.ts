import { afterEach, expect, it, vi } from "vitest";
import { generateOpenRouterVideo } from "./openrouter-video";
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./http", () => http);
afterEach(() => vi.useRealTimers());
it("submits first and last frames, polls the job and downloads through OpenRouter", async () => {
  http.fetch
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "job",
          polling_url: "https://untrusted.example/job",
          status: "pending",
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "job",
          status: "completed",
          unsigned_urls: ["https://untrusted.example/video"],
          usage: { cost: 1.2 },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response("video", { headers: { "content-type": "video/mp4" } }),
    );
  const result = await generateOpenRouterVideo(
    "google/veo-3.1",
    {
      mode: "image-to-video",
      prompt: "Morning",
      startImage: "data:image/png;base64,aA==",
      endImage: "data:image/png;base64,bA==",
      settings: {
        duration: "8s",
        resolution: "720p",
        audio: false,
        aspectRatio: "16:9",
      },
    },
    "test-key",
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      receipt: { reported_microusd: 1200000, provider_request_id: "job" },
    },
  });
  expect(JSON.parse(http.fetch.mock.calls[0][1].body)).toMatchObject({
    duration: 8,
    resolution: "720p",
    generate_audio: false,
    frame_images: [{ frame_type: "first_frame" }, { frame_type: "last_frame" }],
  });
  expect(http.fetch.mock.calls[1][0]).toBe(
    "https://openrouter.ai/api/v1/videos/job",
  );
  expect(http.fetch.mock.calls[2][0]).toBe(
    "https://openrouter.ai/api/v1/videos/job/content?index=0",
  );
  if (result.ok) expect(await result.value.media.text()).toBe("video");
});
it("retains a reported zero when generated video delivery fails", async () => {
  http.fetch
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "charged-job", status: "pending" })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "charged-job",
          status: "completed",
          usage: { cost: 0 },
        }),
      ),
    )
    .mockResolvedValueOnce(new Response("missing", { status: 404 }));
  expect(
    await generateOpenRouterVideo(
      "google/veo-3.1",
      {
        mode: "text-to-video",
        prompt: "Morning",
        settings: { duration: "8s" },
      },
      "test-key",
    ),
  ).toMatchObject({
    ok: false,
    receipt: { reported_microusd: 0, provider_request_id: "charged-job" },
  });
});
it("rejects an image-to-video request without its required starting frame before charging", async () => {
  const calls = http.fetch.mock.calls.length;
  expect(
    await generateOpenRouterVideo(
      "google/veo-3.1",
      {
        mode: "image-to-video",
        prompt: "Morning",
        settings: { duration: "8s" },
      },
      "test-key",
    ),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(http.fetch.mock.calls.length).toBe(calls);
});
it("records the submitted OpenRouter job before its first status request fails", async () => {
  const receipt = vi.fn();
  http.fetch.mockReset();
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-first-poll", status: "pending" })) ).mockRejectedValueOnce(new Error("Network unavailable"));
  const result = await generateOpenRouterVideo("google/veo-3.1", { mode: "text-to-video", prompt: "morning", settings: { duration: "8s" } }, "key", { receipt });
  expect(receipt).toHaveBeenCalledWith({ provider_request_id: "job-first-poll", reported_microusd: null });
  expect(result).toMatchObject({ ok: false, receipt: { provider_request_id: "job-first-poll", reported_microusd: null } });
});

it("keeps the submit charge if the first status request is denied", async () => {
  http.fetch.mockReset();
  http.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "charged-on-submit", status: "pending", usage: { cost: 0.25 } })))
    .mockResolvedValueOnce(new Response("denied", { status: 401 }));
  const receipt = vi.fn();
  const result = await generateOpenRouterVideo("google/veo-3.1", { mode: "text-to-video", prompt: "morning", settings: { duration: "8s" } }, "key", { receipt });
  expect(receipt).toHaveBeenCalledWith({ provider_request_id: "charged-on-submit", reported_microusd: 250000 });
  expect(result).toMatchObject({ ok: false, receipt: { reported_microusd: 250000 } });
});
