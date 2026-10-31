import iconSource from "../../public/icon.svg?raw";

function readDefinitions(source: string): string {
  const definitions = source.match(/<defs\b[^>]*>([\s\S]*?)<\/defs>/)?.[1];
  if (!definitions) throw new Error("The Showbiz app icon must include its reusable definitions.");
  return definitions;
}

// The repository-owned SVG stays the sole source; inlining avoids file URL origin restrictions.
const definitions = readDefinitions(iconSource);

export function AppMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 64 64" aria-hidden="true" focusable="false" xmlnsXlink="http://www.w3.org/1999/xlink">
      <defs dangerouslySetInnerHTML={{ __html: definitions }} />
      <use href="#showbiz-mark" />
    </svg>
  );
}
