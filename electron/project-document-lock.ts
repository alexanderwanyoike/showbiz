import fs from "node:fs";
import { createProcessOwner, parseProcessOwner, processOwnerStatus } from "./process-owner";

export function lockProjectDocument(file: string): () => void {
  const lock = `${file}.lock`;
  if (fs.existsSync(lock)) {
    const raw=fs.readFileSync(lock,"utf8");
    let value: unknown;
    try {value=JSON.parse(raw);} catch {value=null;}
    const owner=parseProcessOwner(value);
    const legacy=Number(raw);
    const status=owner ? processOwnerStatus(owner) : Number.isSafeInteger(legacy) && legacy > 0 ? processOwnerStatus({pid:legacy,identity:null}) : "unknown";
    if(status !== "dead") throw new Error(`This project is already open or its lock cannot be verified at ${lock}. Close other Showbiz instances before removing that lock file.`);
    fs.unlinkSync(lock);
  }
  const owner=createProcessOwner();
  fs.writeFileSync(lock, JSON.stringify(owner), {flag:"wx",mode:0o600});
  return () => {
    const current:unknown=JSON.parse(fs.readFileSync(lock,"utf8"));
    if(parseProcessOwner(current)?.token !== owner.token) throw new Error(`Project lock ownership changed at ${lock}.`);
    fs.unlinkSync(lock);
  };
}
