import { execFile, spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import {
  integrateLinuxDesktop,
  type LinuxDesktopIntegrationOptions,
} from "./linux-desktop-integration";
import { projectFileArguments } from "./project-file-opening";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function fixture(filename = "Showbiz.AppImage") {
  const directory = await mkdtemp(path.join(tmpdir(), "showbiz-linux-menu-"));
  directories.push(directory);
  const appImage = path.join(directory, filename);
  const icon = path.join(directory, "source-icon.png");
  await writeFile(appImage, "AppImage fixture", { mode: 0o755 });
  await writeFile(
    icon,
    await readFile(fileURLToPath(new URL("../public/icon.png", import.meta.url))),
  );
  const options: LinuxDesktopIntegrationOptions = {
    platform: "linux",
    packaged: true,
    appImage,
    dataHome: path.join(directory, "user data"),
    home: directory,
    icon,
  };
  return {
    directory,
    options,
    entry: path.join(directory, "user data/applications/showbiz.desktop"),
  };
}

function iconPath(entry: string): string {
  const value = /^Icon=(.+)$/m.exec(entry)?.[1];
  if (!value) throw new Error("The desktop entry must reference its icon.");
  return value.replaceAll("\\\\", "\\");
}

it("registers an AppImage launcher with a durable icon and Showbiz project opening", async () => {
  const { options, entry } = await fixture("Showbiz 1.0.4.AppImage");
  expect(await integrateLinuxDesktop(options)).toEqual({ ok: true, value: null });
  const contents = await readFile(entry, "utf8");
  expect(contents).toContain("[Desktop Entry]");
  expect(contents).toContain("Type=Application");
  expect(contents).toContain("Name=Showbiz");
  expect(contents).toContain("StartupWMClass=showbiz");
  expect(contents).toContain("MimeType=application/x-showbiz-project;");
  expect(contents).toContain(" %U");
  expect(contents).toContain("X-Showbiz-AppImage-Integration=true");
  const copiedIcon = iconPath(contents);
  expect(path.isAbsolute(copiedIcon)).toBe(true);
  expect(copiedIcon.startsWith(path.join(options.dataHome!, "icons") + path.sep))
    .toBe(true);
  expect(copiedIcon).not.toBe(options.icon);
  expect(await readFile(copiedIcon)).toEqual(await readFile(options.icon));
});

it("refreshes its managed launcher when the AppImage moves without adding another entry", async () => {
  const { directory, options, entry } = await fixture();
  await integrateLinuxDesktop(options);
  const firstIcon = iconPath(await readFile(entry, "utf8"));
  const moved = path.join(directory, "Showbiz updated.AppImage");
  await writeFile(moved, "Updated AppImage fixture", { mode: 0o755 });
  expect(await integrateLinuxDesktop({ ...options, appImage: moved })).toEqual({
    ok: true,
    value: null,
  });
  const contents = await readFile(entry, "utf8");
  expect(contents).toContain(moved);
  expect(contents).not.toContain(options.appImage);
  expect(iconPath(contents)).toBe(firstIcon);
  expect(await readdir(path.dirname(entry))).toEqual(["showbiz.desktop"]);
});

it.each([undefined, "", "relative-data"])(
  "uses the XDG default when the configured data home is %s",
  async (dataHome) => {
    const { directory, options } = await fixture();
    expect(await integrateLinuxDesktop({ ...options, dataHome })).toEqual({
      ok: true,
      value: null,
    });
    const entry = await readFile(
      path.join(directory, ".local/share/applications/showbiz.desktop"),
      "utf8",
    );
    expect(entry).toContain("Name=Showbiz");
  },
);

it.each([
  { platform: "linux", packaged: false },
  { platform: "darwin", packaged: true },
  { platform: "win32", packaged: true },
  { platform: "linux", packaged: true, appImage: undefined },
] satisfies Partial<LinuxDesktopIntegrationOptions>[])(
  "does not register development, non-AppImage or other-platform launches: %j",
  async (overrides) => {
    const { directory, options } = await fixture();
    expect(await integrateLinuxDesktop({ ...options, ...overrides })).toEqual({
      ok: true,
      value: null,
    });
    expect((await readdir(directory)).sort()).toEqual([
      "Showbiz.AppImage",
      "source-icon.png",
    ]);
  },
);

it("preserves an existing external launcher and its icon configuration", async () => {
  const { options, entry } = await fixture();
  await mkdir(path.dirname(entry), { recursive: true });
  const external = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=My Showbiz launcher",
    "Exec=/opt/Showbiz/showbiz --custom %U",
    "Icon=/custom/icon.png",
    "StartupWMClass=showbiz",
    "",
  ].join("\n");
  await writeFile(entry, external);
  expect(await integrateLinuxDesktop(options)).toEqual({ ok: true, value: null });
  expect(await readFile(entry, "utf8")).toBe(external);
  expect(await readdir(options.dataHome!)).toEqual(["applications"]);
});

it.each(["relative.AppImage", "/tmp/Showbiz\nExec=bad.AppImage", "/tmp/Showbiz\0.AppImage"])(
  "rejects an invalid AppImage path without creating a shortcut: %j",
  async (appImage) => {
    const { options, entry } = await fixture();
    expect(await integrateLinuxDesktop({ ...options, appImage })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    await expect(readFile(entry)).rejects.toMatchObject({ code: "ENOENT" });
  },
);

it("reports unavailable user data and leaves the obstructing file intact", async () => {
  const { options } = await fixture();
  await writeFile(options.dataHome!, "Keep this file");
  expect(await integrateLinuxDesktop(options)).toMatchObject({
    ok: false,
    error: { code: "IO_ERROR", message: expect.any(String) },
  });
  expect(await readFile(options.dataHome!, "utf8")).toBe("Keep this file");
});

const gioAvailable = process.platform === "linux" &&
  spawnSync("gio", ["version"], { stdio: "ignore" }).status === 0;

it.skipIf(!gioAvailable)(
  "launches the exact AppImage and project through GIO with spaces, quotes and percent characters",
  async () => {
    const { directory, options, entry } = await fixture(
      'Showbiz \'s "portrait" $studio `take` 100%.AppImage',
    );
    const marker = path.join(directory, "launched-arguments");
    const project = path.join(directory, 'A quiet "morning" 100%.showbiz');
    await writeFile(project, "Project fixture");
    await writeFile(
      options.appImage!,
      '#!/bin/sh\nprintf \'%s\\0\' "$0" "$@" > "$SHOWBIZ_LAUNCH_MARKER"\n',
      { mode: 0o755 },
    );
    expect(await integrateLinuxDesktop(options)).toEqual({ ok: true, value: null });
    await promisify(execFile)("gio", ["launch", entry, project], {
      env: { ...process.env, SHOWBIZ_LAUNCH_MARKER: marker },
    });
    await expect.poll(
      () => readFile(marker, "utf8").catch(() => ""),
      { timeout: 5_000 },
    ).not.toBe("");
    const argv = (await readFile(marker, "utf8")).split("\0").filter(Boolean);
    expect(argv[0]).toBe(options.appImage);
    expect(projectFileArguments(argv.slice(1))).toEqual([project]);
  },
);
