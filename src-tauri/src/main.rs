// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod media;

use tauri::Manager;

pub struct AppState {
    pub mpv: std::sync::Mutex<commands::mpv::MpvController>,
}

fn main() {
    // WebKitGTK's DMA-BUF video renderer is broken on hybrid GPU systems
    // (Intel + NVIDIA). Disabling it forces the software compositor path,
    // which renders H.264 video correctly via GStreamer avdec_h264.
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let http_client = commands::http_client::HttpClient(
        reqwest::Client::builder()
            .build()
            .expect("Failed to build HTTP client"),
    );

    let app_state = AppState {
        mpv: std::sync::Mutex::new(commands::mpv::MpvController::new()),
    };

    tauri::Builder::default()
        .manage(http_client)
        .manage(app_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            db::init(app.handle())?;
            media::init(app.handle())?;
            // Kill mpv cleanly when the window closes
            let app_handle = app.handle().clone();
            let window = app.get_webview_window("main").expect("main window");
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        state.mpv.lock().unwrap().stop();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::projects::get_project,
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
            // HTTP proxy (bypasses WebKit for cross-origin API calls)
            commands::http_client::http_request,
            // MPV video playback
            commands::mpv::mpv_start,
            commands::mpv::mpv_stop,
            commands::mpv::mpv_load_file,
            commands::mpv::mpv_seek,
            commands::mpv::mpv_pause,
            commands::mpv::mpv_resume,
            commands::mpv::mpv_get_position,
            commands::mpv::mpv_update_geometry,
            commands::mpv::mpv_hide,
            commands::mpv::mpv_show,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
