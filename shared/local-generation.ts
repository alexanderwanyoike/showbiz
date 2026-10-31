import { z } from "zod";

export const localGenerationSchema = z.strictObject({
  endpoint: z
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    }, "Use an HTTP or HTTPS server URL without credentials or query parameters.")
    .transform((value) => value.replace(/\/+$/, "")),
  image_model: z.string().trim().max(200),
  video_model: z.string().trim().max(200),
});
export type LocalGenerationConfig = z.infer<typeof localGenerationSchema>;
export const DEFAULT_LOCAL_GENERATION: LocalGenerationConfig = {
  endpoint: "http://127.0.0.1:8080",
  image_model: "",
  video_model: "",
};
