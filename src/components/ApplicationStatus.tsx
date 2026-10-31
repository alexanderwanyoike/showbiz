import { CircleCheck, Loader2 } from "lucide-react";
import { useApplicationWork } from "../hooks/useApplicationWork";
import { version } from "../../package.json";
export function ApplicationStatus() {
  const work = useApplicationWork();
  const active = work.active.length > 0;
  return <footer className="desktop-statusbar" aria-label="Application status"><span>{active ? <Loader2 size={12} className="animate-spin" /> : <CircleCheck size={12} />}{active ? work.active.join(" · ") : work.unsaved.length ? "Unsaved changes" : "Ready"}</span><span>Showbiz <span className="status-version">{version}</span></span><span>Bible & storyboard workspace</span></footer>;
}
