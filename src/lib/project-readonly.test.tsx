// @vitest-environment jsdom
import {createElement} from "react";
import {render,screen,cleanup} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach,expect,it,vi} from "vitest";
import {ProjectNavigator} from "../components/ProjectNavigator";
vi.mock("../contexts/ProjectDocumentContext",()=>({useProjectDocument:()=>({current:{project_id:"film",name:"Film",file_path:"/readonly/Film.showbiz",read_only:true}})}));
vi.mock("../components/ProjectSettings",()=>({ProjectSettings:()=>null}));
vi.mock("./backend-api",()=>({getProject:async()=>({id:"film",name:"Film"}),getStoryboardsWithPreview:async()=>[]}));
afterEach(cleanup);
it("labels a read-only document instead of claiming changes save automatically",async()=>{
 render(createElement(MemoryRouter,null,createElement(ProjectNavigator)));
 expect(await screen.findByText("Read-only · Save As to edit")).toBeTruthy();
 expect(screen.queryByText("Changes saved automatically")).toBeNull();
});
