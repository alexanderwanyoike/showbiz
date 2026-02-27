use serde_json::json;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

// ─── MpvController ───────────────────────────────────────────────────────────

pub struct MpvController {
    process: Option<Child>,
    socket_path: PathBuf,
    xlib: Option<x11_dl::xlib::Xlib>,
    display: Option<*mut x11_dl::xlib::Display>,
    child_window: Option<u64>,
}

// Safety: only accessed behind Mutex<MpvController> in AppState
unsafe impl Send for MpvController {}

impl Default for MpvController {
    fn default() -> Self {
        Self::new()
    }
}

impl MpvController {
    pub fn new() -> Self {
        let socket_path =
            std::env::temp_dir().join(format!("showbiz-mpv-{}", std::process::id()));
        Self {
            process: None,
            socket_path,
            xlib: None,
            display: None,
            child_window: None,
        }
    }

    /// Spawn mpv embedded as a child X11 window at (x,y) size (w×h) inside
    /// the given parent X11 window (the Tauri app window).
    pub fn start(&mut self, parent_xid: u64, x: i32, y: i32, w: u32, h: u32) -> Result<(), String> {
        self.stop();

        let xlib = x11_dl::xlib::Xlib::open().map_err(|e| format!("Xlib open failed: {e}"))?;
        let display = unsafe { (xlib.XOpenDisplay)(std::ptr::null()) };
        if display.is_null() {
            return Err("Failed to open X11 display".into());
        }

        let screen = unsafe { (xlib.XDefaultScreen)(display) };
        let black = unsafe { (xlib.XBlackPixel)(display, screen) };

        let child_xid = unsafe {
            (xlib.XCreateSimpleWindow)(
                display,
                parent_xid as x11_dl::xlib::Window,
                x, y, w, h,
                0, black, black,
            )
        };
        if child_xid == 0 {
            unsafe { (xlib.XCloseDisplay)(display) };
            return Err("Failed to create X11 child window".into());
        }

        unsafe {
            (xlib.XMapWindow)(display, child_xid);
            (xlib.XFlush)(display);
        }

        self.xlib = Some(xlib);
        self.display = Some(display);
        self.child_window = Some(child_xid);

        let log = std::env::temp_dir().join(format!("showbiz-mpv-{}.log", std::process::id()));
        let log_stdio = std::fs::File::create(&log).map(Stdio::from).unwrap_or(Stdio::null());

        let child = Command::new("mpv")
            .args([
                "--idle=yes",
                "--keep-open=yes",
                "--osc=no",
                "--osd-level=0",
                "--no-focus-on-open",
                "--no-terminal",
                "--x11-name=showbiz",
                &format!("--wid={child_xid}"),
                &format!("--input-ipc-server={}", self.socket_path.display()),
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(log_stdio)
            .spawn()
            .map_err(|e| format!("Failed to start mpv: {e}"))?;

        self.process = Some(child);

        // Wait up to 5 s for the IPC socket to appear
        for _ in 0..50 {
            if self.socket_path.exists() {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        Err("mpv IPC socket did not appear within 5 s".into())
    }

    pub fn update_geometry(&self, x: i32, y: i32, w: u32, h: u32) {
        if let (Some(ref xlib), Some(display), Some(xid)) =
            (&self.xlib, self.display, self.child_window)
        {
            unsafe {
                (xlib.XMoveResizeWindow)(display, xid as x11_dl::xlib::Window, x, y, w, h);
                (xlib.XFlush)(display);
            }
        }
    }

    pub fn hide(&self) {
        if let (Some(ref xlib), Some(display), Some(xid)) =
            (&self.xlib, self.display, self.child_window)
        {
            unsafe {
                (xlib.XUnmapWindow)(display, xid as x11_dl::xlib::Window);
                (xlib.XFlush)(display);
            }
        }
    }

    pub fn show(&self) {
        if let (Some(ref xlib), Some(display), Some(xid)) =
            (&self.xlib, self.display, self.child_window)
        {
            unsafe {
                (xlib.XMapWindow)(display, xid as x11_dl::xlib::Window);
                (xlib.XFlush)(display);
            }
        }
    }

    fn send(&self, cmd: serde_json::Value) -> Result<serde_json::Value, String> {
        let mut stream = UnixStream::connect(&self.socket_path)
            .map_err(|e| format!("mpv IPC connect failed: {e}"))?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).ok();

        let msg = format!("{cmd}\n");
        stream.write_all(msg.as_bytes()).map_err(|e| format!("mpv IPC write failed: {e}"))?;

        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|e| format!("mpv IPC read failed: {e}"))?;

        serde_json::from_str(&line).map_err(|e| format!("mpv IPC parse failed: {e}"))
    }

    pub fn load_file(&self, path: &str) -> Result<(), String> {
        self.send(json!({ "command": ["loadfile", path] }))?;
        Ok(())
    }

    pub fn seek(&self, seconds: f64) -> Result<(), String> {
        self.send(json!({ "command": ["seek", seconds, "absolute"] }))?;
        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        self.send(json!({ "command": ["set_property", "pause", true] }))?;
        Ok(())
    }

    pub fn resume(&self) -> Result<(), String> {
        self.send(json!({ "command": ["set_property", "pause", false] }))?;
        Ok(())
    }

    pub fn get_position(&self) -> Result<f64, String> {
        let resp = self.send(json!({ "command": ["get_property", "time-pos"] }))?;
        resp.get("data")
            .and_then(|d| d.as_f64())
            .ok_or_else(|| "No position in mpv response".into())
    }

    pub fn is_running(&self) -> bool {
        self.process.is_some()
    }

    pub fn stop(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = std::fs::remove_file(&self.socket_path);

        if let (Some(ref xlib), Some(display), Some(xid)) =
            (&self.xlib, self.display, self.child_window)
        {
            unsafe {
                (xlib.XDestroyWindow)(display, xid as x11_dl::xlib::Window);
                (xlib.XCloseDisplay)(display);
            }
        }
        self.child_window = None;
        self.display = None;
        self.xlib = None;
    }
}

impl Drop for MpvController {
    fn drop(&mut self) {
        self.stop();
    }
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

use tauri::State;

#[tauri::command]
pub fn mpv_start(
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    state: State<'_, crate::AppState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let parent_xid = {
        let handle = window.window_handle().map_err(|e| format!("window handle: {e}"))?;
        match handle.as_ref() {
            RawWindowHandle::Xlib(h) => h.window as u64,
            RawWindowHandle::Xcb(h) => h.window.get() as u64,
            other => return Err(format!("Unsupported window handle: {other:?}")),
        }
    };
    state.mpv.lock().unwrap().start(parent_xid, x, y, w, h)
}

#[tauri::command]
pub fn mpv_stop(state: State<'_, crate::AppState>) {
    state.mpv.lock().unwrap().stop();
}

#[tauri::command]
pub fn mpv_load_file(path: String, state: State<'_, crate::AppState>) -> Result<(), String> {
    state.mpv.lock().unwrap().load_file(&path)
}

#[tauri::command]
pub fn mpv_seek(seconds: f64, state: State<'_, crate::AppState>) -> Result<(), String> {
    state.mpv.lock().unwrap().seek(seconds)
}

#[tauri::command]
pub fn mpv_pause(state: State<'_, crate::AppState>) -> Result<(), String> {
    state.mpv.lock().unwrap().pause()
}

#[tauri::command]
pub fn mpv_resume(state: State<'_, crate::AppState>) -> Result<(), String> {
    state.mpv.lock().unwrap().resume()
}

#[tauri::command]
pub fn mpv_get_position(state: State<'_, crate::AppState>) -> Result<f64, String> {
    state.mpv.lock().unwrap().get_position()
}

#[tauri::command]
pub fn mpv_update_geometry(
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    state.mpv.lock().unwrap().update_geometry(x, y, w, h);
    Ok(())
}

#[tauri::command]
pub fn mpv_hide(state: State<'_, crate::AppState>) -> Result<(), String> {
    state.mpv.lock().unwrap().hide();
    Ok(())
}

#[tauri::command]
pub fn mpv_show(state: State<'_, crate::AppState>) -> Result<(), String> {
    state.mpv.lock().unwrap().show();
    Ok(())
}
