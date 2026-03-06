pub mod ipc;

use ipc::MpvIpc;
use serde_json::json;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

// ─── Linux X11 child window ──────────────────────────────────────────────────
//
// On all platforms, mpv's --wid renders behind the WebView when given the main
// window handle. We create a platform-specific child window/view at the desired
// position/size and give *that* to mpv so it renders on top of the WebView.

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

// ─── macOS native subview ────────────────────────────────────────────────────
//
// On macOS, mpv's --wid renders behind the WKWebView when given the window's
// content view. We create a native NSView subview on top of the WebView and
// give *that* to mpv, mirroring the Linux X11 child-window approach.

#[cfg(target_os = "macos")]
struct MacosView {
    /// The child NSView we created (retained).
    child_view: *mut std::ffi::c_void,
}

#[cfg(target_os = "macos")]
unsafe impl Send for MacosView {}

#[cfg(target_os = "macos")]
impl MacosView {
    fn new() -> Self {
        Self {
            child_view: std::ptr::null_mut(),
        }
    }

    /// Create a child NSView at the given geometry within the parent NSView.
    /// Returns the child view pointer as u64 for mpv's --wid.
    fn create_child(
        &mut self,
        parent_ns_view: u64,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
    ) -> Result<u64, String> {
        use objc2::rc::Retained;
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSView;
        use objc2_foundation::NSRect;

        unsafe {
            let mtm = MainThreadMarker::new()
                .ok_or("mpv view must be created on the main thread")?;

            let parent: &NSView = &*(parent_ns_view as *const NSView);

            // Get the parent's height to flip coordinates (NSView origin is bottom-left)
            let parent_frame = parent.frame();
            let flipped_y = parent_frame.size.height - (y as f64) - (h as f64);

            let frame = NSRect::new(
                objc2_foundation::NSPoint::new(x as f64, flipped_y),
                objc2_foundation::NSSize::new(w as f64, h as f64),
            );

            let child = NSView::initWithFrame(mtm.alloc(), frame);
            child.setWantsLayer(true);

            // Add as subview — this puts it on top of the WebView
            parent.addSubview(&child);

            let ptr = Retained::into_raw(child) as *mut std::ffi::c_void;
            self.child_view = ptr;
            Ok(ptr as u64)
        }
    }

    fn update_geometry(&self, parent_ns_view: u64, x: i32, y: i32, w: u32, h: u32) {
        if self.child_view.is_null() {
            return;
        }
        use objc2_app_kit::NSView;
        use objc2_foundation::NSRect;

        unsafe {
            let parent: &NSView = &*(parent_ns_view as *const NSView);
            let child: &NSView = &*(self.child_view as *const NSView);

            let parent_frame = parent.frame();
            let flipped_y = parent_frame.size.height - (y as f64) - (h as f64);

            let frame = NSRect::new(
                objc2_foundation::NSPoint::new(x as f64, flipped_y),
                objc2_foundation::NSSize::new(w as f64, h as f64),
            );
            child.setFrame(frame);
        }
    }

    fn hide(&self) {
        if !self.child_view.is_null() {
            unsafe {
                let child: &objc2_app_kit::NSView =
                    &*(self.child_view as *const objc2_app_kit::NSView);
                child.setHidden(true);
            }
        }
    }

    fn show(&self) {
        if !self.child_view.is_null() {
            unsafe {
                let child: &objc2_app_kit::NSView =
                    &*(self.child_view as *const objc2_app_kit::NSView);
                child.setHidden(false);
            }
        }
    }

    fn destroy(&mut self) {
        if !self.child_view.is_null() {
            unsafe {
                let child: &objc2_app_kit::NSView =
                    &*(self.child_view as *const objc2_app_kit::NSView);
                child.removeFromSuperview();
                // Re-take ownership so it gets dropped
                let _ = objc2::rc::Retained::from_raw(
                    self.child_view as *mut objc2_app_kit::NSView,
                );
            }
            self.child_view = std::ptr::null_mut();
        }
    }
}

#[cfg(target_os = "macos")]
impl Drop for MacosView {
    fn drop(&mut self) {
        self.destroy();
    }
}

// ─── Windows child window ────────────────────────────────────────────────────
//
// On Windows, mpv's --wid renders behind the WebView2 when given the parent
// HWND. We create a child HWND on top of the WebView and give *that* to mpv.
//
// Uses raw Win32 FFI to avoid windows crate version churn.

#[cfg(target_os = "windows")]
mod win32_ffi {
    use std::ffi::c_void;

    pub type HWND = *mut c_void;
    type HMENU = *mut c_void;
    type HINSTANCE = *mut c_void;
    type LPCWSTR = *const u16;

    pub const WS_CHILD: u32 = 0x40000000;
    pub const WS_VISIBLE: u32 = 0x10000000;
    pub const WS_CLIPSIBLINGS: u32 = 0x04000000;
    pub const SWP_NOACTIVATE: u32 = 0x0010;
    pub const SW_HIDE: i32 = 0;
    pub const SW_SHOW: i32 = 5;
    pub const HWND_TOP: HWND = 0 as HWND;

    extern "system" {
        pub fn CreateWindowExW(
            ex_style: u32,
            class_name: LPCWSTR,
            window_name: LPCWSTR,
            style: u32,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            parent: HWND,
            menu: HMENU,
            instance: HINSTANCE,
            param: *mut c_void,
        ) -> HWND;
        pub fn DestroyWindow(hwnd: HWND) -> i32;
        pub fn ShowWindow(hwnd: HWND, cmd_show: i32) -> i32;
        pub fn SetWindowPos(
            hwnd: HWND,
            insert_after: HWND,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }

    /// Encode a &str as null-terminated UTF-16. Only used for static class names.
    pub fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(target_os = "windows")]
struct Win32Window {
    child_hwnd: u64,
}

#[cfg(target_os = "windows")]
unsafe impl Send for Win32Window {}

#[cfg(target_os = "windows")]
impl Win32Window {
    fn new() -> Self {
        Self { child_hwnd: 0 }
    }

    fn create_child(
        &mut self,
        parent_hwnd: u64,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
    ) -> Result<u64, String> {
        use win32_ffi::*;

        let class = wide("Static");
        let title = wide("");

        unsafe {
            let child = CreateWindowExW(
                0,
                class.as_ptr(),
                title.as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
                x,
                y,
                w as i32,
                h as i32,
                parent_hwnd as HWND,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
            if child.is_null() {
                return Err("CreateWindowExW failed".into());
            }

            self.child_hwnd = child as u64;
            Ok(self.child_hwnd)
        }
    }

    fn update_geometry(&self, x: i32, y: i32, w: u32, h: u32) {
        if self.child_hwnd != 0 {
            use win32_ffi::*;
            unsafe {
                SetWindowPos(
                    self.child_hwnd as HWND,
                    HWND_TOP,
                    x,
                    y,
                    w as i32,
                    h as i32,
                    SWP_NOACTIVATE,
                );
            }
        }
    }

    fn hide(&self) {
        if self.child_hwnd != 0 {
            unsafe {
                win32_ffi::ShowWindow(self.child_hwnd as win32_ffi::HWND, win32_ffi::SW_HIDE);
            }
        }
    }

    fn show(&self) {
        if self.child_hwnd != 0 {
            unsafe {
                win32_ffi::ShowWindow(self.child_hwnd as win32_ffi::HWND, win32_ffi::SW_SHOW);
            }
        }
    }

    fn destroy(&mut self) {
        if self.child_hwnd != 0 {
            unsafe {
                win32_ffi::DestroyWindow(self.child_hwnd as win32_ffi::HWND);
            }
            self.child_hwnd = 0;
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for Win32Window {
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
    #[cfg(target_os = "macos")]
    macos_view: Option<MacosView>,
    #[cfg(target_os = "macos")]
    parent_ns_view: u64,
    #[cfg(target_os = "windows")]
    win32_window: Option<Win32Window>,
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
            #[cfg(target_os = "macos")]
            macos_view: None,
            #[cfg(target_os = "macos")]
            parent_ns_view: 0,
            #[cfg(target_os = "windows")]
            win32_window: None,
        }
    }

    /// Spawn mpv embedded in the given parent window.
    ///
    /// Creates a platform-specific child window/view at (x,y) size (w*h) inside
    /// the parent, then passes that child to mpv's `--wid`.
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

        #[cfg(target_os = "macos")]
        let wid = {
            let mut macos = MacosView::new();
            let child_wid = macos.create_child(parent_wid, x, y, w, h)?;
            self.macos_view = Some(macos);
            self.parent_ns_view = parent_wid;
            child_wid
        };

        #[cfg(target_os = "windows")]
        let wid = {
            let mut win32 = Win32Window::new();
            let child_wid = win32.create_child(parent_wid, x, y, w, h)?;
            self.win32_window = Some(win32);
            child_wid
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
        #[cfg(target_os = "macos")]
        if let Some(ref macos) = self.macos_view {
            macos.update_geometry(self.parent_ns_view, x, y, w, h);
        }
        #[cfg(target_os = "windows")]
        if let Some(ref win32) = self.win32_window {
            win32.update_geometry(x, y, w, h);
        }
    }

    pub fn hide(&self) {
        #[cfg(target_os = "linux")]
        if let Some(ref x11) = self.x11_window {
            x11.hide();
        }
        #[cfg(target_os = "macos")]
        if let Some(ref macos) = self.macos_view {
            macos.hide();
        }
        #[cfg(target_os = "windows")]
        if let Some(ref win32) = self.win32_window {
            win32.hide();
        }
    }

    pub fn show(&self) {
        #[cfg(target_os = "linux")]
        if let Some(ref x11) = self.x11_window {
            x11.show();
        }
        #[cfg(target_os = "macos")]
        if let Some(ref macos) = self.macos_view {
            macos.show();
        }
        #[cfg(target_os = "windows")]
        if let Some(ref win32) = self.win32_window {
            win32.show();
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
        #[cfg(target_os = "macos")]
        {
            if let Some(ref mut macos) = self.macos_view {
                macos.destroy();
            }
            self.macos_view = None;
            self.parent_ns_view = 0;
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(ref mut win32) = self.win32_window {
                win32.destroy();
            }
            self.win32_window = None;
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

    // 2. Bundled binary next to executable (or in Resources on macOS)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // macOS: mpv.app is bundled in Contents/Resources/
            #[cfg(target_os = "macos")]
            {
                let resources_mpv = dir
                    .join("../Resources/mpv.app/Contents/MacOS/mpv");
                if resources_mpv.exists() {
                    return Ok(resources_mpv.to_string_lossy().into_owned());
                }
            }

            #[cfg(windows)]
            let bundled = dir.join("mpv.exe");
            #[cfg(not(windows))]
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

    #[cfg(target_os = "linux")]
    let install_hint = "Install it with: sudo apt install mpv (Debian/Ubuntu) or sudo dnf install mpv (Fedora)";
    #[cfg(target_os = "macos")]
    let install_hint = "Install it with: brew install mpv";
    #[cfg(target_os = "windows")]
    let install_hint = "Install it with: scoop install mpv (or winget install mpv)";
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    let install_hint = "Install mpv from https://mpv.io";

    Err(format!(
        "mpv not found. Video playback requires mpv to be installed.\n{install_hint}\n\
         Or set SHOWBIZ_MPV_PATH to the path of the mpv binary."
    ))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn controller_new_is_not_running() {
        let ctrl = MpvController::new();
        assert!(!ctrl.is_running());
    }

    #[test]
    fn controller_stop_without_start_is_safe() {
        let mut ctrl = MpvController::new();
        ctrl.stop(); // should not panic
        assert!(!ctrl.is_running());
    }

    #[test]
    fn controller_send_without_ipc_returns_error() {
        let ctrl = MpvController::new();
        let result = ctrl.load_file("/tmp/test.mp4");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("IPC not initialized"));
    }

    #[test]
    fn controller_get_position_without_ipc_returns_error() {
        let ctrl = MpvController::new();
        let result = ctrl.get_position();
        assert!(result.is_err());
    }

    #[test]
    fn controller_double_stop_is_safe() {
        let mut ctrl = MpvController::new();
        ctrl.stop();
        ctrl.stop();
        assert!(!ctrl.is_running());
    }

    #[test]
    fn controller_hide_show_without_start_is_safe() {
        let ctrl = MpvController::new();
        ctrl.hide(); // no-op, should not panic
        ctrl.show(); // no-op, should not panic
    }

    #[test]
    fn controller_update_geometry_without_start_is_safe() {
        let ctrl = MpvController::new();
        ctrl.update_geometry(0, 0, 640, 480); // no-op, should not panic
    }

    #[test]
    fn find_mpv_binary_with_env_override() {
        // Create a temp file to act as our "mpv binary"
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let path = tmp.path().to_string_lossy().to_string();

        // Set the env var and verify it's found
        std::env::set_var("SHOWBIZ_MPV_PATH", &path);
        let result = find_mpv_binary();
        std::env::remove_var("SHOWBIZ_MPV_PATH");

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), path);
    }

    #[test]
    fn find_mpv_binary_env_override_nonexistent_falls_through() {
        std::env::set_var("SHOWBIZ_MPV_PATH", "/nonexistent/path/to/mpv");
        let result = find_mpv_binary();
        std::env::remove_var("SHOWBIZ_MPV_PATH");

        // Should fall through to other methods (may succeed or fail depending on system)
        // but should NOT return the nonexistent path
        if let Ok(path) = &result {
            assert_ne!(path, "/nonexistent/path/to/mpv");
        }
    }

    #[cfg(unix)]
    #[test]
    fn unix_ipc_socket_path_contains_pid() {
        let ipc = ipc::UnixSocketIpc::new();
        let arg = ipc.socket_arg();
        assert!(arg.contains(&std::process::id().to_string()));
        assert!(arg.contains("showbiz-mpv"));
    }
}
