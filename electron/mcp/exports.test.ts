import { expect, it, vi } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpSession } from "./session";
import { createMcpServer } from "./server";
import { startLocalBridge } from "./local-bridge";
import { createStoryboardPackageCommands } from "../commands/storyboard-package";
import { createInvokeHandler } from "../ipc";
import { openTestDb } from "../db.test";

const request={tool:"export_storyboard_package",args:{storyboard_id:"board",format:"zip",expected_revision:0,request_id:"export"}};
it("passes the native export argument shape through the real command boundary",async()=>{
  const db=openTestDb();
  try{
    const save=vi.fn(async()=>({canceled:true}));
    const session=createMcpSession(createInvokeHandler(createStoryboardPackageCommands(db,"/unused",save)));
    expect(await session.call(request)).toMatchObject({ok:true,value:{data:{ok:true,value:null}}});
    expect(save).toHaveBeenCalledOnce();
  }finally{db.close();}
});
it("keeps reads available and reports pending retries instead of queueing behind a save dialog",async()=>{
  let finish:(value:unknown)=>void=()=>{};
  const dispatch=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
  const session=createMcpSession(dispatch);
  const exporting=session.call(request);
  await Promise.resolve();
  try{
    const read=await Promise.race([session.call({tool:"read_context",args:{}}),delay(100).then(()=>null)]);
    expect(read).toMatchObject({ok:true,value:{revision:0}});
    expect(await session.call(request)).toMatchObject({ok:false,error:{code:"PENDING"}});
    expect(await session.call({tool:"create_project",args:{name:"Other",request_id:"other",expected_revision:0}})).toMatchObject({ok:false,error:{code:"BUSY"}});
    expect(dispatch).toHaveBeenCalledTimes(1);
  }finally{finish({ok:true,value:null});await exporting;}
  expect(await session.call(request)).toMatchObject({ok:true});
  expect(dispatch).toHaveBeenCalledTimes(1);
});
it("lets the user spend more than five seconds in an export save dialog through the SDK bridge",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"showbiz-export-wait-"));
  const owner=createMcpSession(async()=>{await delay(5200);return {ok:true,value:null};});
  const bridge=await startLocalBridge(owner.call,directory);
  const server=createMcpServer(directory);
  const client=new Client({name:"export-test",version:"1"});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(serverTransport);await client.connect(clientTransport);
    await client.callTool({name:"attach_session",arguments:{instance_id:bridge.session.id}});
    const result=await client.callTool({name:request.tool,arguments:request.args});
    expect(result.isError).toBe(false);
  }finally{await client.close();await server.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
},15000);
