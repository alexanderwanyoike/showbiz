const documentSwitches = new Set([
  "create_project_document",
  "open_project_document",
  "close_project_document",
  "save_project_document_as",
  "import_legacy_project",
]);

const savingMutations = new Set([
  "sync_generation_charges",
  "save_generation_price",
  "clear_generation_price",
  "set_local_generation_config",
  "begin_generation_usage",
  "record_generation_receipt",
  "finish_generation_usage",
  "clear_shot_end_frame",
  "clear_shot_start_frame",
  "copy_image_from_shot",
  "create_bible",
  "create_bible_asset",
  "create_bible_asset_variant",
  "create_generation_version",
  "create_project",
  "create_remix_version",
  "create_shot",
  "create_storyboard",
  "create_video_generation_version",
  "delete_api_key",
  "delete_bible",
  "delete_bible_asset",
  "delete_bible_asset_variant",
  "delete_project",
  "delete_shot",
  "delete_storyboard",
  "delete_version",
  "reorder_shots",
  "set_shot_models",
  "set_shot_video_settings",
  "save_and_complete_video",
  "save_api_key",
  "save_shot_end_frame",
  "save_shot_image",
  "save_shot_video",
  "switch_to_version",
  "switch_to_video_version",
  "update_bible",
  "update_bible_asset",
  "update_bible_asset_variant_status",
  "update_project",
  "update_shot",
  "update_storyboard",
  "update_storyboard_models",
  "update_storyboard_settings",
]);

export function commandWorkKind(
  command: string,
): "saving" | "export" | undefined {
  if (command === "export_storyboard_package") return "export";
  return savingMutations.has(command) ? "saving" : undefined;
}

export function commandSwitchesDocument(command: string): boolean {
  return documentSwitches.has(command);
}

export function commandChangesData(command: string, result: unknown): boolean {
  if (!savingMutations.has(command) && !documentSwitches.has(command))
    return false;
  if (result === false) return false;
  if (typeof result === "object" && result !== null && "ok" in result) {
    if (result.ok === false) return false;
    if (
      documentSwitches.has(command) &&
      command !== "close_project_document" &&
      "value" in result &&
      result.value === null
    )
      return false;
  }
  return true;
}

const nonSavingCommands = new Set([
  "get_project",
  "get_projects",
  "get_storyboard",
  "get_storyboards",
  "get_storyboards_with_preview",
  "get_shots",
  "get_shot_image_base64",
  "get_shot_end_frame_base64",
  "get_image_versions",
  "get_version_count",
  "get_bible_variant_image_base64",
  "get_version_image_base64",
  "get_video_versions",
  "get_current_video_version",
  "get_video_version_path",
  "get_video_version_count",
  "get_media_path",
  "get_api_key",
  "get_api_key_status",
  "get_bibles",
  "get_bible_assets",
  "get_bible_asset_variants",
  "get_generation_models",
  "get_generation_usage",
  "get_generation_cost_summary",
  "get_generation_price",
  "get_local_generation_config",
  "http_request",
  "export_storyboard_package",
]);

export function commandIsDocumentScoped(command: string): boolean {
  return savingMutations.has(command) || nonSavingCommands.has(command);
}
