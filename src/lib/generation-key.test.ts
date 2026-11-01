import { expect, it, vi } from "vitest";
import { resolveGenerationKey } from "./generation-key";
const native = vi.hoisted(() => ({ getApiKey: vi.fn() }));
vi.mock("./backend-api", () => native);
it("resolves optional local authentication and returns a typed missing hosted credential", async () => {
  native.getApiKey.mockResolvedValue(null);
  expect(await resolveGenerationKey("local")).toEqual({ ok: true, value: "" });
  expect(await resolveGenerationKey("openrouter")).toMatchObject({
    ok: false,
    error: {
      code: "INVALID_INPUT",
      message: expect.stringContaining("OpenRouter"),
    },
  });
  native.getApiKey.mockResolvedValueOnce("fixture-key");
  expect(await resolveGenerationKey("fal")).toEqual({
    ok: true,
    value: "fixture-key",
  });
});
it("preserves a credential-read failure as a typed result before generation", async () => {
  native.getApiKey.mockRejectedValueOnce(
    new Error("Credential storage is unavailable."),
  );
  expect(await resolveGenerationKey("gemini")).toMatchObject({
    ok: false,
    error: { code: "IO_ERROR", message: "Credential storage is unavailable." },
  });
});
