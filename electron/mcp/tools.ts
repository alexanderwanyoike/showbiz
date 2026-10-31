import { z } from "zod";

const id = z.string().min(1).max(200);
const name = z.string().trim().min(1).max(1000);
const prompt = z.string().max(50000);
const description = prompt.nullable().optional();
const revision = {
  expected_revision: z.number().int().nonnegative(),
  request_id: id,
};
interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject;
  command: string;
  mutates: boolean;
  args: (input: Record<string, unknown>) => Record<string, unknown>;
}
const aliases: Record<string, string> = {
  project_id: "projectId",
  storyboard_id: "storyboardId",
  bible_id: "bibleId",
  asset_id: "assetId",
  shot_id: "shotId",
  version_id: "versionId",
  shot_ids: "shotIds",
  is_primary: "isPrimary",
};
function define(
  command: string,
  fields: z.ZodRawShape,
  explanation: string,
  mutates = false,
): ToolDefinition {
  return {
    name: command,
    command,
    description: explanation,
    mutates,
    schema: z.strictObject(
      mutates
        ? { ...fields, ...revision }
        : {
            ...fields,
            offset: z.number().int().nonnegative().default(0),
            limit: z.number().int().min(1).max(100).default(50),
          },
    ),
    args: (input) =>
      Object.fromEntries(
        Object.entries(input)
          .filter(
            ([key]) =>
              !["expected_revision", "request_id", "offset", "limit"].includes(
                key,
              ),
          )
          .map(([key, value]) => [aliases[key] ?? key, value]),
      ),
  };
}
const asset = z.object({
  asset_type: z.enum([
    "character",
    "location",
    "prop",
    "style",
    "reference",
    "note",
    "scene",
  ]),
  name,
  summary: description,
  description,
  tags_json: description,
  rules_json: description,
  consent_confirmed: z.boolean(),
});
export const mcpTools: ToolDefinition[] = [
  define(
    "read_context",
    {},
    "Read the current app revision before changing project data.",
  ),
  define(
    "get_projects",
    {},
    "List projects in the attached running Showbiz app.",
  ),
  define("get_project", { id }, "Read a project by its stable ID."),
  define(
    "create_project",
    { name },
    "Create a project and its default bible.",
    true,
  ),
  define("update_project", { id, name }, "Rename a project.", true),
  define(
    "get_storyboards",
    { project_id: id },
    "List a project's storyboards.",
  ),
  define(
    "get_storyboard",
    { id },
    "Read storyboard details and selected models.",
  ),
  define(
    "create_storyboard",
    { project_id: id, name },
    "Create a storyboard in a project.",
    true,
  ),
  define("update_storyboard", { id, name }, "Rename a storyboard.", true),
  define(
    "get_shots",
    { storyboard_id: id },
    "Read shots in storyboard order, including prompts and selected media.",
  ),
  define(
    "create_shot",
    { storyboard_id: id },
    "Append a shot to a storyboard.",
    true,
  ),
  define(
    "update_shot",
    {
      id,
      updates: z.strictObject({
        duration: z.number().positive().max(3600).optional(),
        image_prompt: prompt.optional(),
        video_prompt: prompt.optional(),
      }),
    },
    "Update a shot's prompts or intended duration.",
    true,
  ),
  define(
    "reorder_shots",
    { storyboard_id: id, shot_ids: z.array(id).max(10000) },
    "Reorder every shot in a storyboard using its stable shot IDs.",
    true,
  ),
  define(
    "get_bibles",
    { project_id: id },
    "Read the project's bibles and continuity guidance.",
  ),
  define(
    "create_bible",
    { project_id: id, name, description },
    "Create a project bible.",
    true,
  ),
  define(
    "update_bible",
    { id, name, description },
    "Update a bible's name and description.",
    true,
  ),
  define(
    "get_bible_assets",
    { bible_id: id },
    "Read characters, locations, props, styles and scene references.",
  ),
  define(
    "create_bible_asset",
    { bible_id: id, input: asset },
    "Create a bible entry with explicit consent status.",
    true,
  ),
  define(
    "update_bible_asset",
    { id, input: asset },
    "Update a bible entry's creative guidance.",
    true,
  ),
  define(
    "get_bible_asset_variants",
    { asset_id: id },
    "Read candidate references and approved bible images.",
  ),
  define(
    "get_image_versions",
    { shot_id: id },
    "Read a shot's image version tree.",
  ),
  define(
    "get_video_versions",
    { shot_id: id },
    "Read a shot's video version tree.",
  ),
  define(
    "switch_to_version",
    { shot_id: id, version_id: id },
    "Select an existing image take belonging to this shot.",
    true,
  ),
  define(
    "switch_to_video_version",
    { shot_id: id, version_id: id },
    "Select an existing video take belonging to this shot.",
    true,
  ),
  define(
    "export_storyboard_package",
    { storyboard_id: id, format: z.enum(["zip", "sbz"]) },
    "Export selected media using Showbiz's save dialog. Requires the storyboard package feature.",
    true,
  ),
];
