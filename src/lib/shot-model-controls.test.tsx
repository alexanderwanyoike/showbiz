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
    onDefaultsChange: vi.fn(),
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
