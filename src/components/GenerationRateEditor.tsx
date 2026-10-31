import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { invoke } from "../lib/bridge";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import type {
  GenerationCostRequest,
  GenerationPrice,
  GenerationPriceRate,
} from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

export function GenerationRateEditor({
  modelId,
  provider,
  request,
  price,
  onBusyChange,
  onCancel,
}: {
  modelId: string;
  provider: string;
  request: GenerationCostRequest;
  price?: GenerationPrice;
  onBusyChange?: (busy: boolean) => void;
  onCancel?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);
  const unit = request.kind === "video" ? "second" : "image";
  useUnsavedWork("draft", !!amount || !!source, `${amount}\0${source}`);
  async function save() {
    const usd = Number(amount);
    const microusd = Math.round(usd * 1000000);
    if (
      !amount.trim() ||
      !Number.isFinite(usd) ||
      usd < 0 ||
      !Number.isSafeInteger(microusd) ||
      (usd > 0 && microusd === 0)
    ) {
      setError(
        "Enter a valid USD rate, at least $0.000001 for a nonzero amount.",
      );
      return;
    }
    const rate: GenerationPriceRate = {
      unit,
      microusd,
      kind: request.kind,
      ...(request.resolution ? { resolution: request.resolution } : {}),
      ...(request.audio !== undefined ? { audio: request.audio } : {}),
    };
    const basis: GenerationPrice = {
      provider,
      model_id: modelId,
      currency: "USD",
      source_kind: "manual",
      source_url: source.trim(),
      checked_at: new Date().toISOString(),
      rates: [rate],
    };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await invoke<Result<GenerationPrice>>(
        "save_generation_price",
        { kind: request.kind, price: basis },
      );
      if (!result.ok) setError(result.error.message);
      else {
        setAmount("");
        setSource("");
        setNotice("Rate saved on this device.");
        window.dispatchEvent(new Event("showbiz:pricing-changed"));
      }
    } catch {
      setError("Could not save the rate on this device.");
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await invoke<Result<null>>("clear_generation_price", {
        model_id: modelId,
        kind: request.kind,
      });
      if (!result.ok) setError(result.error.message);
      else {
        setAmount("");
        setSource("");
        setNotice(
          "Custom rate removed. Provider pricing will be used if available.",
        );
        window.dispatchEvent(new Event("showbiz:pricing-changed"));
      }
    } catch {
      setError("Could not reset the saved rate.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <fieldset disabled={saving} className="mt-2 space-y-2">
      <p>
        Enter a custom estimate, including local compute if needed. This is a
        device-wide model rate, not a setting for this shot or asset.
      </p>
      <label className="grid gap-1">
        USD per {unit}
        <Input
          type="number"
          min="0"
          step="0.000001"
          aria-label={`USD per ${unit}`}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setNotice(null);
          }}
          className="h-8 text-xs"
        />
      </label>
      <label className="grid gap-1">
        Pricing source URL (optional)
        <Input
          type="url"
          aria-label="Pricing source URL (optional)"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="h-8 text-xs"
          placeholder="https://…"
        />
      </label>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving || !amount.trim()}
          onClick={() => void save()}
        >
          Save rate
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAmount("");
            setSource("");
            setError(null);
            setNotice(null);
            onCancel?.();
          }}
        >
          Cancel
        </Button>
        {price?.source_kind === "manual" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void reset()}
          >
            Use provider rate
          </Button>
        )}
      </div>
    </fieldset>
  );
}
