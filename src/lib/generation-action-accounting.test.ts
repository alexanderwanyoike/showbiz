import { expect, it, vi } from "vitest";
import { openTestDb } from "../../electron/db.test";
import { createGenerationUsageCommands } from "../../electron/commands/generation-usage";
import { createGenerationPricingCommands } from "../../electron/commands/generation-pricing";
import { generateImageAction, generateAndSaveVideoRequestAction, editImageAction, composeFrameAction } from "../actions/generation-actions";
const mocks = vi.hoisted(() => ({invoke: vi.fn(), fetch: vi.fn()}));
vi.mock("./backend-api", async original => ({...await original<typeof import("./backend-api")>(), getCurrentVideoVersion: async () => null, createVideoGenerationVersion: async () => ({video_url: "blob:fixture"})}));
vi.mock("./bridge", () => ({invoke: mocks.invoke}));
vi.mock("./models/http", () => ({fetch: mocks.fetch}));
it("records the estimate and provider receipt for an actual image generation action", async () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
    const commands: Record<string, (args?: Record<string, unknown>) => unknown> = {...createGenerationUsageCommands(db), ...createGenerationPricingCommands(db)};
    commands.save_generation_price({kind: "image", price: {provider: "openrouter", model_id: "seedream-4.5-openrouter", currency: "USD", source_kind: "manual", source_url: "https://openrouter.ai", checked_at: "2026-10-31T12:00:00Z", rates: [{unit: "image", microusd: 50000}]}});
    mocks.invoke.mockImplementation(async (command, args) => command === "get_api_key" ? "fixture-key" : commands[command]?.(args));
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({id: "image-job", data: [{b64_json: "aA==", media_type: "image/png"}], usage: {cost: 0.04}})));
    expect(await generateImageAction("Morning", "seedream-4.5-openrouter", {project_id: "film", subject_id: "character"})).toBe("data:image/png;base64,aA==");
    expect(commands.get_generation_usage({project_id: "film"})).toMatchObject({ok: true, value: {items: [{kind: "image", subject_id: "character", status: "completed", estimated_min_microusd: 50000, reported_microusd: 40000}]}});
  } finally { db.close(); }
});

it("records the shot video estimate and final charge through the generation action", async () => {
 const db=openTestDb();try{
 db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
 const commands:Record<string,(args?:Record<string,unknown>)=>unknown>={...createGenerationUsageCommands(db),...createGenerationPricingCommands(db)};
 commands.save_generation_price({kind:"video",price:{provider:"openrouter",model_id:"veo-3.1-openrouter",currency:"USD",source_kind:"manual",source_url:"https://openrouter.ai",checked_at:"2026-10-31T12:00:00Z",rates:[{unit:"second",microusd:200000}]}});
 mocks.invoke.mockImplementation(async(command,args)=>command==="get_api_key"?"fixture-key":command==="get_project_document_state"?{ok:true,value:{current:{project_id:"film"}}}:commands[command]?.(args));
 mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({id:"job",status:"pending"}))).mockResolvedValueOnce(new Response(JSON.stringify({id:"job",status:"completed",usage:{cost:0.25}}))).mockResolvedValueOnce(new Response("video",{headers:{"content-type":"video/mp4"}}));
 expect(await generateAndSaveVideoRequestAction("shot","veo-3.1-openrouter",{mode:"text-to-video",prompt:"Morning",settings:{duration:"8s",resolution:"720p",audio:false}})).toMatchObject({success:true,videoUrl:"blob:fixture"});
 expect(commands.get_generation_usage({project_id:"film"})).toMatchObject({ok:true,value:{items:[{kind:"video",subject_id:"shot",status:"completed",estimated_min_microusd:1600000,reported_microusd:250000}]}});
 }finally{db.close();}
});

it("accounts for editing and reference composition as distinct image operations",async()=>{
 const db=openTestDb();try{
 db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
 const commands:Record<string,(args?:Record<string,unknown>)=>unknown>={...createGenerationUsageCommands(db),...createGenerationPricingCommands(db)};
 for(const kind of ["image_edit","image_compose"])commands.save_generation_price({kind,price:{provider:"openrouter",model_id:"seedream-4.5-openrouter",currency:"USD",source_kind:"manual",source_url:"https://openrouter.ai",checked_at:"2026-10-31T12:00:00Z",rates:[{unit:"image",microusd:50000}]}});
 mocks.invoke.mockImplementation(async(command,args)=>command==="get_api_key"?"fixture-key":commands[command]?.(args));
 mocks.fetch.mockImplementation(async()=>new Response(JSON.stringify({id:"image-job",data:[{b64_json:"aA==",media_type:"image/png"}],usage:{cost:0.04}})));
 const subject={project_id:"film",subject_id:"character"};
 await editImageAction("data:image/png;base64,aA==","Morning","seedream-4.5-openrouter",subject);
 await composeFrameAction("Morning",["data:image/png;base64,aA=="],"seedream-4.5-openrouter",subject);
 expect(commands.get_generation_usage({project_id:"film"})).toMatchObject({ok:true,value:{items:expect.arrayContaining([expect.objectContaining({kind:"image_edit",reported_microusd:40000,estimated_min_microusd:50000}),expect.objectContaining({kind:"image_compose",reported_microusd:40000,estimated_min_microusd:50000})]),total_count:2}});
 }finally{db.close();}
});
