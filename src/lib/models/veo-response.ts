import { z } from "zod";

export const veoOperationSchema = z.object({
  name: z.string().optional(),
  done: z.boolean().optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  response: z.object({
    generateVideoResponse: z.object({
      generatedSamples: z.array(z.object({
        video: z.object({ uri: z.string().optional() }).optional(),
      })).optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();
