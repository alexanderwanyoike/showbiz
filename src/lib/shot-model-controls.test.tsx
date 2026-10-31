// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ShotModelControls } from "../components/ShotModelControls";
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);
it("offers a shot override and a way back to the storyboard default", async () => {
  const onShotChange = vi.fn();
  const props = {
    shot: { id: "shot", order: 1, image_model: null, video_model: null },
    defaults: { image_model: "nano-banana-2", video_model: "seedance-2-fal" },
    onShotChange,
    disabled: false,
    error: null,
  };
  const view = render(createElement(ShotModelControls, props));
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Image model for shot 1" }),
  );
  await user.click(screen.getByRole("option", { name: /GPT Image 2/ }));
  expect(onShotChange).toHaveBeenCalledWith("shot", {
    image_model: "gpt-image-2",
  });
  view.rerender(
    createElement(ShotModelControls, {
      ...props,
      shot: { ...props.shot, image_model: "gpt-image-2" },
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Image model for shot 1" }),
  );
  await user.click(
    screen.getByRole("option", {
      name: "Use storyboard default: Nano Banana 2",
    }),
  );
  expect(onShotChange).toHaveBeenLastCalledWith("shot", { image_model: null });
});
it("keeps the provider visible after selecting a model available through several providers", () => {
  render(createElement(ShotModelControls, {shot: {id: "shot", order: 1, image_model: "nano-banana-2-openrouter", video_model: "veo-3.1-openrouter"}, defaults: {image_model: "nano-banana-2", video_model: "seedance-2-fal"}, onShotChange: vi.fn(), disabled: false, error: null}));
  expect(screen.getByRole("button", {name: "Image model for shot 1"}).textContent).toContain("OpenRouter");
  expect(screen.getByRole("button", {name: "Video model for shot 1"}).textContent).toContain("OpenRouter");
});
it("keeps storyboard defaults out of the selected shot's controls", () => {
  render(createElement(ShotModelControls, { shot: {id: "shot", order: 1, image_model: null, video_model: null}, defaults: {image_model: "nano-banana-2", video_model: "seedance-2-fal"}, onShotChange: vi.fn(), disabled: false, error: null }));
  expect(screen.queryByText("Storyboard defaults", { exact: true })).toBeNull();
  expect(screen.queryByRole("button", { name: "Storyboard image default" })).toBeNull();
});
it("explains that model choices apply to new takes rather than changing existing media", () => {
  render(createElement(ShotModelControls,{shot:{id:"shot",order:1,image_model:null,video_model:null},defaults:{image_model:"nano-banana-2",video_model:"seedance-2-fal"},onShotChange:vi.fn(),disabled:false,error:null}));
  expect(screen.getByText("Used for new takes. Existing media stays unchanged.")).toBeTruthy();
});
