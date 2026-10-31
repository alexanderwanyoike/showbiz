export const MATERIALS = [
  { id: "native", name: "Showbiz native", detail: "The original muted Showbiz surfaces." },
  { id: "aluminium", name: "Aluminium", detail: "Brushed metal and cool neutral panels." },
  { id: "ceramic", name: "Ceramic", detail: "Soft surfaces with a little warmth." },
  { id: "slate", name: "Slate", detail: "Quiet blue-grey framing." },
  { id: "graphite", name: "Graphite", detail: "Matte greys and understated contrast." },
  { id: "paper", name: "Warm paper", detail: "Cream and soft charcoal tones." },
  { id: "copper", name: "Copper", detail: "Warm metal and earthy panels." },
  { id: "carbon", name: "Carbon", detail: "Black framing and charcoal surfaces." },
] as const;
export const ACCENTS = [
  { id: "native", name: "Showbiz blue", color: "#94a6b8" },
  { id: "cobalt", name: "Cobalt", color: "#94b8e5" },
  { id: "sage", name: "Sage", color: "#a6c8ad" },
  { id: "copper", name: "Copper", color: "#e0a48d" },
  { id: "plum", name: "Plum", color: "#c6a5c4" },
  { id: "amber", name: "Amber", color: "#dcc08b" },
] as const;
export interface Appearance {
  material: (typeof MATERIALS)[number]["id"];
  accent: (typeof ACCENTS)[number]["id"];
}
export const DEFAULT_APPEARANCE: Appearance = { material: "native", accent: "native" };
type PreferenceResult<T> = { ok: true; value: T } | { ok: false; error: string };
const key = "showbiz-appearance";
export function readAppearance(): PreferenceResult<Appearance> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ok: true, value: DEFAULT_APPEARANCE };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("material" in parsed) || !("accent" in parsed)) {
      return { ok: false, error: "Saved appearance settings are invalid. Choose an appearance to replace them." };
    }
    const material = MATERIALS.find((item) => item.id === parsed.material)?.id;
    const accent = ACCENTS.find((item) => item.id === parsed.accent)?.id;
    return material && accent ? { ok: true, value: { material, accent } } : { ok: false, error: "Saved appearance settings are no longer supported." };
  } catch {
    return { ok: false, error: "Appearance settings could not be read from local storage." };
  }
}
export function applyAppearance(value: Appearance) {
  document.documentElement.dataset.material = value.material;
  document.documentElement.dataset.accent = value.accent;
}
export function saveAppearance(value: Appearance): PreferenceResult<Appearance> {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    applyAppearance(value);
    return { ok: true, value };
  } catch {
    return { ok: false, error: "Appearance settings could not be saved. Your previous appearance is still active." };
  }
}
