// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LocalGenerationSettings } from "../components/LocalGenerationSettings";
const native = vi.hoisted(() => ({invoke: vi.fn()}));
vi.mock("./bridge", () => native);
afterEach(cleanup);
it("saves a local server and installed models without requiring an API key", async () => {
  native.invoke.mockImplementation(async (command, args) => ({ok: true, value: command === "get_local_generation_config" ? {endpoint: "http://127.0.0.1:8080", image_model: "", video_model: ""} : args}));
  render(createElement(LocalGenerationSettings));
  const user = userEvent.setup();
  await user.type(await screen.findByRole("textbox", {name: "Local image model"}), "sdxl");
  await user.type(screen.getByRole("textbox", {name: "Local video model"}), "wan");
  await user.click(screen.getByRole("button", {name: "Save local models"}));
  expect(native.invoke).toHaveBeenCalledWith("set_local_generation_config", {endpoint: "http://127.0.0.1:8080", image_model: "sdxl", video_model: "wan"});
  expect(await screen.findByText("Local models saved.")).toBeTruthy();
});
