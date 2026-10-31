// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import StoryboardPage from "../pages/StoryboardPage";
import { setShotModels } from "./backend-api";
import { generateAndSaveVideoRequestAction } from "../actions/generation-actions";
vi.stubGlobal("ResizeObserver", class {observe(){} unobserve(){} disconnect(){}});
Element.prototype.scrollIntoView=vi.fn();
vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
vi.mock("../components/Header",()=>({Header:({children}:{children:ReactNode})=>createElement("header",null,children)}));
vi.mock("./backend-api",async original=>({...await original<typeof import("./backend-api")>(),
 getStoryboard:async()=>({id:"board",project_id:"project",name:"Opening",image_model:"nano-banana-2",video_model:"seedance-2-fal"}),
 getShots:async()=>[1,2].map(order=>({id:`shot-${order}`,storyboard_id:"board",order,duration:8,image_model:null,video_model:null,image_url:`frame-${order}.png`,image_path:`images/${order}.png`,video_url:null,video_prompt:"A quiet static shot.",status:"pending"})),
 getBibles:async()=>[],ensureDefaultTracks:async()=>[],getTimelineClips:async()=>[],getImageVersions:async()=>[],getVideoVersions:async()=>[],getCurrentImageVersion:async()=>null,getCurrentVideoVersion:async()=>null,getVersionCount:async()=>0,getVideoVersionCount:async()=>0,
 getShotImageBase64:async()=>"data:image/png;base64,ZnJhbWU=",
 setShotModels:vi.fn(async (_id:string,models:Record<string,unknown>)=>({ok:true,value:{image_model:null,video_model:null,...models}})),
}));
vi.mock("../actions/generation-actions",async original=>({...await original<typeof import("../actions/generation-actions")>(),generateAndSaveVideoRequestAction:vi.fn(async()=>({success:false,error:"Verification only"}))}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("generates with the selected shot override and leaves another shot on the storyboard default",async()=>{
 render(createElement(MemoryRouter,{initialEntries:["/storyboard/board"]},createElement(Routes,null,createElement(Route,{path:"/storyboard/:id",element:createElement(StoryboardPage)}))));
 const user=userEvent.setup();
 await screen.findByRole("img",{name:"Shot 2",exact:true});
 const openControls=screen.queryByRole("button",{name:"Shot controls",exact:true});if(openControls)await user.click(openControls);
 const controls=await screen.findByRole("region",{name:"Shot model controls"});
 await user.click(within(controls).getByRole("button",{name:"Video model for shot 1"}));
 await user.click(screen.getByRole("option",{name:/Seedance 2.0 Fast/}));
 await waitFor(()=>expect(setShotModels).toHaveBeenCalledWith("shot-1",{video_model:"seedance-2-fast-fal"}));
 await user.click(screen.getByRole("button",{name:"Generate video for shot 1",exact:true}));
 await waitFor(()=>expect(generateAndSaveVideoRequestAction).toHaveBeenCalledWith("shot-1","seedance-2-fast-fal",expect.objectContaining({mode:"image-to-video"})));
 await user.click(screen.getByRole("img",{name:"Shot 2",exact:true}));
 expect(await screen.findByRole("button",{name:"Video model for shot 2"})).toHaveProperty("textContent",expect.stringContaining("Seedance 2.0"));
 await user.click(screen.getByRole("button",{name:"Generate video for shot 2",exact:true}));
 await waitFor(()=>expect(generateAndSaveVideoRequestAction).toHaveBeenLastCalledWith("shot-2","seedance-2-fal",expect.objectContaining({mode:"image-to-video"})));
});

it("waits for a model save before allowing generation and preserves the prior choice on failure",async()=>{
 let finish!: (result:Awaited<ReturnType<typeof setShotModels>>)=>void;
 vi.mocked(setShotModels).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(createElement(MemoryRouter,{initialEntries:["/storyboard/board"]},createElement(Routes,null,createElement(Route,{path:"/storyboard/:id",element:createElement(StoryboardPage)}))));
 const user=userEvent.setup();await screen.findByRole("img",{name:"Shot 2",exact:true});
 const openControls=screen.queryByRole("button",{name:"Shot controls",exact:true});if(openControls)await user.click(openControls);
 const controls=await screen.findByRole("region",{name:"Shot model controls"});
 await user.click(within(controls).getByRole("button",{name:"Video model for shot 1"}));
 await user.click(screen.getByRole("option",{name:/Seedance 2.0 Fast/}));
 expect(screen.getByRole("button",{name:"Generate video for shot 1"})).toHaveProperty("disabled",true);
 finish({ok:false,error:{code:"NOT_FOUND",message:"The shot no longer exists."}});
 expect(await screen.findByRole("alert")).toHaveProperty("textContent","The shot no longer exists.");
 expect(screen.getByRole("button",{name:"Video model for shot 1"})).toHaveProperty("textContent",expect.stringContaining("Seedance 2.0"));
 expect(generateAndSaveVideoRequestAction).not.toHaveBeenCalled();
});
