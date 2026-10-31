import { expect, it } from "vitest";
import { openTestDb } from "./db.test";
import { createShotCommands } from "./commands/shots";

it("persists independent shot model overrides and restores inheritance without changing the board defaults", () => {
  const db = openTestDb();
  try {
    db.prepare("INSERT INTO projects(id,name) VALUES ('project','Film')").run();
    db.prepare("INSERT INTO storyboards(id,project_id,name) VALUES ('board','project','Opening')").run();
    const commands = createShotCommands(db, "/unused-media");
    const first = commands.create_shot({storyboardId:"board"});
    const second = commands.create_shot({storyboardId:"board"});
    expect(first).toMatchObject({image_model:null,video_model:null});
    const dispatch = commands as unknown as Record<string,(args:Record<string,unknown>)=>unknown>;
    expect(dispatch.set_shot_models({shot_id:first.id,image_model:"gpt-image-1",video_model:"veo-3"})).toMatchObject({ok:true,value:{image_model:"gpt-image-1",video_model:"veo-3"}});
    expect(commands.get_shots({storyboardId:"board"})[0]).toMatchObject({image_model:"gpt-image-1",video_model:"veo-3"});
    expect(commands.get_shots({storyboardId:"board"})[1]).toMatchObject({id:second.id,image_model:null,video_model:null});
    expect(dispatch.set_shot_models({shot_id:first.id,image_model:null})).toMatchObject({ok:true,value:{image_model:null,video_model:"veo-3"}});
    expect(db.prepare("SELECT image_model,video_model FROM storyboards WHERE id='board'").get()).toMatchObject({image_model:"imagen4",video_model:"seedance-2-fal"});
  } finally { db.close(); }
});
