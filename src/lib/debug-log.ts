/**
 * Dev-only console tap. The WebKitGTK webview exposes no devtools in this
 * environment, so console.warn/error and uncaught errors are mirrored to the
 * vite dev server (/__debuglog -> /tmp/showbiz-console.log) where tooling can
 * read them. Production builds never call install().
 */
export function installDebugLogTap(): void {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (!env?.DEV) return;

  const post = (line: string) => {
    try {
      const payload = `${new Date().toISOString().slice(11, 23)} ${line}`;
      navigator.sendBeacon("/__debuglog", payload);
    } catch {
      // never let logging break the app
    }
  };

  const wrap = (level: "warn" | "error") => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      post(
        `[${level}] ` +
          args
            .map((a) => {
              if (a instanceof Error) return `${a.message}`;
              if (typeof a === "object") {
                try {
                  return JSON.stringify(a);
                } catch {
                  return String(a);
                }
              }
              return String(a);
            })
            .join(" ")
      );
    };
  };

  wrap("warn");
  wrap("error");
  window.addEventListener("error", (e) => post(`[uncaught] ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => post(`[unhandledrejection] ${String(e.reason)}`));
  post("[debug-log] tap installed");
}
