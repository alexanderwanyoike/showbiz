// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { StoryboardSettingsDialog } from "../components/StoryboardSettingsDialog";
import { ShotModelControls } from "../components/ShotModelControls";
import { Header } from "../components/Header";

vi.mock("../hooks/useUpdates", () => ({ useUpdates: () => ({ status: null }) }));
vi.mock("../components/SettingsDialog", () => ({ SettingsDialog: () => null }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);

it("identifies compact storyboard commands with a real focus tooltip and preserves dialog activation", async () => {
  render(createElement(StoryboardSettingsDialog, {name:"Opening",defaults:{image_model:"nano-banana-2",video_model:"seedance-2-fal"},onSave:async()=>({ok:true as const,value:null})}));
  const user=userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button",{name:"Storyboard settings"}));
  expect(await screen.findByRole("tooltip",{name:"Storyboard settings"})).toBeTruthy();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog",{name:"Storyboard settings"})).toBeTruthy();
});
it("keeps model scope explanations out of the routine view and available by keyboard", async () => {
  render(createElement(ShotModelControls,{shot:{id:"shot",order:1,image_model:null,video_model:null},defaults:{image_model:"nano-banana-2",video_model:"seedance-2-fal"},disabled:false,error:null,onShotChange:vi.fn()}));
  expect(screen.queryByText("Used for new takes. Existing media stays unchanged.")).toBeNull();
  const help=screen.getByRole("button",{name:"About shot models"});
  help.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(help.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Used for new takes. Existing media stays unchanged.")).toBeTruthy();
  expect(screen.getByRole("button",{name:"Image model for shot 1"}).textContent).toContain("Google AI (Gemini)");
});
it("names the app chrome icon command with a real keyboard tooltip", async () => {
  render(createElement(Header));
  await userEvent.setup().tab();
  expect(document.activeElement).toBe(screen.getByRole("button",{name:"Appearance"}));
  expect(await screen.findByRole("tooltip",{name:"Appearance"})).toBeTruthy();
});
