export type UpdateState =
  | "idle" | "checking" | "current" | "available" | "downloading"
  | "downloaded" | "installing" | "unavailable" | "failed";

export interface UpdateStatus {
  state: UpdateState;
  installed_version: string;
  available_version: string | null;
  release_notes: string;
  release_url: string;
  last_checked_at: string | null;
  percent: number | null;
  error: string | null;
  unavailable_reason: string | null;
}
