import fs from "node:fs";

export function lockProjectDocument(file: string): () => void {
  const lock = `${file}.lock`;
  if (fs.existsSync(lock)) {
    const owner = Number(fs.readFileSync(lock, "utf8"));
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("This project has an invalid lock file. Check that it is closed before removing its .lock file.");
    let running = true;
    try { process.kill(owner, 0); }
    catch (cause) {
      if (cause instanceof Error && "code" in cause && cause.code === "ESRCH") running = false;
      else throw cause;
    }
    if (running) throw new Error("This project is already open in Showbiz. Close it in the other instance first.");
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  return () => fs.unlinkSync(lock);
}
