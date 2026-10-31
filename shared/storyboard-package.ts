export interface StoryboardPackage {
  format: "showbiz-storyboard";
  version: 1;
  storyboard: { id: string; name: string };
  shots: {
    id: string;
    order: number;
    duration: number;
    media: { role: "image" | "end_frame" | "video"; path: string }[];
  }[];
}

export interface StoryboardPackageExport {
  save_path: string;
  shot_count: number;
  media_count: number;
}
