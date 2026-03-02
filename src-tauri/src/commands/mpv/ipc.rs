use std::time::Duration;

/// Trait for MPV IPC communication.
///
/// Each platform provides its own transport (Unix sockets on Linux/macOS,
/// named pipes on Windows) but the command protocol is the same.
pub trait MpvIpc: Send {
    /// Returns the argument to pass to mpv's `--input-ipc-server=`.
    fn socket_arg(&self) -> String;

    /// Send a JSON command to mpv and return the response.
    fn send_command(&self, cmd: serde_json::Value) -> Result<serde_json::Value, String>;

    /// Wait for the IPC socket to become ready, up to `timeout`.
    fn wait_for_ready(&self, timeout: Duration) -> Result<(), String>;

    /// Clean up the IPC endpoint (remove socket file, etc.).
    fn cleanup(&self);
}

// ─── Unix socket IPC (Linux + macOS) ─────────────────────────────────────────

#[cfg(unix)]
pub struct UnixSocketIpc {
    socket_path: std::path::PathBuf,
}

#[cfg(unix)]
impl UnixSocketIpc {
    pub fn new() -> Self {
        let socket_path =
            std::env::temp_dir().join(format!("showbiz-mpv-{}", std::process::id()));
        Self { socket_path }
    }
}

#[cfg(unix)]
impl MpvIpc for UnixSocketIpc {
    fn socket_arg(&self) -> String {
        self.socket_path.display().to_string()
    }

    fn send_command(&self, cmd: serde_json::Value) -> Result<serde_json::Value, String> {
        use std::io::{BufRead, BufReader, Write};
        use std::os::unix::net::UnixStream;

        let mut stream = UnixStream::connect(&self.socket_path)
            .map_err(|e| format!("mpv IPC connect failed: {e}"))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .ok();

        let msg = format!("{cmd}\n");
        stream
            .write_all(msg.as_bytes())
            .map_err(|e| format!("mpv IPC write: {e}"))?;

        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("mpv IPC read: {e}"))?;

        serde_json::from_str(&line).map_err(|e| format!("mpv IPC parse: {e}"))
    }

    fn wait_for_ready(&self, timeout: Duration) -> Result<(), String> {
        let interval = Duration::from_millis(100);
        let attempts = (timeout.as_millis() / interval.as_millis()).max(1) as u32;

        for _ in 0..attempts {
            if self.socket_path.exists() {
                return Ok(());
            }
            std::thread::sleep(interval);
        }
        Err("mpv IPC socket did not appear within timeout".into())
    }

    fn cleanup(&self) {
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

// ─── Named pipe IPC (Windows) ────────────────────────────────────────────────

#[cfg(windows)]
pub struct NamedPipeIpc {
    pipe_name: String,
}

#[cfg(windows)]
impl NamedPipeIpc {
    pub fn new() -> Self {
        let pipe_name = format!(r"\\.\pipe\showbiz-mpv-{}", std::process::id());
        Self { pipe_name }
    }
}

#[cfg(windows)]
impl MpvIpc for NamedPipeIpc {
    fn socket_arg(&self) -> String {
        self.pipe_name.clone()
    }

    fn send_command(&self, cmd: serde_json::Value) -> Result<serde_json::Value, String> {
        use std::io::{BufRead, BufReader, Write};

        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&self.pipe_name)
            .map_err(|e| format!("mpv IPC connect failed: {e}"))?;

        let msg = format!("{cmd}\n");
        file.write_all(msg.as_bytes())
            .map_err(|e| format!("mpv IPC write: {e}"))?;
        file.flush()
            .map_err(|e| format!("mpv IPC flush: {e}"))?;

        let mut reader = BufReader::new(file);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("mpv IPC read: {e}"))?;

        serde_json::from_str(&line).map_err(|e| format!("mpv IPC parse: {e}"))
    }

    fn wait_for_ready(&self, timeout: Duration) -> Result<(), String> {
        let interval = Duration::from_millis(100);
        let attempts = (timeout.as_millis() / interval.as_millis()).max(1) as u32;

        for _ in 0..attempts {
            if std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&self.pipe_name)
                .is_ok()
            {
                return Ok(());
            }
            std::thread::sleep(interval);
        }
        Err("mpv IPC named pipe did not appear within timeout".into())
    }

    fn cleanup(&self) {
        // mpv cleans up the named pipe on exit
    }
}
