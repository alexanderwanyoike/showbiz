import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import png2icons from "png2icons";

// Follows Auto Digger's MIT sharp/png2icons pipeline, copyright 2026 Alexander Wanyoike.
/** @returns {Promise<import("../shared/result.ts").Result<null>>} */
async function generateIcons(root, checking) {
  try {
    const source = await readFile(path.join(root, "public/icon.svg"));
    const png = await sharp(source).resize(1024, 1024).png().toBuffer();
    const ico = png2icons.createICO(png, png2icons.BICUBIC, 0, true, true);
    const icns = png2icons.createICNS(png, png2icons.BICUBIC, 0);
    if (!ico || !icns)
      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Native icon conversion failed." },
      };
    const [favicon, touchIcon] = await Promise.all(
      [256, 180].map((size) =>
        sharp(source).resize(size, size).png().toBuffer(),
      ),
    );
    const outputs = [
      { name: "build/icons/icon.png", buffer: png },
      { name: "build/icons/icon.ico", buffer: ico },
      { name: "build/icons/icon.icns", buffer: icns },
      { name: "public/icon.png", buffer: png },
      { name: "site/favicon.png", buffer: favicon },
      { name: "site/apple-touch-icon.png", buffer: touchIcon },
    ];
    for (const output of outputs) {
      const file = path.join(root, output.name);
      if (checking) {
        let current;
        try {
          current = await readFile(file);
        } catch (cause) {
          if (
            !cause ||
            typeof cause !== "object" ||
            !("code" in cause) ||
            cause.code !== "ENOENT"
          )
            throw cause;
        }
        if (!current || !output.buffer.equals(current))
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: `App icons are stale (${output.name}). Run yarn icons:generate and commit the outputs.`,
            },
          };
      } else {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, output.buffer);
      }
    }
    return { ok: true, value: null };
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: "IO_ERROR",
        message: `App icons could not be generated or checked: ${cause instanceof Error ? cause.message : String(cause)}. Run yarn icons:generate from the repository root.`,
      },
    };
  }
}

const result = await generateIcons(
  process.cwd(),
  process.argv.includes("--check"),
);
if (!result.ok) {
  process.stderr.write(`${result.error.message}\n`);
  process.exitCode = 1;
}
