import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {expect, it} from "vitest";
import {createProjectDocuments} from "./project-documents";
import {createProjectCommands} from "./commands/projects";
import {loadMigrations} from "./db";
it("reopens the current project through a symlinked parent without colliding with its own lock", async () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"showbiz-paths-"));
 const real=path.join(directory,"real"); fs.mkdirSync(real);
 const alias=path.join(directory,"alias"); fs.symlinkSync(real,alias,process.platform === "win32" ? "junction" : "dir");
 const documents=createProjectDocuments({migrations:loadMigrations(path.resolve("electron/migrations")),recentPath:path.join(directory,"recent.json"),bind:createProjectCommands});
 try{
  const created=await documents.create(path.join(alias,"Film.showbiz"));
  expect(created).toMatchObject({ok:true,value:{file_path:path.join(real,"Film.showbiz")}});
  expect(await documents.open(path.join(alias,"Film.showbiz"))).toEqual(created);
  expect(await documents.saveAs(path.join(alias,"Film.showbiz"))).toEqual(created);
 }finally{await documents.close();fs.rmSync(directory,{recursive:true,force:true});}
});
