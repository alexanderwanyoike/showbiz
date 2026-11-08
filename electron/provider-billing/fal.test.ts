import { expect, it, vi } from "vitest";
import { readFalCharges } from "./fal";

const request = [
  { provider_request_id: "fal-request-1", started_at: "2026-11-08T16:23:00.000Z" },
];
const refusal = (status: number, body: string) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));

it("passes on fal's reason when a key lacks billing permissions", async () => {
  const http = refusal(
    403,
    JSON.stringify({
      error: {
        type: "authorization_error",
        message: "This API key is not permitted to perform this action.",
      },
    }),
  );
  expect(await readFalCharges(request, "fixture-key", http)).toEqual({
    ok: false,
    error: {
      code: "IO_ERROR",
      message:
        'FAL billing access denied ("This API key is not permitted to perform this action."). Confirmed charges need a key with billing:usage:read, auth:keys:read and account:users:read, such as one made with the BILLING preset. This cost remains unconfirmed.',
    },
  });
});

it("says when fal does not accept the billing key at all", async () => {
  const http = refusal(
    401,
    JSON.stringify({ error: { type: "authorization_error", message: "Authentication required" } }),
  );
  expect(await readFalCharges(request, "fixture-key", http)).toEqual({
    ok: false,
    error: {
      code: "IO_ERROR",
      message:
        'FAL did not accept the key used for billing ("Authentication required"). Check the fal.ai billing key in Settings, or the fal.ai key when no billing key is saved. This cost remains unconfirmed.',
    },
  });
});

it("keeps the refusal readable when fal gives no reason", async () => {
  expect(await readFalCharges(request, "fixture-key", refusal(403, "denied"))).toMatchObject({
    ok: false,
    error: {
      message:
        "FAL billing access denied. Confirmed charges need a key with billing:usage:read, auth:keys:read and account:users:read, such as one made with the BILLING preset. This cost remains unconfirmed.",
    },
  });
});

it("never repeats the key or an overlong reason", async () => {
  const http = refusal(
    403,
    JSON.stringify({ error: { message: `Key fixture-key is not allowed ${"x".repeat(400)}` } }),
  );
  const result = await readFalCharges(request, "fixture-key", http);
  if (result.ok) throw new Error("expected a refusal");
  expect(result.error.message).not.toContain("fixture-key");
  expect(result.error.message.length).toBeLessThan(500);
});

it.each([
  ["a key cut by the length limit", `${"x".repeat(150)} fixture-id:fixture-secret was refused`],
  ["only the secret half of the key", "Secret fixture-secret lacks billing permissions"],
])("never shows any part of the key, even %s", async (_label, message) => {
  const http = refusal(403, JSON.stringify({ error: { message } }));
  const result = await readFalCharges(request, "fixture-id:fixture-secret", http);
  if (result.ok) throw new Error("expected a refusal");
  expect(result.error.message).toBe(
    "FAL billing access denied. Confirmed charges need a key with billing:usage:read, auth:keys:read and account:users:read, such as one made with the BILLING preset. This cost remains unconfirmed.",
  );
});

it("keeps fal's reason on one line and names the key actually used", async () => {
  const http = refusal(401, JSON.stringify({ error: { message: "Authentication\n\trequired" } }));
  const result = await readFalCharges(request, "fixture-key", http);
  if (result.ok) throw new Error("expected a refusal");
  expect(result.error.message).toBe(
    'FAL did not accept the key used for billing ("Authentication required"). Check the fal.ai billing key in Settings, or the fal.ai key when no billing key is saved. This cost remains unconfirmed.',
  );
});
