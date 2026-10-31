export const MATERIALS = [
  {
    id: "native",
    name: "Showbiz native",
    detail: "Clean neutral surfaces with a vivid Showbiz accent.",
  },
  {
    id: "aluminium",
    name: "Aluminium",
    detail: "Brushed metal and cool neutral panels.",
  },
  {
    id: "ceramic",
    name: "Ceramic",
    detail: "Soft surfaces with a little warmth.",
  },
  { id: "slate", name: "Slate", detail: "Quiet blue-grey framing." },
  {
    id: "graphite",
    name: "Graphite",
    detail: "Matte greys and understated contrast.",
  },
  { id: "paper", name: "Warm paper", detail: "Cream and soft charcoal tones." },
  { id: "copper", name: "Copper", detail: "Warm metal and earthy panels." },
  {
    id: "carbon",
    name: "Carbon",
    detail: "Black framing and charcoal surfaces.",
  },
] as const;
export const ACCENTS = [
  {id:"native",name:"Showbiz blue",color:"#328dff",light:{background:"#0066eb",foreground:"#ffffff"},dark:{background:"#328dff",foreground:"#07101f"}},
  {id:"cobalt",name:"Cobalt",color:"#427eff",light:{background:"#1554ed",foreground:"#ffffff"},dark:{background:"#427eff",foreground:"#07101f"}},
  {id:"sage",name:"Emerald",color:"#00d87b",light:{background:"#008341",foreground:"#ffffff"},dark:{background:"#00d87b",foreground:"#062117"}},
  {id:"copper",name:"Vermilion",color:"#ff701f",light:{background:"#bf400b",foreground:"#ffffff"},dark:{background:"#ff701f",foreground:"#211009"}},
  {id:"plum",name:"Violet",color:"#ce4dff",light:{background:"#9421d9",foreground:"#ffffff"},dark:{background:"#ce4dff",foreground:"#180422"}},
  {id:"amber",name:"Amber",color:"#ffbc0a",light:{background:"#9d6200",foreground:"#ffffff"},dark:{background:"#ffbc0a",foreground:"#211703"}},
] as const;
export interface Appearance {
  material: (typeof MATERIALS)[number]["id"];
  accent: (typeof ACCENTS)[number]["id"];
}
export const DEFAULT_APPEARANCE: Appearance = {
  material: "native",
  accent: "native",
};
type PreferenceResult<T> =
  { ok: true; value: T } | { ok: false; error: string };
const key = "showbiz-appearance";
export function readAppearance(): PreferenceResult<Appearance> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ok: true, value: DEFAULT_APPEARANCE };
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("material" in parsed) ||
      !("accent" in parsed)
    ) {
      return {
        ok: false,
        error:
          "Saved appearance settings are invalid. Choose an appearance to replace them.",
      };
    }
    const material = MATERIALS.find((item) => item.id === parsed.material)?.id;
    const accent = ACCENTS.find((item) => item.id === parsed.accent)?.id;
    return material && accent
      ? { ok: true, value: { material, accent } }
      : {
          ok: false,
          error: "Saved appearance settings are no longer supported.",
        };
  } catch {
    return {
      ok: false,
      error: "Appearance settings could not be read from local storage.",
    };
  }
}
export function applyAppearance(value: Appearance) {
  document.documentElement.dataset.material = value.material;
  document.documentElement.dataset.accent = value.accent;
  const accent = ACCENTS.find(item => item.id === value.accent)!;
  for (const mode of ["light", "dark"] as const) {
    document.documentElement.style.setProperty(`--chosen-accent-${mode}`, accent[mode].background);
    document.documentElement.style.setProperty(`--chosen-on-accent-${mode}`, accent[mode].foreground);
  }
}
export function saveAppearance(
  value: Appearance,
): PreferenceResult<Appearance> {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    applyAppearance(value);
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      error:
        "Appearance settings could not be saved. Your previous appearance is still active.",
    };
  }
}
