import { z } from "zod";

export const kieResponseSchema = z.object({
  code: z.number().optional(),
  msg: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  data: z.object({
    downloadUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    taskId: z.string().optional(),
    state: z.string().optional(),
    resultJson: z.string().nullable().optional(),
    failMsg: z.string().nullable().optional(),
  }).nullable().optional(),
});
