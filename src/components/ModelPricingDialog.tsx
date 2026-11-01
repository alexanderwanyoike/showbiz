import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GenerationRateEditor } from "./GenerationRateEditor";
import { invoke } from "../lib/bridge";
import type {
  GenerationCostRequest,
  GenerationPrice,
} from "../../shared/generation-cost";
import type { Result } from "../../shared/result";

export function ModelPricingDialog({
  modelId,
  modelName,
  provider,
  request,
  price,
}: {
  modelId: string;
  modelName: string;
  provider: string;
  request: GenerationCostRequest;
  price?: GenerationPrice;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedPrice, setSavedPrice] = useState(price);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    setSavedPrice(price);
    setError(null);
    if (open && !price)
      void invoke<Result<GenerationPrice | null>>("get_generation_price", {
        model_id: modelId,
        kind: request.kind,
      })
        .then((result) => {
          if (stopped) return;
          if (result.ok) setSavedPrice(result.value ?? undefined);
          else setError(result.error.message);
        })
        .catch(() => {
          if (!stopped)
            setError(
              "The saved model rate could not be loaded. You can still enter a new estimate.",
            );
        });
    return () => {
      stopped = true;
    };
  }, [open, price, modelId, request.kind]);
  function changeOpen(next: boolean) {
    if (!next && busy) return;
    setOpen(next);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto px-0 text-[11px]">
          Model pricing…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model pricing</DialogTitle>
          <DialogDescription>
            {modelName} · {provider}. A custom rate applies to this model on
            this device across all projects. It changes future estimates, for
            the selected generation type and, for video, resolution and audio
            settings. Past records stay unchanged.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm font-medium">
          {request.kind === "video"
            ? "Video"
            : request.kind === "image_edit"
              ? "Image edit"
              : request.kind === "image_compose"
                ? "Image composition"
                : "Image generation"}
          {request.kind === "video"
            ? ` · ${request.resolution ?? "Any resolution"} · Audio ${request.audio === undefined ? "not priced separately" : request.audio ? "on" : "off"}`
            : ""}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <GenerationRateEditor
          modelId={modelId}
          provider={provider}
          request={request}
          price={savedPrice}
          onBusyChange={setBusy}
          onCancel={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
