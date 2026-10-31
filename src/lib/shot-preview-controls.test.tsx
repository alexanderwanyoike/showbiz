// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ShotPreview from "../components/ShotPreview";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("offers a named stop control that returns playback to the selected frame", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(createElement(ShotPreview, { shot: {id:"shot",order:1,image_url:"frame.png",video_url:"shot.mp4",status:"complete"} }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name:"Play (Space)"}));
  await user.click(screen.getByRole("button", {name:"Stop preview"}));
  expect(screen.getByRole("img", {name:"Shot 1"})).toBeTruthy();
  expect(screen.getByRole("button", {name:"Play (Space)"})).toBeTruthy();
});
