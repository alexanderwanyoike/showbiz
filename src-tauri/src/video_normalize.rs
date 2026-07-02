//! Video normalization for scrub-friendly playback.
//!
//! AI video providers return clips with only 1-2 keyframes in the whole file
//! (one IDR at the start). Seeking mid-clip forces the decoder to reconstruct
//! from far away, which shows up as smearing artifacts while scrubbing.
//! Re-encoding with a dense keyframe cadence (GOP 12, ~0.5s at 24fps) makes
//! scrubbing frame-accurate. Runs on every saved video and backfills the
//! existing library in a background thread on startup.
//!
//! Uses a bundled `ffmpeg`/`ffprobe` sidecar when present next to the
//! executable, otherwise the system binaries. When neither exists,
//! normalization is skipped (playback still works, scrubbing is just rough).

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

/// Keyframe cadence worse than this (seconds between keyframes) triggers a re-encode.
const MAX_KEYFRAME_INTERVAL_SECS: f64 = 1.5;
/// x264 GOP size for normalized files (2 keyframes per second at 24fps).
const TARGET_GOP_FRAMES: u32 = 12;
/// A re-encode may drift from the original duration by at most this much;
/// larger drift means something went wrong and the original is kept.
const MAX_DURATION_DRIFT_SECS: f64 = 0.25;

#[derive(Debug, PartialEq)]
pub struct VideoStats {
    pub keyframes: usize,
    pub duration_secs: f64,
}

/// Whether a video's keyframes are too sparse for clean scrubbing.
pub fn needs_normalization(stats: &VideoStats) -> bool {
    if stats.duration_secs <= 0.0 || stats.keyframes == 0 {
        // Unreadable or empty probe results: leave the file alone.
        return false;
    }
    stats.duration_secs / stats.keyframes as f64 > MAX_KEYFRAME_INTERVAL_SECS
}

/// Parse `ffprobe -skip_frame nokey -show_entries frame=pts_time -of csv=p=0`
/// output: one non-empty line per keyframe.
pub fn parse_keyframe_count(ffprobe_output: &str) -> usize {
    ffprobe_output.lines().filter(|l| !l.trim().is_empty()).count()
}

/// Parse `ffprobe -show_entries format=duration -of csv=p=0` output.
pub fn parse_duration_secs(ffprobe_output: &str) -> Option<f64> {
    ffprobe_output.trim().parse().ok()
}

/// Container tag stamped into normalized files. Files carrying it are never
/// re-encoded again, so a concurrent instance mid-replace can't trick the
/// sparse-keyframe probe into a destructive second pass.
pub const NORMALIZED_MARKER: &str = "showbiz-normalized-1";

/// ffmpeg arguments to re-encode `input` into `output` with dense keyframes.
/// Video is re-encoded (visually lossless CRF); audio is copied untouched.
pub fn ffmpeg_normalize_args(input: &Path, output: &Path) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.display().to_string(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a:0?".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "veryfast".into(),
        "-crf".into(),
        "18".into(),
        "-g".into(),
        TARGET_GOP_FRAMES.to_string(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "copy".into(),
        "-metadata".into(),
        format!("comment={NORMALIZED_MARKER}"),
        "-movflags".into(),
        "+faststart".into(),
        output.display().to_string(),
    ]
}

/// The tmp file a normalize writes: unique per process, so two instances
/// (e.g. dev-watcher restarts overlapping) can never interleave their ffmpeg
/// output into one file. A shared tmp name is how the media library got
/// cross-spliced on 2026-07-02.
fn normalize_tmp_path(path: &Path) -> PathBuf {
    path.with_extension(format!("normalizing.{}.mp4", std::process::id()))
}

fn which_in_path(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn find_tool(name: &str) -> Option<PathBuf> {
    // A bundled sidecar next to the executable wins; fall back to PATH.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join(name);
            if bundled.is_file() {
                return Some(bundled);
            }
            #[cfg(target_os = "windows")]
            {
                let bundled_exe = dir.join(format!("{name}.exe"));
                if bundled_exe.is_file() {
                    return Some(bundled_exe);
                }
            }
        }
    }
    which_in_path(name)
}

fn run_tool(tool: &Path, args: &[String]) -> Result<String, String> {
    let output = Command::new(tool)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run {}: {}", tool.display(), e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr.lines().rev().take(3).collect::<Vec<_>>().join(" | ");
        return Err(format!("{} failed: {}", tool.display(), tail));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Read the container comment tag; normalized files carry NORMALIZED_MARKER.
fn read_marker(ffprobe: &Path, path: &Path) -> Result<String, String> {
    let out = run_tool(
        ffprobe,
        &[
            "-v".into(),
            "error".into(),
            "-show_entries".into(),
            "format_tags=comment".into(),
            "-of".into(),
            "csv=p=0".into(),
            path.display().to_string(),
        ],
    )?;
    Ok(out.trim().to_string())
}

fn probe(ffprobe: &Path, path: &Path) -> Result<VideoStats, String> {
    let keyframes_out = run_tool(
        ffprobe,
        &[
            "-v".into(),
            "error".into(),
            "-skip_frame".into(),
            "nokey".into(),
            "-select_streams".into(),
            "v:0".into(),
            "-show_entries".into(),
            "frame=pts_time".into(),
            "-of".into(),
            "csv=p=0".into(),
            path.display().to_string(),
        ],
    )?;
    let duration_out = run_tool(
        ffprobe,
        &[
            "-v".into(),
            "error".into(),
            "-show_entries".into(),
            "format=duration".into(),
            "-of".into(),
            "csv=p=0".into(),
            path.display().to_string(),
        ],
    )?;

    Ok(VideoStats {
        keyframes: parse_keyframe_count(&keyframes_out),
        duration_secs: parse_duration_secs(&duration_out).unwrap_or(0.0),
    })
}

/// Normalize one video file in place if its keyframes are too sparse.
/// Re-encodes to a per-process temp file, verifies duration survived, then
/// atomically replaces the original. Files already carrying the normalized
/// marker are never touched, regardless of what a (possibly racing) probe
/// says. Returns whether a re-encode happened.
fn normalize_file(ffmpeg: &Path, ffprobe: &Path, path: &Path) -> Result<bool, String> {
    if read_marker(ffprobe, path)? == NORMALIZED_MARKER {
        return Ok(false);
    }

    let stats = probe(ffprobe, path)?;
    if !needs_normalization(&stats) {
        return Ok(false);
    }

    let tmp = normalize_tmp_path(path);
    let result = run_tool(ffmpeg, &ffmpeg_normalize_args(path, &tmp));
    if let Err(e) = result {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }

    let new_stats = probe(ffprobe, &tmp)?;
    let drift = (new_stats.duration_secs - stats.duration_secs).abs();
    if drift > MAX_DURATION_DRIFT_SECS || new_stats.keyframes <= stats.keyframes {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!(
            "re-encode verification failed (duration drift {:.2}s, keyframes {} -> {})",
            drift, stats.keyframes, new_stats.keyframes
        ));
    }

    std::fs::rename(&tmp, path).map_err(|e| format!("failed to replace original: {}", e))?;
    Ok(true)
}

/// Normalize a just-saved video. Missing tools or failures never fail the
/// save; the video simply stays as delivered (playable, rough scrubbing).
pub fn normalize_saved_video(path: &Path) {
    let (Some(ffmpeg), Some(ffprobe)) = (find_tool("ffmpeg"), find_tool("ffprobe")) else {
        eprintln!("[normalize] ffmpeg/ffprobe not found; skipping {}", path.display());
        return;
    };
    match normalize_file(&ffmpeg, &ffprobe, path) {
        Ok(true) => println!("[normalize] re-encoded {}", path.display()),
        Ok(false) => {}
        Err(e) => eprintln!("[normalize] {}: {}", path.display(), e),
    }
}

fn collect_mp4s(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            collect_mp4s(&path, out);
        } else if name.ends_with(".mp4") && !name.contains(".normalizing.") {
            out.push(path);
        }
    }
}

/// Backfill: normalize every video in the media library that needs it.
/// Runs on a background thread at startup; already-normalized files are
/// only probed (fast) and skipped.
pub fn normalize_library(app: &AppHandle) {
    let videos_dir = crate::media::get_media_base_dir(app).join("videos");
    let (Some(ffmpeg), Some(ffprobe)) = (find_tool("ffmpeg"), find_tool("ffprobe")) else {
        eprintln!("[normalize] ffmpeg/ffprobe not found; skipping library backfill");
        return;
    };

    // Exclusive backfill lock: overlapping instances (dev-watcher restarts)
    // must never normalize the same library concurrently. A stale lock
    // (crashed instance) expires after 30 minutes.
    let lock_path = videos_dir.join(".normalize.lock");
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&lock_path) {
        Ok(_) => {}
        Err(_) => {
            let stale = std::fs::metadata(&lock_path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .map(|age| age.as_secs() > 30 * 60)
                .unwrap_or(true);
            if !stale {
                println!("[normalize] another instance holds the backfill lock; skipping");
                return;
            }
            eprintln!("[normalize] removing stale backfill lock");
            let _ = std::fs::remove_file(&lock_path);
            if std::fs::OpenOptions::new().write(true).create_new(true).open(&lock_path).is_err() {
                println!("[normalize] could not acquire backfill lock; skipping");
                return;
            }
        }
    }

    let mut files = Vec::new();
    collect_mp4s(&videos_dir, &mut files);

    let (mut normalized, mut skipped, mut failed) = (0, 0, 0);
    for path in files {
        match normalize_file(&ffmpeg, &ffprobe, &path) {
            Ok(true) => normalized += 1,
            Ok(false) => skipped += 1,
            Err(e) => {
                failed += 1;
                eprintln!("[normalize] {}: {}", path.display(), e);
            }
        }
    }
    println!(
        "[normalize] library backfill done: {} re-encoded, {} already fine, {} failed",
        normalized, skipped, failed
    );
    let _ = std::fs::remove_file(&lock_path);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sparse_keyframes_need_normalization() {
        // One keyframe in a 10s clip — the AI-provider pattern
        assert!(needs_normalization(&VideoStats { keyframes: 1, duration_secs: 10.0 }));
        assert!(needs_normalization(&VideoStats { keyframes: 2, duration_secs: 8.0 }));
    }

    #[test]
    fn dense_keyframes_are_left_alone() {
        // Normalized cadence: 2 keyframes per second
        assert!(!needs_normalization(&VideoStats { keyframes: 16, duration_secs: 8.0 }));
        // Exactly at the threshold is acceptable
        assert!(!needs_normalization(&VideoStats { keyframes: 4, duration_secs: 6.0 }));
    }

    #[test]
    fn unreadable_probes_are_left_alone() {
        assert!(!needs_normalization(&VideoStats { keyframes: 0, duration_secs: 8.0 }));
        assert!(!needs_normalization(&VideoStats { keyframes: 1, duration_secs: 0.0 }));
    }

    #[test]
    fn keyframe_count_parses_csv_lines() {
        assert_eq!(parse_keyframe_count("0.000000\n4.208333\n"), 2);
        assert_eq!(parse_keyframe_count(""), 0);
        assert_eq!(parse_keyframe_count("0.000000\n\n"), 1);
    }

    #[test]
    fn duration_parses_seconds() {
        assert_eq!(parse_duration_secs("8.041667\n"), Some(8.041667));
        assert_eq!(parse_duration_secs("garbage"), None);
    }

    #[test]
    fn normalize_args_reencode_video_and_copy_audio() {
        let args = ffmpeg_normalize_args(Path::new("/in.mp4"), Path::new("/out.mp4"));
        let joined = args.join(" ");
        assert!(joined.contains("-g 12"), "dense GOP missing: {joined}");
        assert!(joined.contains("-c:v libx264"));
        assert!(joined.contains("-c:a copy"));
        assert!(joined.contains("-movflags +faststart"));
        assert_eq!(args.last().unwrap(), "/out.mp4");
        // Optional audio mapping must not fail on silent clips
        assert!(joined.contains("-map 0:a:0?"));
        // The marker prevents any future pass from re-encoding this file
        assert!(joined.contains(&format!("comment={NORMALIZED_MARKER}")));
    }

    #[test]
    fn tmp_path_is_unique_per_process() {
        let tmp = normalize_tmp_path(Path::new("/media/videos/clip.mp4"));
        let name = tmp.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.contains(&std::process::id().to_string()), "{name}");
        assert!(name.contains(".normalizing."), "{name}");
        // The backfill scanner must never pick tmp files up as videos
        let mut found = Vec::new();
        let dir = std::env::temp_dir().join(format!("showbiz-tmp-scan-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(&name), b"x").unwrap();
        std::fs::write(dir.join("real.mp4"), b"x").unwrap();
        collect_mp4s(&dir, &mut found);
        assert_eq!(found.len(), 1);
        assert!(found[0].ends_with("real.mp4"));
        std::fs::remove_dir_all(&dir).ok();
    }

    // End-to-end against real ffmpeg; skipped when the tools aren't installed
    // (they are on dev machines and Ubuntu CI runners).
    #[test]
    fn normalizes_a_sparse_video_in_place() {
        let (Some(ffmpeg), Some(ffprobe)) = (find_tool("ffmpeg"), find_tool("ffprobe")) else {
            eprintln!("ffmpeg/ffprobe not installed; skipping integration test");
            return;
        };

        let dir = std::env::temp_dir().join(format!("showbiz-norm-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let video = dir.join("sparse.mp4");

        // Generate a 4s test clip with keyframes as sparse as x264 allows
        run_tool(
            &ffmpeg,
            &[
                "-y".into(),
                "-f".into(),
                "lavfi".into(),
                "-i".into(),
                "testsrc=duration=4:size=320x180:rate=24".into(),
                "-c:v".into(),
                "libx264".into(),
                "-g".into(),
                "999".into(),
                "-sc_threshold".into(),
                "0".into(),
                video.display().to_string(),
            ],
        )
        .unwrap();

        let before = probe(&ffprobe, &video).unwrap();
        assert!(needs_normalization(&before), "test clip should be sparse: {before:?}");

        let reencoded = normalize_file(&ffmpeg, &ffprobe, &video).unwrap();
        assert!(reencoded);

        let after = probe(&ffprobe, &video).unwrap();
        assert!(!needs_normalization(&after), "should be dense now: {after:?}");
        assert!((after.duration_secs - before.duration_secs).abs() <= MAX_DURATION_DRIFT_SECS);

        // Idempotent: a second pass is a no-op
        assert!(!normalize_file(&ffmpeg, &ffprobe, &video).unwrap());

        std::fs::remove_dir_all(&dir).ok();
    }
}
