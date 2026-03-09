#![cfg(target_os = "macos")]

use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::{Path, PathBuf};

// mpv format constants
const MPV_FORMAT_INT64: c_int = 4;
const MPV_FORMAT_DOUBLE: c_int = 5;

// mpv render param type constants
const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
const MPV_RENDER_PARAM_OPENGL_INIT_PARAMS: c_int = 2;
const MPV_RENDER_PARAM_OPENGL_FBO: c_int = 3;
const MPV_RENDER_PARAM_FLIP_Y: c_int = 4;
const MPV_RENDER_PARAM_INVALID: c_int = 0;

/// String constant for OpenGL render API type
const MPV_RENDER_API_TYPE_OPENGL: &[u8] = b"opengl\0";

/// mpv_render_param: { type: c_int, data: *mut c_void }
#[repr(C)]
struct MpvRenderParam {
    param_type: c_int,
    data: *mut c_void,
}

/// mpv_opengl_init_params: { get_proc_address, get_proc_address_ctx }
#[repr(C)]
struct MpvOpenGLInitParams {
    get_proc_address:
        Option<unsafe extern "C" fn(ctx: *mut c_void, name: *const c_char) -> *mut c_void>,
    get_proc_address_ctx: *mut c_void,
}

/// mpv_opengl_fbo: { fbo, w, h, internal_format }
#[repr(C)]
struct MpvOpenGLFbo {
    fbo: c_int,
    w: c_int,
    h: c_int,
    internal_format: c_int,
}

type MpvCreateFn = unsafe extern "C" fn() -> *mut c_void;
type MpvInitializeFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type MpvTerminateDestroyFn = unsafe extern "C" fn(*mut c_void);
type MpvSetOptionFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type MpvSetOptionStringFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvCommandFn = unsafe extern "C" fn(*mut c_void, *const *const c_char) -> c_int;
type MpvSetPropertyStringFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvGetPropertyFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type MpvErrorStringFn = unsafe extern "C" fn(c_int) -> *const c_char;

// Render API function types
type MpvRenderContextCreateFn =
    unsafe extern "C" fn(*mut *mut c_void, *mut c_void, *mut MpvRenderParam) -> c_int;
type MpvRenderContextRenderFn = unsafe extern "C" fn(*mut c_void, *mut MpvRenderParam) -> c_int;
type MpvRenderContextFreeFn = unsafe extern "C" fn(*mut c_void);
type MpvRenderContextSetUpdateCallbackFn =
    unsafe extern "C" fn(*mut c_void, Option<unsafe extern "C" fn(*mut c_void)>, *mut c_void);
type MpvRenderContextUpdateFn = unsafe extern "C" fn(*mut c_void) -> u64;

pub struct LibMpv {
    _lib: libloading::Library,
    mpv_create: MpvCreateFn,
    mpv_initialize: MpvInitializeFn,
    mpv_terminate_destroy: MpvTerminateDestroyFn,
    mpv_set_option: MpvSetOptionFn,
    mpv_set_option_string: MpvSetOptionStringFn,
    mpv_command: MpvCommandFn,
    mpv_set_property_string: MpvSetPropertyStringFn,
    mpv_get_property: MpvGetPropertyFn,
    mpv_error_string: MpvErrorStringFn,
    // Render API
    mpv_render_context_create: MpvRenderContextCreateFn,
    mpv_render_context_render: MpvRenderContextRenderFn,
    mpv_render_context_free: MpvRenderContextFreeFn,
    mpv_render_context_set_update_callback: MpvRenderContextSetUpdateCallbackFn,
    mpv_render_context_update: MpvRenderContextUpdateFn,
}

impl LibMpv {
    pub fn load(path: &Path) -> Result<Self, String> {
        unsafe {
            let lib = libloading::Library::new(path)
                .map_err(|e| format!("Failed to load libmpv from {}: {e}", path.display()))?;

            let mpv_create: MpvCreateFn = *lib
                .get(b"mpv_create\0")
                .map_err(|e| format!("mpv_create: {e}"))?;
            let mpv_initialize: MpvInitializeFn = *lib
                .get(b"mpv_initialize\0")
                .map_err(|e| format!("mpv_initialize: {e}"))?;
            let mpv_terminate_destroy: MpvTerminateDestroyFn = *lib
                .get(b"mpv_terminate_destroy\0")
                .map_err(|e| format!("mpv_terminate_destroy: {e}"))?;
            let mpv_set_option: MpvSetOptionFn = *lib
                .get(b"mpv_set_option\0")
                .map_err(|e| format!("mpv_set_option: {e}"))?;
            let mpv_set_option_string: MpvSetOptionStringFn = *lib
                .get(b"mpv_set_option_string\0")
                .map_err(|e| format!("mpv_set_option_string: {e}"))?;
            let mpv_command: MpvCommandFn = *lib
                .get(b"mpv_command\0")
                .map_err(|e| format!("mpv_command: {e}"))?;
            let mpv_set_property_string: MpvSetPropertyStringFn = *lib
                .get(b"mpv_set_property_string\0")
                .map_err(|e| format!("mpv_set_property_string: {e}"))?;
            let mpv_get_property: MpvGetPropertyFn = *lib
                .get(b"mpv_get_property\0")
                .map_err(|e| format!("mpv_get_property: {e}"))?;
            let mpv_error_string: MpvErrorStringFn = *lib
                .get(b"mpv_error_string\0")
                .map_err(|e| format!("mpv_error_string: {e}"))?;

            // Render API symbols
            let mpv_render_context_create: MpvRenderContextCreateFn = *lib
                .get(b"mpv_render_context_create\0")
                .map_err(|e| format!("mpv_render_context_create: {e}"))?;
            let mpv_render_context_render: MpvRenderContextRenderFn = *lib
                .get(b"mpv_render_context_render\0")
                .map_err(|e| format!("mpv_render_context_render: {e}"))?;
            let mpv_render_context_free: MpvRenderContextFreeFn = *lib
                .get(b"mpv_render_context_free\0")
                .map_err(|e| format!("mpv_render_context_free: {e}"))?;
            let mpv_render_context_set_update_callback: MpvRenderContextSetUpdateCallbackFn = *lib
                .get(b"mpv_render_context_set_update_callback\0")
                .map_err(|e| format!("mpv_render_context_set_update_callback: {e}"))?;
            let mpv_render_context_update: MpvRenderContextUpdateFn = *lib
                .get(b"mpv_render_context_update\0")
                .map_err(|e| format!("mpv_render_context_update: {e}"))?;

            Ok(Self {
                _lib: lib,
                mpv_create,
                mpv_initialize,
                mpv_terminate_destroy,
                mpv_set_option,
                mpv_set_option_string,
                mpv_command,
                mpv_set_property_string,
                mpv_get_property,
                mpv_error_string,
                mpv_render_context_create,
                mpv_render_context_render,
                mpv_render_context_free,
                mpv_render_context_set_update_callback,
                mpv_render_context_update,
            })
        }
    }

    fn error_string(&self, code: c_int) -> String {
        unsafe {
            let ptr = (self.mpv_error_string)(code);
            if ptr.is_null() {
                return format!("mpv error {code}");
            }
            CStr::from_ptr(ptr).to_string_lossy().into_owned()
        }
    }
}

/// CoreFoundation-based get_proc_address for OpenGL symbols on macOS.
/// This matches the official mpv cocoa-rendergl example.
unsafe extern "C" fn get_proc_address(_ctx: *mut c_void, name: *const c_char) -> *mut c_void {
    // CFStringCreateWithCString
    extern "C" {
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            c_str: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        fn CFRelease(cf: *const c_void);
        fn CFBundleGetBundleWithIdentifier(bundle_id: *const c_void) -> *const c_void;
        fn CFBundleGetFunctionPointerForName(
            bundle: *const c_void,
            function_name: *const c_void,
        ) -> *mut c_void;
    }

    const K_CF_STRING_ENCODING_ASCII: u32 = 0x0600;

    let symbol_name = CFStringCreateWithCString(std::ptr::null(), name, K_CF_STRING_ENCODING_ASCII);
    if symbol_name.is_null() {
        return std::ptr::null_mut();
    }

    // Get the com.apple.opengl framework bundle
    let bundle_id_str = b"com.apple.opengl\0";
    let bundle_id = CFStringCreateWithCString(
        std::ptr::null(),
        bundle_id_str.as_ptr() as *const c_char,
        K_CF_STRING_ENCODING_ASCII,
    );
    let bundle = CFBundleGetBundleWithIdentifier(bundle_id);
    CFRelease(bundle_id);

    let addr = if !bundle.is_null() {
        CFBundleGetFunctionPointerForName(bundle, symbol_name)
    } else {
        std::ptr::null_mut()
    };

    CFRelease(symbol_name);
    addr
}

/// Data shared between the mpv update callback and the render path.
/// The callback runs on an arbitrary mpv thread, so we store raw pointers
/// and dispatch to the main thread for actual GL work.
pub struct RenderCallbackData {
    /// Pointer to the NSOpenGLContext (retained elsewhere in MacosView)
    pub gl_context: *mut c_void,
    /// Pointer to the mpv_render_context
    pub render_ctx: *mut c_void,
    /// Pointer to the NSOpenGLView for getting bounds
    pub gl_view: *mut c_void,
    /// Pointer to the LibMpv (for calling render functions)
    pub lib: *const LibMpv,
}

unsafe impl Send for RenderCallbackData {}
unsafe impl Sync for RenderCallbackData {}

/// The mpv update callback. Called on an arbitrary mpv thread when a new
/// frame is available. We dispatch to the main thread to do the actual
/// GL rendering.
unsafe extern "C" fn mpv_render_update_callback(ctx: *mut c_void) {
    let data = &*(ctx as *const RenderCallbackData);

    // Copy the raw pointers we need for the closure
    let gl_context = data.gl_context;
    let render_ctx = data.render_ctx;
    let gl_view = data.gl_view;
    let lib = data.lib;

    // Dispatch rendering to the main thread (like the official example)
    extern "C" {
        fn dispatch_async_f(
            queue: *const c_void,
            context: *mut c_void,
            work: unsafe extern "C" fn(*mut c_void),
        );
        fn dispatch_get_main_queue() -> *const c_void;
    }

    // Pack our pointers into a heap-allocated struct for the dispatch
    #[repr(C)]
    struct RenderWork {
        gl_context: *mut c_void,
        render_ctx: *mut c_void,
        gl_view: *mut c_void,
        lib: *const LibMpv,
    }

    let work = Box::into_raw(Box::new(RenderWork {
        gl_context,
        render_ctx,
        gl_view,
        lib,
    }));

    unsafe extern "C" fn do_render(ctx: *mut c_void) {
        let work = Box::from_raw(ctx as *mut RenderWork);

        if work.render_ctx.is_null() || work.gl_context.is_null() {
            return;
        }

        // Make the GL context current
        // NSOpenGLContext -makeCurrentContext
        let _: () = objc2::msg_send![
            work.gl_context as *const objc2::runtime::AnyObject,
            makeCurrentContext
        ];

        // Call mpv_render_context_update to acknowledge the callback
        let lib = &*work.lib;
        (lib.mpv_render_context_update)(work.render_ctx);

        // Get the view bounds for the FBO dimensions
        // NSView -bounds returns NSRect
        let bounds: objc2_foundation::NSRect = objc2::msg_send![
            work.gl_view as *const objc2::runtime::AnyObject,
            bounds
        ];

        let mut fbo = MpvOpenGLFbo {
            fbo: 0,
            w: bounds.size.width as c_int,
            h: bounds.size.height as c_int,
            internal_format: 0,
        };

        let mut flip_y: c_int = 1;

        let mut params = [
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_OPENGL_FBO,
                data: &mut fbo as *mut MpvOpenGLFbo as *mut c_void,
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_FLIP_Y,
                data: &mut flip_y as *mut c_int as *mut c_void,
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_INVALID,
                data: std::ptr::null_mut(),
            },
        ];

        (lib.mpv_render_context_render)(work.render_ctx, params.as_mut_ptr());

        // Flush the buffer: NSOpenGLContext -flushBuffer
        let _: () = objc2::msg_send![
            work.gl_context as *const objc2::runtime::AnyObject,
            flushBuffer
        ];
    }

    dispatch_async_f(dispatch_get_main_queue(), work as *mut c_void, do_render);
}

pub struct MpvInstance {
    lib: LibMpv,
    handle: *mut c_void,
    render_ctx: *mut c_void,
    /// Leaked Box that lives as long as the render context
    _callback_data: *mut RenderCallbackData,
}

// Safety: mpv handle is thread-safe per mpv docs, and we access behind Mutex
unsafe impl Send for MpvInstance {}

impl MpvInstance {
    /// Create and initialize mpv with the render API on a background thread.
    /// The gl_context and gl_view pointers must be valid NSOpenGLContext/NSOpenGLView.
    pub fn new(
        lib: LibMpv,
        gl_context: *mut c_void,
        gl_view: *mut c_void,
    ) -> Result<Self, String> {
        let (tx, rx) = std::sync::mpsc::channel();

        // The gl_context and gl_view pointers are Send-safe (raw pointers used behind mutex)
        let gl_context_val = gl_context as usize;
        let gl_view_val = gl_view as usize;

        std::thread::spawn(move || {
            let result =
                Self::init_on_thread(lib, gl_context_val as *mut c_void, gl_view_val as *mut c_void);
            let _ = tx.send(result);
        });

        rx.recv().map_err(|e| format!("mpv init thread died: {e}"))?
    }

    fn init_on_thread(
        lib: LibMpv,
        gl_context: *mut c_void,
        gl_view: *mut c_void,
    ) -> Result<Self, String> {
        unsafe {
            let handle = (lib.mpv_create)();
            if handle.is_null() {
                return Err("mpv_create returned null".into());
            }

            let log_path = std::env::temp_dir()
                .join(format!("showbiz-mpv-{}.log", std::process::id()));

            let string_options = [
                ("idle", "yes"),
                ("keep-open", "yes"),
                ("log-file", &log_path.display().to_string()),
                ("msg-level", "all=v"),
            ];

            for (key, value) in &string_options {
                let k = CString::new(*key).unwrap();
                let v = CString::new(*value).unwrap();
                let rc = (lib.mpv_set_option_string)(handle, k.as_ptr(), v.as_ptr());
                if rc < 0 {
                    let err = lib.error_string(rc);
                    (lib.mpv_terminate_destroy)(handle);
                    return Err(format!("mpv_set_option_string({key}={value}): {err}"));
                }
            }

            // These require Lua support; skip silently if unavailable
            for (key, value) in &[("osc", "no"), ("osd-level", "0")] {
                let k = CString::new(*key).unwrap();
                let v = CString::new(*value).unwrap();
                let _ = (lib.mpv_set_option_string)(handle, k.as_ptr(), v.as_ptr());
            }

            let rc = (lib.mpv_initialize)(handle);
            if rc < 0 {
                let err = lib.error_string(rc);
                (lib.mpv_terminate_destroy)(handle);
                return Err(format!("mpv_initialize failed: {err}"));
            }

            // Set vo=libmpv (must be set after mpv_initialize per mpv docs,
            // but the official example sets it after init too)
            let vo_key = CString::new("vo").unwrap();
            let vo_val = CString::new("libmpv").unwrap();
            let rc = (lib.mpv_set_option_string)(handle, vo_key.as_ptr(), vo_val.as_ptr());
            if rc < 0 {
                let err = lib.error_string(rc);
                eprintln!("[showbiz-mpv] warning: vo=libmpv failed: {err} (trying anyway)");
            }

            // Create OpenGL init params with our get_proc_address
            let mut gl_init_params = MpvOpenGLInitParams {
                get_proc_address: Some(get_proc_address),
                get_proc_address_ctx: std::ptr::null_mut(),
            };

            let mut render_params = [
                MpvRenderParam {
                    param_type: MPV_RENDER_PARAM_API_TYPE,
                    data: MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void,
                },
                MpvRenderParam {
                    param_type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
                    data: &mut gl_init_params as *mut MpvOpenGLInitParams as *mut c_void,
                },
                MpvRenderParam {
                    param_type: MPV_RENDER_PARAM_INVALID,
                    data: std::ptr::null_mut(),
                },
            ];

            let mut render_ctx: *mut c_void = std::ptr::null_mut();
            let rc = (lib.mpv_render_context_create)(
                &mut render_ctx,
                handle,
                render_params.as_mut_ptr(),
            );
            if rc < 0 {
                let err = lib.error_string(rc);
                (lib.mpv_terminate_destroy)(handle);
                return Err(format!("mpv_render_context_create failed: {err}"));
            }

            // Set up the update callback
            let callback_data = Box::into_raw(Box::new(RenderCallbackData {
                gl_context,
                render_ctx,
                gl_view,
                lib: std::ptr::null(), // will be set after Self is created
            }));

            Ok(Self {
                lib,
                handle,
                render_ctx,
                _callback_data: callback_data,
            })
        }
    }

    /// Finalize the render callback setup. Must be called after new() returns,
    /// because the callback data needs a pointer to the LibMpv inside Self.
    pub fn setup_render_callback(&self) {
        unsafe {
            // Update the lib pointer in the callback data
            let data = &mut *self._callback_data;
            data.lib = &self.lib as *const LibMpv;

            (self.lib.mpv_render_context_set_update_callback)(
                self.render_ctx,
                Some(mpv_render_update_callback),
                self._callback_data as *mut c_void,
            );
        }
    }

    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        let c_args: Vec<CString> = args
            .iter()
            .map(|s| CString::new(*s).unwrap())
            .collect();
        let mut ptrs: Vec<*const c_char> = c_args.iter().map(|s| s.as_ptr()).collect();
        ptrs.push(std::ptr::null());

        unsafe {
            let rc = (self.lib.mpv_command)(self.handle, ptrs.as_ptr());
            if rc < 0 {
                return Err(format!(
                    "mpv_command({:?}): {}",
                    args,
                    self.lib.error_string(rc)
                ));
            }
        }
        Ok(())
    }

    pub fn set_property_string(&self, name: &str, value: &str) -> Result<(), String> {
        let n = CString::new(name).unwrap();
        let v = CString::new(value).unwrap();
        unsafe {
            let rc = (self.lib.mpv_set_property_string)(self.handle, n.as_ptr(), v.as_ptr());
            if rc < 0 {
                return Err(format!(
                    "mpv_set_property_string({name}={value}): {}",
                    self.lib.error_string(rc)
                ));
            }
        }
        Ok(())
    }

    pub fn get_property_double(&self, name: &str) -> Result<f64, String> {
        let n = CString::new(name).unwrap();
        let mut value: f64 = 0.0;
        unsafe {
            let rc = (self.lib.mpv_get_property)(
                self.handle,
                n.as_ptr(),
                MPV_FORMAT_DOUBLE,
                &mut value as *mut f64 as *mut c_void,
            );
            if rc < 0 {
                return Err(format!(
                    "mpv_get_property({name}): {}",
                    self.lib.error_string(rc)
                ));
            }
        }
        Ok(value)
    }
}

impl Drop for MpvInstance {
    fn drop(&mut self) {
        unsafe {
            // Free render context BEFORE mpv_terminate_destroy (required by mpv docs)
            if !self.render_ctx.is_null() {
                // Unset the callback first to prevent further dispatches
                (self.lib.mpv_render_context_set_update_callback)(
                    self.render_ctx,
                    None,
                    std::ptr::null_mut(),
                );
                (self.lib.mpv_render_context_free)(self.render_ctx);
                self.render_ctx = std::ptr::null_mut();
            }
            // Free the callback data
            if !self._callback_data.is_null() {
                let _ = Box::from_raw(self._callback_data);
                self._callback_data = std::ptr::null_mut();
            }
            (self.lib.mpv_terminate_destroy)(self.handle);
        }
    }
}

/// Find the bundled or system-installed libmpv.dylib.
pub fn find_libmpv_dylib() -> Result<PathBuf, String> {
    // 1. Bundled in Contents/Resources/mpv-macos/lib/
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let lib_dir = dir.join("../Resources/mpv-macos/lib");
            if lib_dir.exists() {
                // Prefer versioned dylib
                for name in &["libmpv.2.dylib", "libmpv.dylib"] {
                    let path = lib_dir.join(name);
                    if path.exists() {
                        return Ok(path);
                    }
                }
            }
        }
    }

    // 2. Homebrew / system fallback (dev machines)
    for dir in &["/opt/homebrew/lib", "/usr/local/lib"] {
        let lib_dir = Path::new(dir);
        for name in &["libmpv.2.dylib", "libmpv.dylib"] {
            let path = lib_dir.join(name);
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Err(
        "libmpv.dylib not found. Checked bundled Resources/mpv-macos/lib/ \
         and /opt/homebrew/lib/, /usr/local/lib/. \
         Install mpv with: brew install mpv"
            .into(),
    )
}
