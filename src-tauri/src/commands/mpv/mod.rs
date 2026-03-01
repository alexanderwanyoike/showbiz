pub mod ipc;

use ipc::MpvIpc;
use serde_json::json;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

// ─── Linux X11 child window ──────────────────────────────────────────────────
//
// On Linux/X11, mpv's --wid takes over the entire parent window, so we create
// a child X11 window at the desired position/size and give *that* to mpv.
// On macOS/Windows, mpv respects the view/hwnd bounds, so no child window needed.

#[cfg(target_os = "linux")]
struct X11Window {
    xlib: x11_dl::xlib::Xlib,
    display: *mut x11_dl::xlib::Display,
    child_window: u64,
}

#[cfg(target_os = "linux")]
unsafe impl Send for X11Window {}

#[cfg(target_os = "linux")]
impl X11Window {
    fn new() -> Result<Self, String> {
        let xlib =
            x11_dl::xlib::Xlib::open().map_err(|e| format!("Xlib open failed: {e}"))?;
        let display = unsafe { (xlib.XOpenDisplay)(std::ptr::null()) };
        if display.is_null() {
            return Err("Failed to open X11 display".into());
        }
        Ok(Self {
            xlib,
            display,
            child_window: 0,
        })
    }

    fn create_child(
        &mut self,
        parent_id: u64,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
    ) -> Result<u64, String> {
        let screen = unsafe { (self.xlib.XDefaultScreen)(self.display) };
        let black = unsafe { (self.xlib.XBlackPixel)(self.display, screen) };

        let child_xid = unsafe {
            (self.xlib.XCreateSimpleWindow)(
                self.display,
                parent_id as x11_dl::xlib::Window,
                x,
                y,
                w,
                h,
                0,
                black,
                black,
            )
        };
        if child_xid == 0 {
            return Err("Failed to create X11 child window".into());
        }

        unsafe {
            (self.xlib.XMapWindow)(self.display, child_xid);
            (self.xlib.XFlush)(self.display);
        }

        self.child_window = child_xid;
        Ok(child_xid)
    }

    fn update_geometry(&self, x: i32, y: i32, w: u32, h: u32) {
        if self.child_window != 0 {
            unsafe {
                (self.xlib.XMoveResizeWindow)(
                    self.display,
                    self.child_window as x11_dl::xlib::Window,
                    x,
                    y,
                    w,
                    h,
                );
                (self.xlib.XFlush)(self.display);
            }
        }
    }

    fn hide(&self) {
        if self.child_window != 0 {
            unsafe {
                (self.xlib.XUnmapWindow)(
                    self.display,
                    self.child_window as x11_dl::xlib::Window,
                );
                (self.xlib.XFlush)(self.display);
            }
        }
    }

    fn show(&self) {
        if self.child_window != 0 {
            unsafe {
                (self.xlib.XMapWindow)(
                    self.display,
                    self.child_window as x11_dl::xlib::Window,
                );
                (self.xlib.XFlush)(self.display);
            }
        }
    }

    fn destroy(&mut self) {
        if self.child_window != 0 {
            unsafe {
                (self.xlib.XDestroyWindow)(
                    self.display,
                    self.child_window as x11_dl::xlib::Window,
                );
            }
            self.child_window = 0;
        }
        if !self.display.is_null() {
            unsafe {
                (self.xlib.XCloseDisplay)(self.display);
            }
            self.display = std::ptr::null_mut();
        }
    }
}

#[cfg(target_os = "linux")]
impl Drop for X11Window {
    fn drop(&mut self) {
        self.destroy();
    }
}

// ─── MpvController ───────────────────────────────────────────────────────────

pub struct MpvController {
    process: Option<Child>,
    ipc: Option<Box<dyn MpvIpc>>,
    #[cfg(target_os = "linux")]
    x11_window: Option<X11Window>,
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
        Self {
            process: None,
            ipc: None,
            #[cfg(target_os = "linux")]
            x11_window: None,
        }
    }

    /// Spawn mpv embedded in the given parent window.
    ///
    /// On Linux/X11, creates a child window at (x,y) size (w*h) inside the parent.
    /// On macOS/Windows, passes the parent handle directly to mpv's `--wid`.
    pub fn start(
        &mut self,
        parent_wid: u64,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
    ) -> Result<(), String> {
        self.stop();

        // On Linux, create an X11 child window for mpv to render into.
        // On macOS/Windows, pass the parent handle directly — mpv fills the view.
        #[cfg(target_os = "linux")]
        let wid = {
            let mut x11 = X11Window::new()?;
            let child_wid = x11.create_child(parent_wid, x, y, w, h)?;
            self.x11_window = Some(x11);
            child_wid
        };

        #[cfg(not(target_os = "linux"))]
        let wid = {
            let _ = (x, y, w, h); // geometry handled by mpv on macOS/Windows
            parent_wid
        };

        let ipc_channel = create_ipc()?;
        let mpv_bin = find_mpv_binary()?;

        let log_path =
            std::env::temp_dir().join(format!("showbiz-mpv-{}.log", std::process::id()));

        let mut args = vec![
            "--idle=yes".to_string(),
            "--keep-open=yes".to_string(),
            "--osc=no".to_string(),
            "--osd-level=0".to_string(),
            "--no-focus-on-open".to_string(),
            "--no-terminal".to_string(),
            format!("--log-file={}", log_path.display()),
            format!("--wid={wid}"),
            format!("--input-ipc-server={}", ipc_channel.socket_arg()),
        ];

        #[cfg(target_os = "linux")]
        args.push("--x11-name=showbiz".to_string());

        let child = Command::new(&mpv_bin)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start mpv: {e}"))?;

        self.process = Some(child);

        ipc_channel.wait_for_ready(Duration::from_secs(5))?;
        self.ipc = Some(ipc_channel);

        Ok(())
    }

    pub fn update_geometry(&self, x: i32, y: i32, w: u32, h: u32) {
        #[cfg(target_os = "linux")]
        if let Some(ref x11) = self.x11_window {
            x11.update_geometry(x, y, w, h);
        }
        // No-op on macOS/Windows — mpv fills the provided view
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (x, y, w, h);
        }
    }

    pub fn hide(&self) {
        #[cfg(target_os = "linux")]
        if let Some(ref x11) = self.x11_window {
            x11.hide();
        }
    }

    pub fn show(&self) {
        #[cfg(target_os = "linux")]
        if let Some(ref x11) = self.x11_window {
            x11.show();
        }
    }

    fn send(&self, cmd: serde_json::Value) -> Result<serde_json::Value, String> {
        self.ipc
            .as_ref()
            .ok_or_else(|| "mpv IPC not initialized".to_string())?
            .send_command(cmd)
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
        if let Some(ref ipc) = self.ipc {
            ipc.cleanup();
        }
        self.ipc = None;
        #[cfg(target_os = "linux")]
        {
            if let Some(ref mut x11) = self.x11_window {
                x11.destroy();
            }
            self.x11_window = None;
        }
    }
}

impl Drop for MpvController {
    fn drop(&mut self) {
        self.stop();
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Extract the native window handle from a Tauri WebviewWindow.
///
/// Returns the raw window/view ID as u64, suitable for mpv's `--wid=` flag.
/// Works across X11, macOS (AppKit), and Windows (Win32) without platform crates.
fn get_parent_wid(window: &tauri::WebviewWindow) -> Result<u64, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window
        .window_handle()
        .map_err(|e| format!("window handle: {e}"))?;
    match handle.as_ref() {
        RawWindowHandle::Xlib(h) => Ok(h.window as u64),
        RawWindowHandle::Xcb(h) => Ok(h.window.get() as u64),
        RawWindowHandle::AppKit(h) => Ok(h.ns_view.as_ptr() as u64),
        RawWindowHandle::Win32(h) => Ok(h.hwnd.get() as u64),
        RawWindowHandle::Wayland(_) => {
            Err("mpv --wid requires X11. Set GDK_BACKEND=x11 before launching.".into())
        }
        other => Err(format!("Unsupported window handle: {other:?}")),
    }
}

/// Create the IPC channel for the current platform.
fn create_ipc() -> Result<Box<dyn MpvIpc>, String> {
    #[cfg(unix)]
    {
        Ok(Box::new(ipc::UnixSocketIpc::new()))
    }
    #[cfg(windows)]
    {
        Ok(Box::new(ipc::NamedPipeIpc::new()))
    }
    #[cfg(not(any(unix, windows)))]
    {
        Err("MPV IPC is not supported on this platform".into())
    }
}

/// Find the mpv binary on the system.
///
/// Check order:
/// 1. `SHOWBIZ_MPV_PATH` environment variable
/// 2. Bundled binary next to the executable
/// 3. `which mpv` / `where mpv` (PATH lookup)
/// 4. Platform-specific common paths
fn find_mpv_binary() -> Result<String, String> {
    // 1. Environment variable override
    if let Ok(path) = std::env::var("SHOWBIZ_MPV_PATH") {
        if std::path::Path::new(&path).exists() {
            return Ok(path);
        }
    }

    // 2. Bundled binary next to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("mpv");
            if bundled.exists() {
                return Ok(bundled.to_string_lossy().into_owned());
            }
        }
    }

    // 3. PATH lookup
    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new("which")
            .arg("mpv")
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(path);
                }
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(output) = std::process::Command::new("where")
            .arg("mpv")
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !path.is_empty() {
                    return Ok(path);
                }
            }
        }
    }

    // 4. Platform-specific common paths
    #[cfg(target_os = "macos")]
    {
        for path in &["/opt/homebrew/bin/mpv", "/usr/local/bin/mpv"] {
            if std::path::Path::new(path).exists() {
                return Ok(path.to_string());
            }
        }
    }

    // Fall back to bare "mpv" and let the OS resolve it
    Ok("mpv".to_string())
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
    let parent_wid = get_parent_wid(&window)?;
    state.mpv.lock().unwrap().start(parent_wid, x, y, w, h)
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
