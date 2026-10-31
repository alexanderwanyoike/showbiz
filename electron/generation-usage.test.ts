import { expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { createGenerationUsageCommands } from "./commands/generation-usage";
it("retains the preflight estimate and reported cost as distinct values across completion",()=>{
 const db=openTestDb();try{
  db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
  const commands=createGenerationUsageCommands(db);
  const started=commands.begin_generation_usage({request_id:"request",project_id:"film",kind:"video",provider:"openrouter",model_id:"veo",estimated_min_microusd:1200000,estimated_max_microusd:1200000,settings:{duration:8,resolution:"720p"},price_source:"https://openrouter.ai/models/veo",price_checked_at:"2026-10-31T12:00:00Z"});
  expect(started).toMatchObject({ok:true});
  expect(commands.record_generation_receipt({request_id:"request",reported_microusd:1340000,provider_request_id:"provider-job"})).toMatchObject({ok:true});
  expect(commands.finish_generation_usage({request_id:"request",status:"completed"})).toMatchObject({ok:true});
  expect(commands.get_generation_usage({project_id:"film"})).toMatchObject({ok:true,value:{items:[{request_id:"request",estimated_min_microusd:1200000,reported_microusd:1340000,provider_request_id:"provider-job",status:"completed"}]}});
  expect(commands.get_generation_cost_summary({project_id:"film"})).toMatchObject({ok:true,value:{reported_microusd:1340000,estimated_min_microusd:0,unknown_count:0,total_count:1}});
 }finally{db.close();}
});

it("keeps known charges after failure, treats absent charges as unknown and survives reopening", () => {
 const db=openTestDb();try {
 db.prepare("INSERT INTO projects(id,name) VALUES ('film','Film')").run();
 const commands=createGenerationUsageCommands(db);
 const begin=(request_id:string)=>commands.begin_generation_usage({request_id,project_id:"film",kind:"image",provider:"local",model_id:"sdxl"});
 expect(begin("failed")).toMatchObject({ok:true});
 expect(commands.record_generation_receipt({request_id:"failed",reported_microusd:0})).toMatchObject({ok:true});
 expect(commands.finish_generation_usage({request_id:"failed",status:"failed"})).toMatchObject({ok:true});
 expect(begin("abandoned")).toMatchObject({ok:true});
 const reopened=createGenerationUsageCommands(db);
 expect(reopened.get_generation_usage({project_id:"film"})).toMatchObject({ok:true,value:{items:expect.arrayContaining([expect.objectContaining({request_id:"abandoned",status:"interrupted",reported_microusd:null})])}});
 expect(reopened.get_generation_cost_summary({project_id:"film"})).toMatchObject({ok:true,value:{reported_microusd:0,unknown_count:1,total_count:2}});
 expect(reopened.record_generation_receipt({request_id:"failed",reported_microusd:-1})).toMatchObject({ok:false});
 }finally{db.close();}
});
