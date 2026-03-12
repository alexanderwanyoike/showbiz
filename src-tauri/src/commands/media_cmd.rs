use crate::media;
use tauri::AppHandle;

#[tauri::command]
pub fn get_media_path(app: AppHandle) -> Result<String, String> {
    let base = media::get_media_base_dir(&app);
    Ok(base.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_assembled_video(
    video_data: Vec<u8>,
    save_path: String,
) -> Result<(), String> {
    let path = std::path::Path::new(&save_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(path, &video_data)
        .map_err(|e| format!("Failed to write assembled video: {}", e))?;
    Ok(())
}
