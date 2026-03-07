#![cfg(target_os = "macos")]

use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::{Path, PathBuf};

// mpv property format constants
const MPV_FORMAT_DOUBLE: c_int = 5;

type MpvCreateFn = unsafe extern "C" fn() -> *mut c_void;
type MpvInitializeFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type MpvTerminateDestroyFn = unsafe extern "C" fn(*mut c_void);
type MpvSetOptionStringFn = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvCommandFn = unsafe extern "C" fn(*mut c_void, *const *const c_char) -> c_int;
type MpvSetPropertyStringFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvGetPropertyFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type MpvErrorStringFn = unsafe extern "C" fn(c_int) -> *const c_char;

pub struct LibMpv {
    _lib: libloading::Library,
    mpv_create: MpvCreateFn,
    mpv_initialize: MpvInitializeFn,
    mpv_terminate_destroy: MpvTerminateDestroyFn,
    mpv_set_option_string: MpvSetOptionStringFn,
    mpv_command: MpvCommandFn,
    mpv_set_property_string: MpvSetPropertyStringFn,
    mpv_get_property: MpvGetPropertyFn,
    mpv_error_string: MpvErrorStringFn,
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

            Ok(Self {
                _lib: lib,
                mpv_create,
                mpv_initialize,
                mpv_terminate_destroy,
                mpv_set_option_string,
                mpv_command,
                mpv_set_property_string,
                mpv_get_property,
                mpv_error_string,
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

pub struct MpvInstance {
    lib: LibMpv,
    handle: *mut c_void,
}

// Safety: mpv handle is thread-safe per mpv docs, and we access behind Mutex
unsafe impl Send for MpvInstance {}

impl MpvInstance {
    pub fn new(lib: LibMpv, wid: u64) -> Result<Self, String> {
        unsafe {
            let handle = (lib.mpv_create)();
            if handle.is_null() {
                return Err("mpv_create returned null".into());
            }

            let log_path = std::env::temp_dir()
                .join(format!("showbiz-mpv-{}.log", std::process::id()));

            let required_options = [
                ("wid", format!("{wid}")),
                ("idle", "yes".into()),
                ("keep-open", "yes".into()),
                ("vo", "gpu".into()),
                ("log-file", log_path.display().to_string()),
                ("msg-level", "all=v".into()),
            ];

            for (key, value) in &required_options {
                let k = CString::new(*key).unwrap();
                let v = CString::new(value.as_str()).unwrap();
                let rc = (lib.mpv_set_option_string)(handle, k.as_ptr(), v.as_ptr());
                if rc < 0 {
                    let err = lib.error_string(rc);
                    (lib.mpv_terminate_destroy)(handle);
                    return Err(format!("mpv_set_option_string({key}={value}): {err}"));
                }
            }

            // These may require Lua or specific backends; skip if unavailable
            for (key, value) in &[
                ("osc", "no"),
                ("osd-level", "0"),
                ("gpu-context", "cocoa"),
            ] {
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

            Ok(Self { lib, handle })
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
