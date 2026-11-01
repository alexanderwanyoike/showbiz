import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  link,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { Result } from "../shared/result";

export interface LinuxDesktopIntegrationOptions {
  platform: NodeJS.Platform;
  packaged: boolean;
  appImage?: string | undefined;
  dataHome?: string | undefined;
  home: string;
  icon: string;
}

const managedKey = "X-Showbiz-AppImage-Integration";

function desktopString(value: string): string {
  return value.replaceAll("\\", "\\\\");
}

function executable(value: string): string {
  const quoted = value.replace(/[\\"`$]/g, (character) => `\\${character}`);
  return `"${desktopString(quoted).replaceAll("%", "%%")}"`;
}

function managedEntry(value: string): boolean {
  let section = "";
  let managed = false;
  for (const raw of value.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) section = line;
    if (section !== "[Desktop Entry]" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0 && line.slice(0, separator).trim() === managedKey)
      managed = line.slice(separator + 1).trim() === "true";
  }
  return managed;
}

function storageFailure(cause: unknown): Result<null> {
  return {
    ok: false,
    error: {
      code: "IO_ERROR",
      message: `Could not add Showbiz to the application menu: ${cause instanceof Error ? cause.message : String(cause)}`,
    },
  };
}

export async function integrateLinuxDesktop(
  options: LinuxDesktopIntegrationOptions,
): Promise<Result<null>> {
  const { appImage } = options;
  if (options.platform !== "linux" || !options.packaged || !appImage)
    return { ok: true, value: null };
  const dataHome =
    options.dataHome && path.isAbsolute(options.dataHome)
      ? options.dataHome
      : path.join(options.home, ".local/share");
  if (
    appImage.includes("=") ||
    ![appImage, dataHome, options.icon].every(
      (value) => path.isAbsolute(value) && !/[\u0000-\u001f\u007f]/.test(value),
    )
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "The AppImage, icon and menu locations must be absolute paths without control characters. The AppImage path cannot contain an equals sign.",
      },
    };
  }
  const applications = path.join(dataHome, "applications");
  const icons = path.join(dataHome, "icons");
  const entry = path.join(applications, "showbiz.desktop");
  const icon = path.join(icons, "showbiz-appimage.png");
  const token = randomUUID();
  const temporaryEntry = path.join(applications, `.showbiz-${token}.tmp`);
  const temporaryIcon = path.join(icons, `.showbiz-${token}.tmp`);
  let result: Result<null> = { ok: true, value: null };
  try {
    let existing: string | null;
    try {
      existing = await readFile(entry, "utf8");
    } catch (cause) {
      if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT"))
        throw cause;
      existing = null;
    }
    if (existing !== null && !managedEntry(existing)) return result;
    if (!(await stat(appImage)).isFile())
      throw new Error("The AppImage location is not a file.");
    await Promise.all([
      mkdir(applications, { recursive: true, mode: 0o700 }),
      mkdir(icons, { recursive: true, mode: 0o700 }),
    ]);
    await copyFile(options.icon, temporaryIcon, constants.COPYFILE_EXCL);
    await writeFile(
      temporaryEntry,
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Showbiz",
        "Comment=AI video storyboard desktop application",
        // GLib checks the executable before expanding literal percent escapes.
        `Exec=env -- ${executable(appImage)} %U`,
        `Icon=${desktopString(icon)}`,
        "Terminal=false",
        "StartupWMClass=showbiz",
        "Categories=AudioVideo;",
        "MimeType=application/x-showbiz-project;",
        `${managedKey}=true`,
        "",
      ].join("\n"),
      { flag: "wx", mode: 0o644 },
    );
    await rename(temporaryIcon, icon);
    if (existing !== null) await rename(temporaryEntry, entry);
    else {
      try {
        await link(temporaryEntry, entry);
      } catch (cause) {
        if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST"))
          throw cause;
      }
    }
  } catch (cause) {
    result = storageFailure(cause);
  }
  for (const temporary of [temporaryEntry, temporaryIcon]) {
    try {
      await rm(temporary, { force: true });
    } catch (cause) {
      if (result.ok) result = storageFailure(cause);
    }
  }
  return result;
}
