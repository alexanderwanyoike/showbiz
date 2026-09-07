export type ActiveWork = "export" | "generation" | "saving";
export type UnsavedWork = "credentials" | "draft";
export type ShutdownIntent = "install" | "quit";
export interface ApplicationWorkStatus {
  active: ActiveWork[];
  unsaved: UnsavedWork[];
  closing: boolean;
}
export const WORK_LABELS = {
  export: "video export", generation: "image or video generation", saving: "saving work",
  credentials: "unsaved provider keys", draft: "unsaved edits",
} as const;
