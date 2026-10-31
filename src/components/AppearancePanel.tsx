import { useState } from "react";
import { useTheme } from "next-themes";
import {
  ACCENTS,
  MATERIALS,
  DEFAULT_APPEARANCE,
  readAppearance,
  saveAppearance,
  type Appearance,
} from "../lib/appearance";

export function AppearancePanel() {
  const [initial] = useState(readAppearance);
  const [appearance, setAppearance] = useState(
    initial.ok ? initial.value : DEFAULT_APPEARANCE,
  );
  const [error, setError] = useState<string | null>(
    initial.ok ? null : initial.error,
  );
  const { theme = "system", setTheme } = useTheme();
  function update(patch: Partial<Appearance>) {
    const saved = saveAppearance({ ...appearance, ...patch });
    if (saved.ok) {
      setAppearance(saved.value);
      setError(null);
    } else setError(saved.error);
  }
  return (
    <section aria-label="Appearance settings" className="appearance-panel">
      <p className="text-sm text-muted-foreground">
        Choose a surface, appearance mode and accent colour.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <fieldset>
        <legend>Material</legend>
        <div className="appearance-materials">
          {MATERIALS.map((material) => (
            <label
              key={material.id}
              className="appearance-material"
              data-material={material.id}
              title={material.detail}
            >
              <input
                type="radio"
                name="appearance-material"
                value={material.id}
                checked={appearance.material === material.id}
                onChange={() => update({ material: material.id })}
              />
              <span className="material-preview" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>{material.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Appearance mode</legend>
        <div className="appearance-modes">
          {(["light", "dark", "system"] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="appearance-mode"
                value={mode}
                checked={theme === mode}
                onChange={() => setTheme(mode)}
              />
              <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Accent colour</legend>
        <div className="appearance-accents">
          {ACCENTS.map((accent) => (
            <label key={accent.id} title={accent.name}>
              <input
                type="radio"
                name="appearance-accent"
                aria-label={accent.name}
                value={accent.id}
                checked={appearance.accent === accent.id}
                onChange={() => update({ accent: accent.id })}
              />
              <span
                className="appearance-swatch"
                style={{ background: accent.color }}
              />
              <span>{accent.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
