import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { lockProjectDocument } from "./project-document-lock";
const directories:string[]=[];
afterEach(()=>directories.splice(0).forEach(directory=>fs.rmSync(directory,{recursive:true,force:true})));
function fixture(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),"showbiz-lock-"));directories.push(directory);return path.join(directory,"Film.showbiz");}
it("reclaims a lock whose PID belongs to a different process incarnation",()=>{
 const file=fixture();
 fs.writeFileSync(`${file}.lock`,JSON.stringify({pid:process.pid,identity:"previous-boot:previous-process",token:"stale"}));
 const release=lockProjectDocument(file);
 try{expect(()=>lockProjectDocument(file)).toThrow("already open");}finally{release();}
});
it("names the lock file when a legacy live-PID lock cannot be verified",()=>{
 const file=fixture();fs.writeFileSync(`${file}.lock`,String(process.pid));
 expect(()=>lockProjectDocument(file)).toThrow(`${file}.lock`);
 expect(fs.readFileSync(`${file}.lock`,"utf8")).toBe(String(process.pid));
});
