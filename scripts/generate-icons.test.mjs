import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script=fileURLToPath(new URL("./generate-icons.mjs",import.meta.url));
const outputs=["build/icons/icon.png","build/icons/icon.ico","build/icons/icon.icns","public/icon.png","site/favicon.png","site/apple-touch-icon.png"];
function fixture(t){
  const root=mkdtempSync(path.join(tmpdir(),"showbiz-icons-"));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(path.join(root,"public"));
  const source=path.join(root,"public/icon.svg");
  writeFileSync(source,'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="180" fill="#123456"/><path d="M380 280 760 512 380 744Z" fill="white"/></svg>');
  const run=(...args)=>spawnSync(process.execPath,[script,...args],{cwd:root,encoding:"utf8"});
  const generate=()=>{const result=run();assert.equal(result.status,0,result.stderr);};
  return {root,source,run,generate,file:name=>path.join(root,name)};
}
test("generates a 1024px runtime PNG and native multi-size ICO/ICNS containers",t=>{
  const {file,generate,run}=fixture(t);generate();
  const png=readFileSync(file(outputs[0]));
  assert.equal(png.subarray(1,4).toString(),"PNG");
  assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);
  assert.deepEqual(readFileSync(file("public/icon.png")),png);
  for (const [name,size] of [["site/favicon.png",256],["site/apple-touch-icon.png",180]]) {
    const image=readFileSync(file(name));assert.equal(image.readUInt32BE(16),size);assert.equal(image.readUInt32BE(20),size);
  }
  const ico=readFileSync(file("build/icons/icon.ico"));
  assert.equal(ico.readUInt16LE(2),1);assert.ok(ico.readUInt16LE(4)>1);
  const icns=readFileSync(file("build/icons/icon.icns"));
  assert.equal(icns.subarray(0,4).toString(),"icns");assert.equal(icns.readUInt32BE(4),icns.length);
  const result=run("--check");assert.equal(result.status,0,result.stderr);
});
test("detects a modified native artifact without rewriting it",t=>{
  const {file,generate,run}=fixture(t);generate();
  const stale=Buffer.from("stale icon");writeFileSync(file("build/icons/icon.ico"),stale);
  const result=run("--check");assert.equal(result.status,1);assert.match(result.stderr,/stale.*icons:generate/i);
  assert.deepEqual(readFileSync(file("build/icons/icon.ico")),stale);
});
test("detects source artwork changes without regenerating during check",t=>{
  const {source,file,generate,run}=fixture(t);generate();
  const before=readFileSync(file("public/icon.png"));
  writeFileSync(source,readFileSync(source,"utf8").replace("#123456","#654321"));
  const result=run("--check");assert.equal(result.status,1);assert.match(result.stderr,/stale/i);
  assert.deepEqual(readFileSync(file("public/icon.png")),before);
});
test("reports a missing runtime artifact without recreating it during check",t=>{
  const {file,generate,run}=fixture(t);generate();rmSync(file("public/icon.png"));
  const result=run("--check");assert.equal(result.status,1);assert.match(result.stderr,/stale|missing/i);
  assert.equal(existsSync(file("public/icon.png")),false);
});
test("rejects invalid artwork while leaving previous native artifacts intact",t=>{
  const {source,file,generate,run}=fixture(t);generate();
  const before=readFileSync(file("build/icons/icon.png"));writeFileSync(source,"not SVG");
  const result=run();assert.equal(result.status,1);assert.match(result.stderr,/could not.*generat|conversion failed/i);
  assert.deepEqual(readFileSync(file("build/icons/icon.png")),before);
});
