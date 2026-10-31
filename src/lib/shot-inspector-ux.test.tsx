// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import ShotInspector, { type ShotInspectorProps } from "../components/ShotInspector";
import { getAvailableVideoModels } from "./models";

afterEach(cleanup);
function inspectorProps(modelId = "wan-flf2v-fal"): ShotInspectorProps {
  const videoModel = getAvailableVideoModels().find((model) => model.id === modelId)!;
  return {
    shot: {id:"shot",order:1,image_prompt:null,image_url:"frame.png",end_frame_url:null,video_prompt:"A quiet morning",status:"pending"},
    frameOptions:[],onPickFrame:vi.fn(),onUploadFrame:vi.fn(),onClearEndFrame:vi.fn(),onGenerateVideo:vi.fn(),onCancelVideoGeneration:vi.fn(),onUpdateShot:vi.fn(),videoModel,videoSettings:videoModel.defaults,onVideoSettingsChange:vi.fn(),versions:[],currentVersion:null,versionCount:0,videoVersions:[],currentVideoVersion:null,videoVersionCount:0,onVersionSelect:vi.fn(),onBranchFrom:vi.fn(),onEditImage:vi.fn(),onVideoVersionSelect:vi.fn(),onGenerateVideoPrompt:vi.fn(),onEnhanceVideoPrompt:vi.fn(),isGeneratingPrompt:false,isEnhancingPrompt:false,
  };
}
it("explains a model's missing required end frame before enabling generation", () => {
  render(createElement(MemoryRouter,null,createElement(ShotInspector,inspectorProps())));
  expect(screen.getByRole("button",{name:"Generate video for shot 1"})).toHaveProperty("disabled",true);
  expect(screen.getByText("Add an end frame for Wan 2.1 FLF before generating.")).toBeTruthy();
  expect(screen.getByRole("button",{name:"End frame (required)"}).getAttribute("aria-expanded")).toBe("true");
});
