use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Initialize media directories
pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let base = get_media_base_dir(app);
    std::fs::create_dir_all(base.join("images").join("versions"))?;
    std::fs::create_dir_all(base.join("videos"))?;
    std::fs::create_dir_all(base.join("masks"))?;
    Ok(())
}

/// Get the base media directory path
pub fn get_media_base_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("media")
}

/// Parse a base64 data URL into (mime_subtype, raw_bytes)
/// Supports formats like "data:image/png;base64,iVBOR..." and "data:video/mp4;base64,AAAA..."
pub(crate) fn parse_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    // Find the comma separating the header from the data
    let comma_pos = data_url
        .find(',')
        .ok_or_else(|| "Invalid data URL: no comma separator found".to_string())?;

    let header = &data_url[..comma_pos];
    let b64_data = &data_url[comma_pos + 1..];

    // Parse mime type from header like "data:image/png;base64"
    let mime_subtype = if let Some(start) = header.find('/') {
        let after_slash = &header[start + 1..];
        if let Some(end) = after_slash.find(';') {
            after_slash[..end].to_string()
        } else {
            after_slash.to_string()
        }
    } else {
        return Err("Invalid data URL: no MIME type found".to_string());
    };

    let bytes = STANDARD
        .decode(b64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    Ok((mime_subtype, bytes))
}

/// Map image MIME subtype to file extension
pub(crate) fn image_ext(mime_subtype: &str) -> &str {
    match mime_subtype {
        "jpeg" => "jpg",
        "png" => "png",
        "gif" => "gif",
        "webp" => "webp",
        _ => "png",
    }
}

/// Map video MIME subtype to file extension
pub(crate) fn video_ext(mime_subtype: &str) -> &str {
    match mime_subtype {
        "mp4" => "mp4",
        "webm" => "webm",
        "x-matroska" => "mkv",
        "quicktime" => "mov",
        "x-msvideo" => "avi",
        "mpeg" => "mpeg",
        _ => "mp4",
    }
}

/// Map file extension to MIME type
pub(crate) fn ext_to_mime(ext: &str) -> &str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mpeg" => "video/mpeg",
        _ => "application/octet-stream",
    }
}

/// Map video MIME type string to file extension
pub(crate) fn video_mime_to_ext(mime_type: &str) -> &str {
    let subtype = if let Some(pos) = mime_type.find('/') {
        &mime_type[pos + 1..]
    } else {
        mime_type
    };
    video_ext(subtype)
}

/// Save an image from a base64 data URL. Returns relative path like "images/shotid.ext".
pub fn save_image(app: &AppHandle, shot_id: &str, base64_data_url: &str) -> Result<String, String> {
    let base = get_media_base_dir(app);
    let (mime_subtype, bytes) = parse_data_url(base64_data_url)?;
    let ext = image_ext(&mime_subtype);
    let filename = format!("{}.{}", shot_id, ext);
    let filepath = base.join("images").join(&filename);

    std::fs::write(&filepath, &bytes).map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(format!("images/{}", filename))
}

/// Save a video from a base64 data URL. Returns relative path like "videos/shotid.ext".
pub fn save_video(app: &AppHandle, shot_id: &str, base64_data_url: &str) -> Result<String, String> {
    let base = get_media_base_dir(app);
    let (mime_subtype, bytes) = parse_data_url(base64_data_url)?;
    let ext = video_ext(&mime_subtype);
    let filename = format!("{}.{}", shot_id, ext);
    let filepath = base.join("videos").join(&filename);

    std::fs::write(&filepath, &bytes).map_err(|e| format!("Failed to write video: {}", e))?;

    Ok(format!("videos/{}", filename))
}

/// Save raw video bytes with a given MIME type. Returns relative path.
pub fn save_video_blob(
    app: &AppHandle,
    shot_id: &str,
    data: &[u8],
    mime_type: &str,
) -> Result<String, String> {
    let base = get_media_base_dir(app);
    let ext = video_mime_to_ext(mime_type);
    let filename = format!("{}.{}", shot_id, ext);
    let filepath = base.join("videos").join(&filename);

    std::fs::write(&filepath, data).map_err(|e| format!("Failed to write video blob: {}", e))?;

    Ok(format!("videos/{}", filename))
}

/// Read a media file and return it as a base64 data URL (e.g. "data:image/png;base64,...").
/// Returns None if the file does not exist.
pub fn get_image_as_base64(app: &AppHandle, relative_path: &str) -> Result<Option<String>, String> {
    let base = get_media_base_dir(app);
    let filepath = base.join(relative_path);

    if !filepath.exists() {
        return Ok(None);
    }

    let bytes =
        std::fs::read(&filepath).map_err(|e| format!("Failed to read file: {}", e))?;
    let b64 = STANDARD.encode(&bytes);

    let ext = filepath
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime = ext_to_mime(ext);

    Ok(Some(format!("data:{};base64,{}", mime, b64)))
}

/// Delete a media file given its relative path. Returns true if deleted.
pub fn delete_media(app: &AppHandle, relative_path: &str) -> bool {
    let base = get_media_base_dir(app);
    let filepath = base.join(relative_path);
    if filepath.exists() {
        std::fs::remove_file(&filepath).is_ok()
    } else {
        false
    }
}

/// Save a version image. Returns relative path like "images/versions/shotid/vN.ext".
pub fn save_version_image(
    app: &AppHandle,
    shot_id: &str,
    version_number: i32,
    base64_data_url: &str,
) -> Result<String, String> {
    let base = get_media_base_dir(app);
    let version_dir = base.join("images").join("versions").join(shot_id);
    std::fs::create_dir_all(&version_dir)
        .map_err(|e| format!("Failed to create version dir: {}", e))?;

    let (mime_subtype, bytes) = parse_data_url(base64_data_url)?;
    let ext = image_ext(&mime_subtype);
    let filename = format!("v{}.{}", version_number, ext);
    let filepath = version_dir.join(&filename);

    std::fs::write(&filepath, &bytes)
        .map_err(|e| format!("Failed to write version image: {}", e))?;

    Ok(format!("images/versions/{}/{}", shot_id, filename))
}

/// Read a version image as a base64 data URL.
pub fn get_version_image_as_base64(
    app: &AppHandle,
    shot_id: &str,
    version_number: i32,
) -> Result<Option<String>, String> {
    let base = get_media_base_dir(app);
    let version_dir = base.join("images").join("versions").join(shot_id);

    if !version_dir.exists() {
        return Ok(None);
    }

    // Find file matching vN.* pattern
    let prefix = format!("v{}.", version_number);
    let entries = std::fs::read_dir(&version_dir)
        .map_err(|e| format!("Failed to read version dir: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(&prefix) {
            let filepath = entry.path();
            let bytes = std::fs::read(&filepath)
                .map_err(|e| format!("Failed to read version image: {}", e))?;
            let b64 = STANDARD.encode(&bytes);
            let ext = filepath
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");
            let mime = ext_to_mime(ext);
            return Ok(Some(format!("data:{};base64,{}", mime, b64)));
        }
    }

    Ok(None)
}

/// Delete all version images for a shot.
pub fn delete_version_images(app: &AppHandle, shot_id: &str) -> bool {
    let base = get_media_base_dir(app);
    let version_dir = base.join("images").join("versions").join(shot_id);
    if version_dir.exists() {
        std::fs::remove_dir_all(&version_dir).is_ok()
    } else {
        false
    }
}

/// Delete all mask images for a shot.
pub fn delete_mask_images(app: &AppHandle, shot_id: &str) -> bool {
    let base = get_media_base_dir(app);
    let mask_dir = base.join("masks").join(shot_id);
    if mask_dir.exists() {
        std::fs::remove_dir_all(&mask_dir).is_ok()
    } else {
        false
    }
}

/// Save a mask image. Returns relative path like "masks/shotid/versionid.png".
pub fn save_mask_image(
    app: &AppHandle,
    shot_id: &str,
    version_id: &str,
    base64_data_url: &str,
) -> Result<String, String> {
    let base = get_media_base_dir(app);
    let mask_dir = base.join("masks").join(shot_id);
    std::fs::create_dir_all(&mask_dir)
        .map_err(|e| format!("Failed to create mask dir: {}", e))?;

    let (_mime_subtype, bytes) = parse_data_url(base64_data_url)?;
    let filename = format!("{}.png", version_id);
    let filepath = mask_dir.join(&filename);

    std::fs::write(&filepath, &bytes)
        .map_err(|e| format!("Failed to write mask image: {}", e))?;

    Ok(format!("masks/{}/{}", shot_id, filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- parse_data_url tests --

    #[test]
    fn parse_data_url_valid_png() {
        let b64 = STANDARD.encode(b"fake png bytes");
        let url = format!("data:image/png;base64,{}", b64);
        let (mime, bytes) = parse_data_url(&url).unwrap();
        assert_eq!(mime, "png");
        assert_eq!(bytes, b"fake png bytes");
    }

    #[test]
    fn parse_data_url_valid_jpeg() {
        let b64 = STANDARD.encode(b"jpeg data");
        let url = format!("data:image/jpeg;base64,{}", b64);
        let (mime, _) = parse_data_url(&url).unwrap();
        assert_eq!(mime, "jpeg");
    }

    #[test]
    fn parse_data_url_valid_video_mp4() {
        let b64 = STANDARD.encode(b"mp4 data");
        let url = format!("data:video/mp4;base64,{}", b64);
        let (mime, bytes) = parse_data_url(&url).unwrap();
        assert_eq!(mime, "mp4");
        assert_eq!(bytes, b"mp4 data");
    }

    #[test]
    fn parse_data_url_missing_comma() {
        let result = parse_data_url("data:image/png;base64AAAA");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no comma separator"));
    }

    #[test]
    fn parse_data_url_missing_mime() {
        let result = parse_data_url("database64,AAAA");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no MIME type"));
    }

    #[test]
    fn parse_data_url_invalid_base64() {
        let result = parse_data_url("data:image/png;base64,!!!not-valid-base64!!!");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Base64 decode error"));
    }

    // -- image_ext tests --

    #[test]
    fn image_ext_known_types() {
        assert_eq!(image_ext("jpeg"), "jpg");
        assert_eq!(image_ext("png"), "png");
        assert_eq!(image_ext("gif"), "gif");
        assert_eq!(image_ext("webp"), "webp");
    }

    #[test]
    fn image_ext_unknown_defaults_to_png() {
        assert_eq!(image_ext("bmp"), "png");
        assert_eq!(image_ext("tiff"), "png");
    }

    // -- video_ext tests --

    #[test]
    fn video_ext_known_types() {
        assert_eq!(video_ext("mp4"), "mp4");
        assert_eq!(video_ext("webm"), "webm");
        assert_eq!(video_ext("x-matroska"), "mkv");
        assert_eq!(video_ext("quicktime"), "mov");
    }

    #[test]
    fn video_ext_unknown_defaults_to_mp4() {
        assert_eq!(video_ext("flv"), "mp4");
        assert_eq!(video_ext("unknown"), "mp4");
    }

    // -- ext_to_mime tests --

    #[test]
    fn ext_to_mime_roundtrip() {
        assert_eq!(ext_to_mime("png"), "image/png");
        assert_eq!(ext_to_mime("jpg"), "image/jpeg");
        assert_eq!(ext_to_mime("mp4"), "video/mp4");
        assert_eq!(ext_to_mime("webm"), "video/webm");
        assert_eq!(ext_to_mime("mkv"), "video/x-matroska");
        assert_eq!(ext_to_mime("unknown"), "application/octet-stream");
    }

    // -- video_mime_to_ext tests --

    #[test]
    fn video_mime_to_ext_full_mime() {
        assert_eq!(video_mime_to_ext("video/mp4"), "mp4");
        assert_eq!(video_mime_to_ext("video/webm"), "webm");
    }

    #[test]
    fn video_mime_to_ext_bare_subtype() {
        assert_eq!(video_mime_to_ext("mp4"), "mp4");
        assert_eq!(video_mime_to_ext("webm"), "webm");
    }
}
