import { expect, it, vi } from "vitest";
import { createMcpSession } from "./session";
import { createWorkRuntime } from "../work-runtime";

it("does not advance project revisions for updater actions or rejected native results",async()=>{
  const session=createMcpSession(async(command)=>command==="update_project" ? {ok:false,error:{code:"IO_ERROR",message:"Not saved"}} : null);
  await session.invoke("check_for_updates");await session.invoke("download_update");await session.invoke("open_update_release");
  await session.invoke("update_project",{id:"p",name:"Rejected"});
  expect(await session.call({tool:"read_context",args:{}})).toMatchObject({ok:true,value:{revision:0}});
});
it("expires document-scoped replay only when a document switch actually succeeds",async()=>{
  const dispatch=vi.fn(async(command:string)=>command==="open_project_document" ? {ok:true,value:null} : {id:"p",name:"Saved"});
  const session=createMcpSession(dispatch);
  const request={tool:"update_project",args:{id:"p",name:"Saved",expected_revision:0,request_id:"saved"}};
  const first=await session.call(request);
  await session.invoke("open_project_document");
  expect(await session.call(request)).toEqual(first);
  expect(await session.call({tool:"read_context",args:{}})).toMatchObject({ok:true,value:{revision:1}});
});
it("observes UI writes without nesting a second application-work lease",async()=>{
  const work=createWorkRuntime({windows:()=>[],confirm:async()=>({response:0}),quit:vi.fn()});
  const begin=vi.spyOn(work.work,"begin");
  const dispatch=vi.fn(async()=>({id:"p",name:"Saved"}));
  const session=createMcpSession((command,args)=>work.invoke(-1,command,args,dispatch));
  const value=await work.invoke(7,"update_project",{id:"p",name:"Saved"},dispatch);
  session.recordResult("update_project",value);
  expect(begin).toHaveBeenCalledTimes(1);
  expect(await session.call({tool:"read_context",args:{}})).toMatchObject({ok:true,value:{revision:1}});
  await session.call({tool:"update_project",args:{id:"p",name:"Agent",expected_revision:1,request_id:"agent"}});
  expect(begin).toHaveBeenCalledTimes(2);
});
