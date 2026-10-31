// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import { createGenerationPricingCommands } from "../../electron/commands/generation-pricing";
import { GenerationRateEditor } from "../components/GenerationRateEditor";
const native=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock("./bridge",()=>native);
afterEach(cleanup);
it("saves an explicit user rate for the selected provider and settings on this device",async()=>{
 const db=openTestDb();try{
 const commands:Record<string,(args?:Record<string,unknown>)=>unknown>=createGenerationPricingCommands(db);
 native.invoke.mockImplementation(async(command,args)=>commands[command]?.(args));
 render(createElement(GenerationRateEditor,{modelId:"veo-3.1-openrouter",provider:"openrouter",request:{kind:"video",duration:"8s",resolution:"720p",audio:true}}));
 const user=userEvent.setup();
 await user.type(screen.getByRole("spinbutton",{name:"USD per second"}),"0.25");
 await user.click(screen.getByRole("button",{name:"Save rate"}));
 expect(await screen.findByText("Rate saved on this device.")).toBeTruthy();
 expect(commands.get_generation_price({model_id:"veo-3.1-openrouter",kind:"video"})).toMatchObject({ok:true,value:{source_kind:"manual",source_url:"",rates:[{unit:"second",microusd:250000,resolution:"720p",audio:true}]}});
 }finally{db.close();}
});
