import { useState, type ComponentProps } from "react";
import ProjectBibleView from "../components/ProjectBibleView";
import { DEFAULT_BIBLE_IMAGE_MODEL } from "../lib/bible-assets";
import type { ImageModelId } from "../lib/models";

export default function BibleTestWorkspace(props: Omit<ComponentProps<typeof ProjectBibleView>, "generationModel">) {
  const [value, onChange] = useState<ImageModelId>(DEFAULT_BIBLE_IMAGE_MODEL);
  return <ProjectBibleView {...props} generationModel={{ value, onChange }} />;
}
