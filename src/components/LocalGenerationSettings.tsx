import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import {
  getLocalGenerationConfig,
  saveLocalGenerationConfig,
} from "../lib/local-generation-config";
import type { LocalGenerationConfig } from "../../shared/local-generation";

export function LocalGenerationSettings() {
  const [config, setConfig] = useState<LocalGenerationConfig | null>(null);
  const [saved, setSaved] = useState<LocalGenerationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(false);
  const [reload, setReload] = useState(0);
  const dirty = !!config && JSON.stringify(config) !== JSON.stringify(saved);
  useUnsavedWork("credentials", dirty, config);
  useEffect(() => {
    let stopped = false;
    getLocalGenerationConfig()
      .then((result) => {
        if (stopped) return;
        if (!result.ok) setError(result.error.message);
        else {
          setConfig(result.value);
          setSaved(result.value);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!stopped) setError(String(cause));
      });
    return () => {
      stopped = true;
    };
  }, [reload]);
  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setNotice(false);
    try {
      const result = await saveLocalGenerationConfig(config);
      if (!result.ok) setError(result.error.message);
      else {
        setConfig(result.value);
        setSaved(result.value);
        setNotice(true);
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }
  function field(
    key: keyof LocalGenerationConfig,
    label: string,
    placeholder: string,
  ) {
    return (
      <label className="grid gap-1.5 text-xs">
        {label}
        <Input
          aria-label={label}
          placeholder={placeholder}
          value={config?.[key] ?? ""}
          onChange={(event) => {
            if (config) setConfig({ ...config, [key]: event.target.value });
            setNotice(false);
          }}
        />
      </label>
    );
  }
  return (
    <section
      className="space-y-3 border-t px-4 py-4"
      aria-label="Local generation configuration"
    >
      <p className="text-xs text-muted-foreground">
        Run your models in LocalAI, then enter the server address and installed
        model names. Use the server root URL without /v1. These settings stay on
        this device.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {!config ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReload((value) => value + 1)}
        >
          Reload local settings
        </Button>
      ) : (
        <fieldset disabled={saving} className="space-y-3">
          {field("endpoint", "Local server URL", "http://127.0.0.1:8080")}
          <div className="grid gap-3 sm:grid-cols-2">
            {field(
              "image_model",
              "Local image model",
              "Installed image model name",
            )}
            {field(
              "video_model",
              "Local video model",
              "Installed video model name",
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save local models"}
            </Button>
            {notice && (
              <span role="status" className="text-xs text-muted-foreground">
                Local models saved.
              </span>
            )}
          </div>
        </fieldset>
      )}
    </section>
  );
}
