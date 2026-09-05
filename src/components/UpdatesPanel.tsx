import { Download, ExternalLink, Loader2, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateState } from "../../shared/update-status";
import { updateClient, type UpdateClient } from "../lib/update-client";
import { useUpdates } from "../hooks/useUpdates";

const STATUS_LABEL: Record<UpdateState, string> = {
  idle: "Ready to check", checking: "Checking for updates…", current: "You're up to date",
  available: "An update is available", downloading: "Downloading update…",
  downloaded: "Ready to install", installing: "Installing update…",
  unavailable: "Automatic updates unavailable", failed: "Update could not be completed",
};

export function UpdatesPanel({ client = updateClient }: { client?: UpdateClient }) {
  const { status, error, pending, run } = useUpdates(client);
  const checkingAllowed = status && ["idle", "current", "available", "failed"].includes(status.state);
  const busy = status && ["checking", "downloading", "installing"].includes(status.state);

  return (
    <section className="space-y-5 pb-5" aria-label="Application updates">
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Installed version</p>
            <p className="mt-1 font-mono text-lg font-medium">{status?.installed_version ?? "Loading…"}</p>
          </div>
          <Button size="sm" variant="outline" disabled={!checkingAllowed || pending} onClick={() => void run(client.check)}>
            {status?.state === "checking" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Check for updates
          </Button>
        </div>
        <p role="status" aria-live="polite" className="mt-4 text-sm font-medium">
          {status ? STATUS_LABEL[status.state] : "Loading update status…"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {status?.last_checked_at ? `Last checked ${new Date(status.last_checked_at).toLocaleString()}` : "Not checked yet"}
        </p>
      </div>

      {(error || status?.error) && <p role="alert" className="text-sm text-destructive">{error || status?.error}</p>}
      {status?.unavailable_reason && <p className="text-sm text-muted-foreground">{status.unavailable_reason}</p>}

      {status?.available_version && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">New version</h3>
            <span className="rounded border px-2 py-0.5 font-mono text-xs">{status.available_version}</span>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">Release notes</h4>
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border p-3 text-sm">
              {status.release_notes || "Release notes are available on the GitHub release page."}
            </p>
          </div>
        </div>
      )}

      {status?.state === "downloading" && status.percent !== null && (
        <div className="space-y-1">
          <progress aria-label="Update download progress" className="h-2 w-full accent-primary" max={100} value={status.percent} />
          <p className="text-right font-mono text-xs text-muted-foreground">{Math.round(status.percent)}%</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status?.state === "available" && <Button size="sm" disabled={pending} onClick={() => void run(client.download)}><Download />Download update</Button>}
        {status?.state === "downloaded" && <Button size="sm" disabled={pending} onClick={() => void run(client.install)}><RotateCw />Install and relaunch</Button>}
        <Button size="sm" variant="outline" disabled={pending || !!busy} onClick={() => void run(client.openRelease)}>
          <ExternalLink />{status?.available_version ? "View release / manual download" : "Manual download"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Showbiz checks quietly. You choose when to download and install updates.</p>
    </section>
  );
}
