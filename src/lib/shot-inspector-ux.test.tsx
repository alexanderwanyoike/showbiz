// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ShotInspector, { type ShotInspectorProps } from "../components/ShotInspector";
import { getAvailableVideoModels } from "./models";

afterEach(cleanup);
function inspectorProps(modelId = "wan-flf2v-fal"): ShotInspectorProps {
  const videoModel = getAvailableVideoModels().find((model) => model.id === modelId)!;
  return {
    shot: {id:"shot",order:1,image_prompt:null,image_url:"frame.png",end_frame_url:null,video_prompt:"A quiet morning",status:"pending"},
    frameOptions:[],onClearStartFrame:vi.fn(),onPickFrame:vi.fn(),onUploadFrame:vi.fn(),onClearEndFrame:vi.fn(),onGenerateVideo:vi.fn(),onCancelVideoGeneration:vi.fn(),onUpdateShot:vi.fn(),videoModel,videoSettings:videoModel.defaults,onVideoSettingsChange:vi.fn(),versions:[],currentVersion:null,versionCount:0,videoVersions:[],currentVideoVersion:null,videoVersionCount:0,onVersionSelect:vi.fn(),onBranchFrom:vi.fn(),onEditImage:vi.fn(),onVideoVersionSelect:vi.fn(),onGenerateVideoPrompt:vi.fn(),onEnhanceVideoPrompt:vi.fn(),isGeneratingPrompt:false,isEnhancingPrompt:false,
  };
}
it("explains a model's missing required end frame before enabling generation", () => {
  render(createElement(MemoryRouter,null,createElement(ShotInspector,inspectorProps())));
  expect(screen.getByRole("button",{name:"Generate video for shot 1"})).toHaveProperty("disabled",true);
  expect(screen.getByText("Add an end frame for Wan 2.1 FLF before generating.")).toBeTruthy();
  expect(screen.getByRole("button",{name:"End frame (required)"}).getAttribute("aria-expanded")).toBe("true");
});

it("keeps the main generation action visible while collapsing settings and offers a direct frame-library route", async () => {
  const props = { ...inspectorProps("seedance-2-fal"), frameLibraryHref: "/project/film?view=bible&bibleTab=frames" };
  render(createElement(MemoryRouter,null,createElement(ShotInspector,props)));
  const user = userEvent.setup();
  expect(screen.getByRole("textbox", {name:"Video prompt"})).toBeTruthy();
  expect(screen.getByRole("button", {name:"Describe frame"})).toBeTruthy();
  expect(screen.getByRole("button", {name:"Improve prompt"})).toBeTruthy();
  expect(screen.getByRole("link", {name:"Create a frame in the Bible"}).getAttribute("href")).toBe("/project/film?view=bible&bibleTab=frames");
  expect(screen.getByRole("combobox", {name:"Video duration"})).toBeTruthy();
  expect(screen.getByRole("switch", {name:"Generate audio"})).toBeTruthy();
  await user.click(screen.getByRole("button", {name:"Video settings"}));
  expect(screen.getByRole("button", {name:"Generate video for shot 1"})).toHaveProperty("disabled",false);
});
it("does not offer frame editing to a prompt-only model", () => {
  const props = inspectorProps("local-video");
  props.videoModel = {...props.videoModel!,modeCapabilities:{textToVideo:{endpoint:"text-only"}}};
  render(createElement(MemoryRouter,null,createElement(ShotInspector,props)));
  expect(screen.queryByRole("button",{name:"Choose start frame"})).toBeNull();
  expect(screen.getByText("Local video uses the video prompt; frames are not sent.")).toBeTruthy();
});
it("lets users remove a saved end frame that the current model does not use", async () => {
  const props=inspectorProps("local-video");props.shot={...props.shot!,end_frame_url:"end.png"};
  render(createElement(MemoryRouter,null,createElement(ShotInspector,props)));
  await userEvent.setup().click(screen.getByRole("button",{name:"Remove saved end frame"}));
  expect(props.onClearEndFrame).toHaveBeenCalledWith("shot");
});
it("shows a model's fixed duration even when it cannot be changed", () => {
  render(createElement(MemoryRouter,null,createElement(ShotInspector,inspectorProps("wan-flf2v-fal"))));
  expect(screen.getByText("5s",{exact:true})).toBeTruthy();
});

it("offers removal of a selected start frame so a shot can return to prompt-based generation", async () => {
  const props=inspectorProps("seedance-2-fal");
  render(createElement(MemoryRouter,null,createElement(ShotInspector,props)));
  await userEvent.setup().click(screen.getByRole("button",{name:"Remove start frame"}));
  expect(props.onClearStartFrame).toHaveBeenCalledWith("shot");
});
