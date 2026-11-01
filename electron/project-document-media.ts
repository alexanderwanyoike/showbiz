import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { initMediaDirs } from "./media-files";
import { resolveMediaPath } from "./media";
import { documentMediaPaths } from "./project-document-copy";

const CHUNK_SIZE = 8 * 1024 * 1024;
const stamp = (file: string) => {
  const stat = fs.statSync(file, { bigint: true });
  return `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
};
export function createDocumentMedia(db: DatabaseSync, directory: string) {
  db.exec(`CREATE TABLE IF NOT EXISTS document_files (path TEXT PRIMARY KEY, size INTEGER NOT NULL CHECK(size >= 0));
    CREATE TABLE IF NOT EXISTS document_file_chunks (path TEXT NOT NULL REFERENCES document_files(path) ON DELETE CASCADE, sequence INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(path, sequence));
    PRAGMA secure_delete = ON;`);
  let stamps = new Map<string, string>();
  function target(relative: unknown): string {
    if (
      typeof relative !== "string" ||
      !relative ||
      relative.includes("\\") ||
      relative.length > 4096
    )
      throw new Error("Invalid embedded media path.");
    return resolveMediaPath(directory, relative);
  }
  function referencedFile(relative: string): string {
    const file = target(relative);
    let current = directory;
    const segments = path.relative(directory, file).split(path.sep);
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      let entry: fs.Stats;
      try {
        entry = fs.lstatSync(current);
      } catch (cause) {
        if (
          cause instanceof Error &&
          "code" in cause &&
          cause.code === "ENOENT"
        )
          throw new Error(
            `The referenced media ${relative} could not be included in the project.`,
          );
        throw cause;
      }
      if (entry.isSymbolicLink())
        throw new Error("Project media cannot contain symbolic links.");
      if (
        index === segments.length - 1 ? !entry.isFile() : !entry.isDirectory()
      )
        throw new Error("Project media must contain regular files.");
    }
    return file;
  }
  return {
    sync() {
      const paths = documentMediaPaths(db);
      const next = new Map<string, string>();
      const remove = db.prepare("DELETE FROM document_files WHERE path = ?");
      const chunk = db.prepare(
        "INSERT INTO document_file_chunks(path,sequence,data) VALUES (?,?,?)",
      );
      for (const relative of paths) {
        const file = referencedFile(relative);
        const fingerprint = stamp(file);
        next.set(relative, fingerprint);
        if (stamps.get(relative) === fingerprint) continue;
        remove.run(relative);
        const size = fs.statSync(file).size;
        if (!Number.isSafeInteger(size))
          throw new Error("Project media is too large.");
        db.prepare("INSERT INTO document_files(path,size) VALUES (?,?)").run(
          relative,
          size,
        );
        const handle = fs.openSync(file, "r");
        try {
          const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, Math.max(size, 1)));
          let position = 0;
          let sequence = 0;
          while (position < size) {
            const count = fs.readSync(
              handle,
              buffer,
              0,
              Math.min(buffer.length, size - position),
              position,
            );
            if (!count)
              throw new Error(
                "Project media changed while it was being saved.",
              );
            chunk.run(relative, sequence++, buffer.subarray(0, count));
            position += count;
          }
          if (stamp(file) !== fingerprint)
            throw new Error("Project media changed while it was being saved.");
        } finally {
          fs.closeSync(handle);
        }
      }
      for (const row of db.prepare("SELECT path FROM document_files").all()) {
        if (typeof row.path !== "string")
          throw new Error("Invalid embedded media path.");
        if (!next.has(row.path)) remove.run(row.path);
      }
      stamps = next;
    },
    restore() {
      fs.rmSync(directory, { recursive: true, force: true });
      initMediaDirs(directory);
      const next = new Map<string, string>();
      for (const row of db
        .prepare("SELECT path,size FROM document_files ORDER BY path")
        .iterate()) {
        const file = target(row.path);
        if (
          typeof row.size !== "number" ||
          !Number.isSafeInteger(row.size) ||
          row.size < 0
        )
          throw new Error("Invalid embedded media size.");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const handle = fs.openSync(file, "wx", 0o600);
        let position = 0;
        let sequence = 0;
        try {
          for (const metadata of db
            .prepare(
              "SELECT sequence,length(data) AS size FROM document_file_chunks WHERE path = ? ORDER BY sequence",
            )
            .iterate(String(row.path))) {
            if (
              metadata.sequence !== sequence ||
              typeof metadata.size !== "number" ||
              metadata.size <= 0 ||
              metadata.size > CHUNK_SIZE ||
              position + metadata.size > row.size
            )
              throw new Error("The project contains damaged media chunks.");
            const part = db
              .prepare(
                "SELECT data FROM document_file_chunks WHERE path = ? AND sequence = ?",
              )
              .get(String(row.path), sequence);
            if (!(part?.data instanceof Uint8Array))
              throw new Error("The project contains an invalid media chunk.");
            let written = 0;
            while (written < part.data.length)
              written += fs.writeSync(
                handle,
                part.data,
                written,
                part.data.length - written,
                position + written,
              );
            position += written;
            sequence++;
          }
          if (position !== row.size)
            throw new Error("The project is missing media data.");
        } finally {
          fs.closeSync(handle);
        }
        next.set(String(row.path), stamp(file));
      }
      stamps = next;
    },
  };
}
