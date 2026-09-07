import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpdatesPanel } from "./UpdatesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { API_KEY_PROVIDERS } from "../../shared/provider-catalog";
import {
  deleteApiKeyAction,
  getApiKeyStatusAction,
  saveApiKeyAction,
  type ApiKeyProvider,
  type ApiKeyStatus,
} from "../lib/backend-api";
import {
  getAvailableImageModels,
  getAvailableVideoModels,
} from "../lib/models";
import {
  buildProviderSettings,
  filterProviderSettings,
  type ProviderSetting,
} from "../lib/provider-settings";

interface SettingsDialogProps {
  open: boolean;
  initialSection?: "providers" | "updates";
  onOpenChange: (open: boolean) => void;
}

const MODEL_CREDENTIAL_REQUIREMENTS = [
  ...getAvailableImageModels(),
  ...getAvailableVideoModels(),
];

function createProviderRecord<T>(initialValue: T): Record<ApiKeyProvider, T> {
  return Object.fromEntries(
    API_KEY_PROVIDERS.map((provider) => [provider.id, initialValue])
  ) as Record<ApiKeyProvider, T>;
}

function modelSummary(provider: ProviderSetting): string {
  if (provider.modelNames.length === 0) {
    return "No generation models currently enabled";
  }

  const visibleNames = provider.modelNames.slice(0, 3).join(", ");
  const remainingCount = provider.modelNames.length - 3;
  return remainingCount > 0
    ? `${visibleNames} +${remainingCount} more`
    : visibleNames;
}

export function SettingsDialog({ open, onOpenChange, initialSection = "providers" }: SettingsDialogProps) {
  const [section, setSection] = useState(initialSection);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingProvider, setSavingProvider] = useState<ApiKeyProvider | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<ApiKeyProvider | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [keyValues, setKeyValues] = useState(() => createProviderRecord(""));
  const [visibleKeys, setVisibleKeys] = useState(() => createProviderRecord(false));
  const expandedEditorRef = useRef<HTMLDivElement>(null);

  const providerSettings = useMemo(
    () =>
      buildProviderSettings(
        API_KEY_PROVIDERS,
        apiKeyStatus,
        MODEL_CREDENTIAL_REQUIREMENTS
      ),
    [apiKeyStatus]
  );
  const visibleProviders = useMemo(
    () => filterProviderSettings(providerSettings, searchQuery),
    [providerSettings, searchQuery]
  );
  const configuredCount = providerSettings.filter(
    (provider) => provider.isConfigured
  ).length;

  useEffect(() => {
    if (open) {
      setSection(initialSection);
      void loadApiKeyStatus();
    }
  }, [open, initialSection]);

  useEffect(() => {
    if (expandedProvider) {
      expandedEditorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [expandedProvider]);

  async function loadApiKeyStatus(showLoading = true) {
    if (showLoading) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      setApiKeyStatus(await getApiKeyStatusAction());
    } catch (error) {
      console.error("Failed to load API key status:", error);
      if (showLoading) {
        setLoadError(true);
      } else {
        alert("The key changed, but provider status could not be refreshed.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setExpandedProvider(null);
      setSearchQuery("");
      setKeyValues(createProviderRecord(""));
      setVisibleKeys(createProviderRecord(false));
    }
    onOpenChange(nextOpen);
  }

  function updateKey(provider: ApiKeyProvider, value: string) {
    setKeyValues((current) => ({ ...current, [provider]: value }));
  }

  function toggleKeyVisibility(provider: ApiKeyProvider) {
    setVisibleKeys((current) => ({
      ...current,
      [provider]: !current[provider],
    }));
  }

  async function handleSaveKey(provider: ApiKeyProvider) {
    const key = keyValues[provider];
    if (!key.trim()) return;

    setSavingProvider(provider);
    try {
      const result = await saveApiKeyAction(provider, key);
      if (!result.success) {
        alert(result.error || "Failed to save API key");
        return;
      }
      updateKey(provider, "");
      await loadApiKeyStatus(false);
    } catch (error) {
      console.error("Failed to save API key:", error);
      alert("Failed to save API key");
    } finally {
      setSavingProvider(null);
    }
  }

  async function handleDeleteKey(provider: ApiKeyProvider) {
    if (!confirm("Remove this API key from the database?")) return;

    setSavingProvider(provider);
    try {
      const result = await deleteApiKeyAction(provider);
      if (!result.success) {
        alert(result.error || "Failed to delete API key");
        return;
      }
      await loadApiKeyStatus(false);
    } catch (error) {
      console.error("Failed to delete API key:", error);
      alert("Failed to delete API key");
    } finally {
      setSavingProvider(null);
    }
  }

  function renderProviderEditor(provider: ProviderSetting) {
    const isSaving = savingProvider === provider.id;

    if (provider.isConfigured) {
      return (
        <div className="space-y-3 border-t bg-muted/25 px-4 py-3">
          <p className="text-xs text-muted-foreground">{provider.helpText}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4 shrink-0" />
              <span className="truncate">Saved in the local database</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteKey(provider.id)}
              disabled={isSaving}
              aria-label={`Remove ${provider.name} API key`}
            >
              {isSaving ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remove
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3 border-t bg-muted/25 px-4 py-3">
        <p className="text-xs text-muted-foreground">{provider.helpText}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Input
              type={visibleKeys[provider.id] ? "text" : "password"}
              aria-label={provider.credentialLabel}
              placeholder={`Enter ${provider.credentialLabel.toLocaleLowerCase()}…`}
              value={keyValues[provider.id]}
              onChange={(event) => updateKey(provider.id, event.target.value)}
              className="pr-10"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => toggleKeyVisibility(provider.id)}
              aria-label={`${visibleKeys[provider.id] ? "Hide" : "Show"} ${provider.credentialLabel}`}
            >
              {visibleKeys[provider.id] ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() => handleSaveKey(provider.id)}
            disabled={!keyValues[provider.id].trim() || isSaving}
          >
            {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
            Save key
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <Tabs value={section} onValueChange={(value) => setSection(value as "providers" | "updates")} className="contents">
          <DialogHeader className="px-5 pt-5 pb-4 text-left sm:px-6 sm:pt-6">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Manage your providers and application updates.
            </DialogDescription>
            <TabsList aria-label="Settings sections" className="mt-3 w-full">
              <TabsTrigger value="providers">Providers</TabsTrigger>
              <TabsTrigger value="updates">Updates</TabsTrigger>
            </TabsList>
          </DialogHeader>

          <TabsContent value="providers" className="min-h-0 overflow-hidden">

            <div
              role="region"
              aria-label="API key providers"
              tabIndex={0}
              className="h-full min-h-0 overflow-y-auto overscroll-contain px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6"
            >
              <div className="sticky top-0 z-10 bg-background pb-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    aria-label="Search providers or models"
                    placeholder="Search providers or models…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : loadError ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Provider settings could not be loaded.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void loadApiKeyStatus()}
                  >
                    Try again
                  </Button>
                </div>
              ) : visibleProviders.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No providers or models match “{searchQuery.trim()}”.
                </div>
              ) : (
                <ul className="overflow-hidden rounded-lg border" aria-label="Providers">
                  {visibleProviders.map((provider) => {
                    const isExpanded = expandedProvider === provider.id;
                    const editorId = `provider-${provider.id}-editor`;

                    return (
                      <li key={provider.id} className="border-b last:border-b-0">
                        <button
                          type="button"
                          aria-label={`Configure ${provider.name}`}
                          aria-expanded={isExpanded}
                          aria-controls={editorId}
                          onClick={() =>
                            setExpandedProvider(isExpanded ? null : provider.id)
                          }
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                              provider.isConfigured
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/35"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {provider.name}
                              </span>
                              {provider.isConfigured && (
                                <Badge variant="secondary" className="shrink-0">
                                  Connected
                                </Badge>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {modelSummary(provider)}
                            </span>
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                        {isExpanded && (
                          <div id={editorId} ref={expandedEditorRef}>
                            {renderProviderEditor(provider)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="h-4" />
            </div>
          </TabsContent>
          <TabsContent value="updates" className="min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6">
            <UpdatesPanel />
          </TabsContent>

          <DialogFooter className="flex-row items-center justify-between gap-3 border-t bg-background px-5 py-3 sm:px-6">
            {section === "providers" ? <>
            <p className="text-xs text-muted-foreground">
              {configuredCount} of {providerSettings.length} connected
            </p>
            <p className="text-right text-xs text-muted-foreground">
              Keys are stored in the local Showbiz database.
            </p>
            </> : <p className="text-xs text-muted-foreground">Download and install updates when you are ready.</p>}
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
