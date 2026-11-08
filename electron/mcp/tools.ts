import { z } from "zod";
import { mediaPreviewRequestSchema } from "../../shared/agent-generation";

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
  /** Spends from the agent budget, so it is never presented as read-only. */
  spends?: boolean;
  /** Reaches provider APIs outside Showbiz. */
  openWorld?: boolean;
  requestTimeoutMs?: number;
  args: (input: Record<string, unknown>) => Record<string, unknown>;
  /** Reads current data to refuse input that the native command alone would accept. */
  check?: (
    read: (command: string, args: Record<string, unknown>) => Promise<unknown>,
    args: Record<string, unknown>,
  ) => Promise<string | null>;
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
const assetsSchema = z.array(z.object({ id: z.string(), asset_type: z.string() }));
const variantsSchema = z.array(z.object({ id: z.string() }));
async function checkFrameReferences(
  read: (command: string, args: Record<string, unknown>) => Promise<unknown>,
  args: Record<string, unknown>,
): Promise<string | null> {
  const assets = assetsSchema.parse(await read("get_bible_assets", { bibleId: args.bible_id }));
  const typeOf = (assetId: unknown) => assets.find((asset) => asset.id === assetId)?.asset_type;
  const characters = z.array(z.string()).parse(args.character_ids);
  if (characters.some((character) => typeOf(character) !== "character"))
    return "Every character must be a character in this Bible.";
  if (args.location_id !== null && typeOf(args.location_id) !== "location")
    return "The location must be a location in this Bible.";
  if (args.location_variant_id !== null) {
    if (args.location_id === null) return "Choose the location the view belongs to.";
    const views = variantsSchema.parse(
      await read("get_bible_asset_variants", { assetId: args.location_id }),
    );
    if (!views.some((view) => view.id === args.location_variant_id))
      return "The location view must be a picture of that location.";
  }
  return null;
}
export const mcpTools: ToolDefinition[] = [
  define(
    "get_generation_models",
    {},
    "Read installed image and video model IDs, providers, capabilities and defaults. Credentials are omitted.",
  ),
  define(
    "get_generation_price",
    {
      model_id: id,
      kind: z.enum(["image", "image_edit", "image_compose", "video"]),
    },
    "Read the device price basis and source for a model. A missing rate is unknown, not free.",
  ),
  {
    ...define(
      "update_storyboard_models",
      { id, image_model: id, video_model: id },
      "Set both storyboard model defaults. Existing shot overrides remain independent.",
      true,
    ),
    args: (input) => ({
      id: input.id,
      imageModel: input.image_model,
      videoModel: input.video_model,
    }),
  },
  {
    ...define(
      "set_shot_models",
      {
        shot_id: id,
        image_model: id.nullable().optional(),
        video_model: id.nullable().optional(),
      },
      "Set independent shot model overrides. Pass null to inherit the storyboard default; omit a field to preserve it.",
      true,
    ),
    args: (input) =>
      Object.fromEntries(
        Object.entries(input).filter(([key]) =>
          ["shot_id", "image_model", "video_model"].includes(key),
        ),
      ),
  },
  {
    ...define(
      "get_generation_usage",
      { project_id: id, subject_id: id.optional() },
      "Read provider-reported costs, unconfirmed estimates and unknown generation charges for a project or subject.",
    ),
    args: (input: Record<string, unknown>) => ({
      project_id: input.project_id,
      subject_id: input.subject_id,
      offset: input.offset,
      limit: input.limit,
    }),
  },
  {
    ...define(
      "get_generation_cost_summary",
      {},
      "Read total provider-reported costs, unconfirmed estimates and unknown charges for a project or subject.",
    ),
    schema: z.strictObject({ project_id: id, subject_id: id.optional() }),
    args: (input: Record<string, unknown>) => ({
      project_id: input.project_id,
      subject_id: input.subject_id,
    }),
  },
  define(
    "get_agent_budget",
    {},
    "Read the spending budget the user granted in Showbiz: remaining amount, per-request cap, expiry and allowed models. Agents cannot create, raise, extend or revoke it. NO_BUDGET means nothing is granted.",
  ),
  {
    ...define(
      "quote_generation",
      {},
      "Price a generation before spending. Returns a quote_id valid for ten minutes and usable once, with the frozen estimate and its source. For a Bible entry (target bible_asset) pass asset_id and an installed image model_id, plus: operation generate with a prompt (a new prompt-only take); retake with an optional prompt (composes from the entry's own picture or a frame's recipe, as the app's retake does, or prompt-only when it has none); or edit with source_variant_id and an instruction as prompt. Unknown prices are refused with PRICE_UNKNOWN; NO_BUDGET, MODEL_NOT_ALLOWED, OVER_REQUEST_CAP and OVER_BUDGET reflect the budget the user granted.",
    ),
    schema: z.strictObject({
      target: z.enum(["bible_asset"]),
      operation: z.enum(["generate", "retake", "edit"]),
      asset_id: id,
      prompt: z.string().trim().min(1).max(50000).optional(),
      source_variant_id: id.optional(),
      model_id: id,
    }),
    openWorld: true,
    requestTimeoutMs: 90000,
    args: (input: Record<string, unknown>) => ({ ...input }),
  },
  {
    ...define(
      "submit_generation",
      {},
      "Spend from the agent budget by submitting a quote. Pass the quote_id and a unique request_id. Retrying with the same request_id returns the same job and never pays twice, even after a timeout or a Showbiz restart. Returns a job; follow it with get_generation_job. Refused with QUOTE_EXPIRED, QUOTE_NOT_FOUND, QUOTE_STALE, NO_BUDGET, OVER_BUDGET, OVER_REQUEST_CAP, JOB_LIMIT (one paid job at a time) or BUSY (unsaved edits in Showbiz).",
    ),
    schema: z.strictObject({ quote_id: id, request_id: id }),
    spends: true,
    openWorld: true,
    requestTimeoutMs: 180000,
    args: (input: Record<string, unknown>) => ({ ...input }),
  },
  {
    ...define(
      "get_generation_job",
      {},
      "Read an agent job: status (accepted, running, completed, failed, interrupted), the resulting variant ID, the held estimate and the confirmed charge once the provider reports it.",
    ),
    schema: z.strictObject({ job_id: id }),
    args: (input: Record<string, unknown>) => ({ ...input }),
  },
  {
    ...define(
      "list_generation_jobs",
      { project_id: id },
      "List agent jobs for a project, newest first.",
    ),
    args: (input: Record<string, unknown>) => ({ ...input }),
  },
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
  {
    ...define(
      "create_bible_frame",
      {
        bible_id: id,
        prompt: z.string().trim().min(1).max(50000),
        character_ids: z.array(id).max(20),
        location_id: id.nullable(),
        location_variant_id: id.nullable(),
      },
      "Create a frame entry the way the Bible's frame composer does: a prompt plus characters and a location (optionally one of its views). Frames hold no picture until composed; quote it with operation retake.",
      true,
    ),
    command: "create_bible_asset",
    args: (input: Record<string, unknown>) => ({
      bibleId: input.bible_id,
      input: {
        asset_type: "reference",
        name: String(input.prompt).slice(0, 50) || "Frame",
        summary: null,
        description: null,
        tags_json: null,
        rules_json: JSON.stringify({
          characters: input.character_ids,
          location: input.location_id,
          locationVariantId: input.location_variant_id,
          prompt: input.prompt,
        }),
        consent_confirmed: false,
      },
    }),
    check: checkFrameReferences,
  },
  define(
    "get_bible_asset_variants",
    { asset_id: id },
    "Read candidate references and approved bible images.",
  ),
  {
    ...define(
      "set_bible_variant_status",
      {
        variant_id: id,
        status: z.enum(["approved", "rejected"]),
        is_primary: z.boolean(),
      },
      "Approve a Bible take, optionally making it the entry's current picture (as the app's Use this take does), or reject a take. The current picture cannot be rejected; make another take current first.",
      true,
    ),
    command: "update_bible_asset_variant_status",
    args: (input: Record<string, unknown>) => ({
      id: input.variant_id,
      status: input.status,
      isPrimary: input.is_primary,
    }),
  },
  {
    ...define(
      "get_media_preview",
      {},
      "See a Bible take or a shot image take as a small JPEG (at most 512 px) before choosing it. Pass exactly one of bible_variant_id or image_take_id.",
    ),
    schema: mediaPreviewRequestSchema,
    requestTimeoutMs: 30000,
    args: (input: Record<string, unknown>) => ({ ...input }),
  },
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
  {
    ...define(
      "export_storyboard_package",
      { storyboard_id: id, format: z.enum(["zip", "sbz"]) },
      "Export storyboard media using the native save dialog. Retry a pending result with the same request ID; reads remain available while the dialog is open.",
      true,
    ),
    requestTimeoutMs: 300000,
    args: (input) => ({
      storyboard_id: input.storyboard_id,
      format: input.format,
    }),
  },
];
