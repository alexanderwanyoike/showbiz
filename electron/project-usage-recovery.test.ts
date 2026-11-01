import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { createProjectDocuments } from "./project-documents";
import { createProjectCommands } from "./commands/projects";
import { createGenerationUsageCommands } from "./commands/generation-usage";
import { loadMigrations } from "./db";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()));
async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showbiz-usage-recovery-"));
  const documents = createProjectDocuments({
    migrations: loadMigrations(path.resolve("electron/migrations")),
    recentPath: path.join(directory, "recent.json"),
    bind: (db, media) => ({ ...createProjectCommands(db, media), ...createGenerationUsageCommands(db) }),
  });
  cleanups.push(() => fs.rmSync(directory, { recursive: true, force: true }));
  cleanups.push(() => { void documents.close(); });
  const file = path.join(directory, "Film.showbiz");
  const created = await documents.create(file);
  if (!created.ok) throw new Error(created.error.message);
  const projectId = created.value.project_id;
  await documents.invoke("begin_generation_usage", { request_id: "running", project_id: projectId, provider: "local", model_id: "sdxl", kind: "image" });
  return { directory, documents, file, projectId };
}
it("preserves a running request across Save As and accepts its later completion", async () => {
  const {directory, documents, projectId} = await fixture();
  expect(await documents.saveAs(path.join(directory, "Copy.showbiz"))).toMatchObject({ok:true});
  expect(await documents.invoke("get_generation_usage", {project_id:projectId})).toMatchObject({ok:true,value:{items:[{status:"running"}]}});
  expect(await documents.invoke("finish_generation_usage", {request_id:"running",status:"completed"})).toMatchObject({ok:true});
  expect(await documents.invoke("get_generation_usage", {project_id:projectId})).toMatchObject({ok:true,value:{items:[{status:"completed"}]}});
});
it("marks abandoned requests interrupted only on a successful genuine open", async () => {
  const {documents, file, projectId} = await fixture();
  expect(await documents.open(file)).toMatchObject({ok:true});
  expect(await documents.invoke("get_generation_usage", {project_id:projectId})).toMatchObject({ok:true,value:{items:[{status:"running"}]}});
  await documents.close();
  expect(await documents.open(file)).toMatchObject({ok:true});
  expect(await documents.invoke("get_generation_usage", {project_id:projectId})).toMatchObject({ok:true,value:{items:[{status:"interrupted"}]}});
});
it("does not modify usage in a package rejected for missing embedded media", async () => {
  const {documents, file} = await fixture();
  await documents.close();
  const db = new DatabaseSync(file);
  const project = db.prepare("SELECT id FROM projects").get();
  db.prepare("INSERT INTO storyboards(id,project_id,name) VALUES ('board',?,'Opening')").run(project!.id);
  db.prepare('INSERT INTO shots(id,storyboard_id,"order",image_path) VALUES (\'shot\',\'board\',0,\'images/missing.png\')').run();
  db.close();
  const before = fs.readFileSync(file);
  expect(await documents.open(file)).toMatchObject({ok:false,error:{message:expect.stringContaining("missing embedded media")}});
  expect(fs.readFileSync(file)).toEqual(before);
});
