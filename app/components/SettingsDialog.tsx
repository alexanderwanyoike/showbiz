"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Trash2, Eye, EyeOff } from "lucide-react";
import {
  getApiKeyStatusAction,
  saveApiKeyAction,
  deleteApiKeyAction,
  type ApiKeyProvider,
} from "../actions/settings-actions";

interface ApiKeyStatus {
  provider: ApiKeyProvider;
  name: string;
  isConfigured: boolean;
  source: "database" | "environment" | null;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<ApiKeyProvider | null>(null);

  // Input states for each provider
  const [geminiKey, setGeminiKey] = useState("");
  const [ltxKey, setLtxKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showLtxKey, setShowLtxKey] = useState(false);

  useEffect(() => {
    if (open) {
      loadApiKeyStatus();
    }
  }, [open]);

  async function loadApiKeyStatus() {
    setLoading(true);
    try {
      const status = await getApiKeyStatusAction();
      setApiKeyStatus(status);
    } catch (error) {
      console.error("Failed to load API key status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveKey(provider: ApiKeyProvider) {
    const key = provider === "gemini" ? geminiKey : ltxKey;
    if (!key.trim()) return;

    setSavingProvider(provider);
    try {
      const result = await saveApiKeyAction(provider, key);
      if (result.success) {
        // Clear the input and refresh status
        if (provider === "gemini") setGeminiKey("");
        else setLtxKey("");
        await loadApiKeyStatus();
      } else {
        alert(result.error || "Failed to save API key");
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
      alert("Failed to save API key");
    } finally {
      setSavingProvider(null);
    }
  }

  async function handleDeleteKey(provider: ApiKeyProvider) {
    if (!confirm("Remove this API key from the database? (Environment variable will still be used if set)")) {
      return;
    }

    setSavingProvider(provider);
    try {
      const result = await deleteApiKeyAction(provider);
      if (result.success) {
        await loadApiKeyStatus();
      } else {
        alert(result.error || "Failed to delete API key");
      }
    } catch (error) {
      console.error("Failed to delete API key:", error);
      alert("Failed to delete API key");
    } finally {
      setSavingProvider(null);
    }
  }

  function getStatusForProvider(provider: ApiKeyProvider): ApiKeyStatus | undefined {
    return apiKeyStatus.find((s) => s.provider === provider);
  }

  function renderApiKeySection(
    provider: ApiKeyProvider,
    name: string,
    description: string,
    value: string,
    setValue: (v: string) => void,
    showKey: boolean,
    setShowKey: (v: boolean) => void
  ) {
    const status = getStatusForProvider(provider);
    const isSaving = savingProvider === provider;

    return (
      <div className="space-y-3 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">{name}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {status?.isConfigured && (
            <Badge variant={status.source === "database" ? "default" : "secondary"}>
              {status.source === "database" ? "Saved" : "From ENV"}
            </Badge>
          )}
        </div>

        {status?.isConfigured && status.source === "database" ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
              ••••••••••••••••
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleDeleteKey(provider)}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={status?.isConfigured ? "Override environment variable..." : "Enter API key..."}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              onClick={() => handleSaveKey(provider)}
              disabled={!value.trim() || isSaving}
            >
              {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
              Save
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your API keys for image and video generation models.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {renderApiKeySection(
              "gemini",
              "Google AI (Gemini)",
              "Required for Imagen 4, Nano Banana, Nano Banana Pro, and Veo 3",
              geminiKey,
              setGeminiKey,
              showGeminiKey,
              setShowGeminiKey
            )}

            {renderApiKeySection(
              "ltx",
              "LTX Video",
              "Required for LTX Video generation",
              ltxKey,
              setLtxKey,
              showLtxKey,
              setShowLtxKey
            )}
          </div>
        )}

        <DialogFooter>
          <p className="text-xs text-muted-foreground">
            API keys can also be set via environment variables (GEMINI_API_KEY, LTX_API_KEY)
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
