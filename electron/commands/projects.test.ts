import { describe, it, expect } from "vitest";
import { openTestDb } from "../db.test";
import { createProjectCommands } from "./projects";

describe("get_projects", () => {
  it("returns an empty list for a fresh database", () => {
    const commands = createProjectCommands(openTestDb());
    expect(commands.get_projects()).toEqual([]);
  });

  it("returns projects with the same shape as the Rust command", () => {
    const db = openTestDb();
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(
      "proj-1",
      "My Project"
    );

    const projects = createProjectCommands(db).get_projects();
    expect(projects.length).toBe(1);
    const project = projects[0];
    expect(project.id).toBe("proj-1");
    expect(project.name).toBe("My Project");
    expect(typeof project.created_at).toBe("string");
    expect(typeof project.updated_at).toBe("string");
    expect(Object.keys(project).sort()).toEqual([
      "created_at",
      "id",
      "name",
      "updated_at",
    ]);
  });

  it("orders projects by updated_at descending", () => {
    const db = openTestDb();
    const insert = db.prepare(
      "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    );
    insert.run("proj-old", "Old", "2026-01-01 00:00:00", "2026-01-01 00:00:00");
    insert.run("proj-new", "New", "2026-01-01 00:00:00", "2026-02-01 00:00:00");

    const projects = createProjectCommands(db).get_projects();
    expect(projects.map((p) => p.id)).toEqual(["proj-new", "proj-old"]);
  });
});
