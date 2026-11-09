import {
  getBibleVariantImageBase64,
  getVersionImageBase64,
  getVideoVersionUrl,
} from "../backend-api";
import { electronMediaUrlResolver } from "../electron-media-url";
import { loadImage } from "../load-image";
import {
  agentFailure,
  mediaPreviewRequestSchema,
  type AgentResult,
  type MediaPreview,
} from "../../../shared/agent-generation";

const PREVIEW_SIDE = 512;
type Shrink = (
  dataUrl: string,
  maxSide: number,
) => Promise<{ base64: string; width: number; height: number }>;

export const shrinkToJpeg: Shrink = async (dataUrl, maxSide) => {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The preview could not be drawn.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    base64: canvas.toDataURL("image/jpeg", 0.8).replace(/^data:image\/jpeg;base64,/, ""),
    width: canvas.width,
    height: canvas.height,
  };
};

const VIDEO_PREVIEW_FRAMES = 3;
type ExtractFrames = (mediaPath: string, count: number) => Promise<string[]>;

const VIDEO_READ_MS = 15_000;

function waitFor(video: HTMLVideoElement, event: "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The video took too long to read.")), VIDEO_READ_MS);
    video.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("The video could not be read.")); }, { once: true });
  });
}

/** Grabs evenly spaced frames, from the first to just before the end, as JPEG data URLs. */
export const extractVideoFrames: ExtractFrames = async (mediaPath, count) => {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  try {
    const source = (await electronMediaUrlResolver.resolve(mediaPath)) ?? "";
    const loaded = waitFor(video, "loadeddata");
    video.src = source;
    await loaded;
    // Streams without a known length still give their first frame.
    const frames = Number.isFinite(video.duration) ? count : 1;
    const last = Math.max(0, (Number.isFinite(video.duration) ? video.duration : 0) - 0.1);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The preview could not be drawn.");
    const images: string[] = [];
    for (let index = 0; index < frames; index++) {
      const seeked = waitFor(video, "seeked");
      video.currentTime = frames === 1 ? 0 : (last * index) / (frames - 1);
      await seeked;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      images.push(canvas.toDataURL("image/jpeg", 0.8));
    }
    return images;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
};

async function videoPreview(
  takeId: string,
  shrink: Shrink,
  frames: ExtractFrames,
): Promise<AgentResult<MediaPreview>> {
  const mediaPath = await getVideoVersionUrl(takeId);
  if (!mediaPath)
    return agentFailure("NOT_FOUND", "No video take with that ID is in the open project.");
  const images = [];
  for (const frame of await frames(mediaPath, VIDEO_PREVIEW_FRAMES))
    images.push({ mime_type: "image/jpeg" as const, ...(await shrink(frame, PREVIEW_SIDE)) });
  return { ok: true, value: { images } };
}

export async function previewMedia(
  input: unknown,
  shrink: Shrink = shrinkToJpeg,
  frames: ExtractFrames = extractVideoFrames,
): Promise<AgentResult<MediaPreview>> {
  const request = mediaPreviewRequestSchema.safeParse(input);
  if (!request.success)
    return agentFailure(
      "INVALID_INPUT",
      request.error.issues[0]?.message ?? "Invalid preview request.",
    );
  const { bible_variant_id, image_take_id, video_take_id } = request.data;
  // Read and decode errors can carry file system paths, which agents must never see.
  const unreadable = agentFailure("IO_ERROR", "That picture could not be read.");
  if (video_take_id) {
    try {
      return await videoPreview(video_take_id, shrink, frames);
    } catch {
      return agentFailure("IO_ERROR", "That video could not be read.");
    }
  }
  let dataUrl: string | null;
  try {
    dataUrl = bible_variant_id
      ? await getBibleVariantImageBase64(bible_variant_id)
      : await getVersionImageBase64(image_take_id ?? "");
  } catch {
    return unreadable;
  }
  if (!dataUrl)
    return agentFailure("NOT_FOUND", "No picture with that ID is in the open project.");
  let small: Awaited<ReturnType<Shrink>>;
  try {
    small = await shrink(dataUrl, PREVIEW_SIDE);
  } catch {
    return unreadable;
  }
  return {
    ok: true,
    value: { images: [{ mime_type: "image/jpeg", ...small }] },
  };
}
