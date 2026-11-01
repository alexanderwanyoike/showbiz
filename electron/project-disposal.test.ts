import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect,it,vi} from "vitest";
import {createProjectDocuments} from "./project-documents";
import {createProjectCommands} from "./commands/projects";
import {loadMigrations} from "./db";
it("finishes closing a project and reports a cache cleanup failure without retaining a closed database",async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"showbiz-disposal-"));
 const documents=createProjectDocuments({migrations:loadMigrations(path.resolve("electron/migrations")),recentPath:path.join(directory,"recent.json"),bind:createProjectCommands});
 let failCleanup=true;
 const rm=fs.rmSync.bind(fs);
 try{
  const file=path.join(directory,"Film.showbiz");await documents.create(file);
  const media=documents.mediaDirectory()!;
  const spy=vi.spyOn(fs,"rmSync").mockImplementation((target,options)=>{
   if(failCleanup && String(target)===path.dirname(media))throw new Error("Cache is busy");
   return rm(target,options);
  });
  expect(await documents.close()).toMatchObject({ok:true});
  expect(documents.current()).toBeNull();
  expect(documents.warning()).toContain("Cache is busy");
  failCleanup=false;spy.mockRestore();
  expect(await documents.open(file)).toMatchObject({ok:true});
 }finally{vi.restoreAllMocks();await documents.close();rm(directory,{recursive:true,force:true});}
});
