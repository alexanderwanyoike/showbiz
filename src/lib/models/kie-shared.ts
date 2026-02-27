const KIE_API_BASE = "https://api.kie.ai";
const KIE_UPLOAD_BASE = "https://kieai.redpandaai.co";

const POLL_INITIAL_MS = 3000;
const POLL_MAX_MS = 10000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function parseKieError(code: number, msg: string): string {
  if (code === 401) return "Invalid kie.ai API key.";
  if (code === 402) return "Insufficient kie.ai credits. Please top up your account.";
  if (code === 429) return "kie.ai rate limit exceeded. Please try again later.";
  if (msg) return msg;
  return `kie.ai error (code ${code})`;
}

// Upload a base64 image to kie hosting, returns the CDN download URL.
export async function uploadImageToKie(imageBase64: string, apiKey: string): Promise<string> {
  const base64Data = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  const res = await fetch(`${KIE_UPLOAD_BASE}/api/file-base64-upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      base64Data,
      uploadPath: "showbiz/images",
      fileName: "shot.png",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`kie.ai image upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const url: string | undefined = json?.data?.downloadUrl;
  if (!url) {
    throw new Error("kie.ai image upload returned no downloadUrl");
  }
  return url;
}

// Create a task on kie.ai, returns the taskId.
export async function createKieTask(
  model: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  const json = await res.json();

  if (!res.ok || json.code !== 200) {
    throw new Error(parseKieError(json.code ?? res.status, json.msg ?? json.message ?? ""));
  }

  const taskId: string | undefined = json?.data?.taskId;
  if (!taskId) {
    throw new Error("kie.ai createTask returned no taskId");
  }
  return taskId;
}

// Poll a kie.ai task until it succeeds, returns the first result URL.
export async function pollKieTask(taskId: string, apiKey: string): Promise<string> {
  const start = Date.now();
  let interval = POLL_INITIAL_MS;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval + 1000, POLL_MAX_MS);

    const res = await fetch(
      `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    const json = await res.json();

    if (!res.ok || (json.code !== undefined && json.code !== 200)) {
      throw new Error(parseKieError(json.code ?? res.status, json.msg ?? json.message ?? ""));
    }

    const state: string = json?.data?.state ?? "";

    if (state === "success") {
      let resultUrls: string[] = [];
      try {
        const parsed = JSON.parse(json.data.resultJson ?? "{}");
        resultUrls = parsed.resultUrls ?? [];
      } catch {
        // fall through
      }
      if (!resultUrls.length) {
        throw new Error("kie.ai task succeeded but returned no result URLs");
      }
      return resultUrls[0];
    }

    if (state === "fail") {
      throw new Error(`kie.ai generation failed: ${json?.data?.failMsg ?? "unknown error"}`);
    }

    // states: waiting, queuing, generating — keep polling
  }

  throw new Error("kie.ai generation timed out after 5 minutes");
}

// Convenience: optionally upload image → createTask → pollKieTask → fetch Blob.
export async function generateKieVideoBlob(
  model: string,
  input: Record<string, unknown>,
  imageBase64: string | null,
  apiKey: string,
  imageInputKey = "image_urls"
): Promise<Blob> {
  const resolvedInput = { ...input };

  if (imageBase64) {
    const cdnUrl = await uploadImageToKie(imageBase64, apiKey);
    if (imageInputKey === "image_url") {
      // Hailuo uses a singular string
      resolvedInput[imageInputKey] = cdnUrl;
    } else {
      resolvedInput[imageInputKey] = [cdnUrl];
    }
  }

  const taskId = await createKieTask(model, resolvedInput, apiKey);
  const videoUrl = await pollKieTask(taskId, apiKey);

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download kie.ai video: ${videoRes.status}`);
  }
  return videoRes.blob();
}
