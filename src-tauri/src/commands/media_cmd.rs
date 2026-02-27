use crate::media;
use tauri::AppHandle;

#[tauri::command]
pub fn get_media_path(app: AppHandle) -> Result<String, String> {
    let base = media::get_media_base_dir(&app);
    Ok(base.to_string_lossy().to_string())
}
