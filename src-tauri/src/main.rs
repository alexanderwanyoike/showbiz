// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod media;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            db::init(app.handle())?;
            media::init(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::projects::get_projects,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            // Storyboards
            commands::projects::get_storyboards,
            commands::projects::get_storyboards_with_preview,
            commands::projects::get_storyboard,
            commands::projects::create_storyboard,
            commands::projects::update_storyboard,
            commands::projects::delete_storyboard,
            commands::projects::update_storyboard_models,
            // Shots
            commands::shots::get_shots,
            commands::shots::create_shot,
            commands::shots::update_shot,
            commands::shots::delete_shot,
            commands::shots::reorder_shots,
            commands::shots::save_shot_image,
            commands::shots::save_shot_video,
            commands::shots::get_shot_image_base64,
            commands::shots::copy_image_from_shot,
            commands::shots::save_and_complete_video,
            // Settings
            commands::settings::get_api_key,
            commands::settings::get_api_key_status,
            commands::settings::save_api_key,
            commands::settings::delete_api_key,
            // Image versions
            commands::image_versions::get_image_versions,
            commands::image_versions::switch_to_version,
            commands::image_versions::create_generation_version,
            commands::image_versions::create_remix_version,
            commands::image_versions::get_version_image_base64,
            commands::image_versions::delete_version,
            commands::image_versions::get_version_count,
            // Timeline
            commands::timeline::get_timeline_edits,
            commands::timeline::update_timeline_edit,
            commands::timeline::reset_timeline_edit,
            commands::timeline::reset_all_timeline_edits,
            // Media
            commands::media_cmd::get_media_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
