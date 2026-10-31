import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openDatabase, loadMigrations } from "../db";
import { createDataCommands } from "../command-map";
import { createInvokeHandler } from "../ipc";
it("keeps video settings on their own shot and restores them with their model identity after reopening", async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"showbiz-shot-settings-"));
  const file=path.join(directory,"film.sqlite");
  const migrations=loadMigrations(path.resolve("electron/migrations"));
  let db=openDatabase(file,migrations);
  try {
    const commands=createDataCommands(db,directory);
    const project=commands.create_project({name:"Film"});
    const board=commands.create_storyboard({projectId:project.id,name:"Opening"});
    const first=commands.create_shot({storyboardId:board.id});
    const second=commands.create_shot({storyboardId:board.id});
    const invoke=createInvokeHandler(commands);
    const settings={duration:"4",resolution:"720p",audio:false};
    expect(await invoke("set_shot_video_settings",{shot_id:first.id,model_id:"seedance-2-fal",settings})).toMatchObject({ok:true,value:{model_id:"seedance-2-fal",settings}});
    expect(await invoke("set_shot_video_settings",{shot_id:first.id,model_id:"seedance-2-fal",settings:{duration:"invalid"}})).toMatchObject({ok:false,error:{code:"INVALID_INPUT"}});
    db.close();db=openDatabase(file,migrations);
    const reopened=createDataCommands(db,directory).get_shots({storyboardId:board.id});
    expect(JSON.parse(reopened.find((shot)=>shot.id===first.id)?.video_settings_json ?? "null")).toEqual({model_id:"seedance-2-fal",settings});
    expect(reopened.find((shot)=>shot.id===second.id)?.video_settings_json).toBeNull();
  } finally {db.close();fs.rmSync(directory,{recursive:true,force:true});}
});
