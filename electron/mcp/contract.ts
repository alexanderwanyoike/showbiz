import { z } from "zod";
export const sessionSchema = z.strictObject({
  id: z.uuid(),
  pid: z.number().int().positive(),
  socket: z.string().min(1).max(1024),
  secret: z.string().min(32).max(128),
});
export type LocalSession = z.infer<typeof sessionSchema>;
export type BridgeResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };
export const resultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const unavailable = (): BridgeResult => ({
  ok: false,
  error: {
    code: "UNAVAILABLE",
    message:
      "The selected Showbiz instance is unavailable. List sessions and attach again.",
  },
});
