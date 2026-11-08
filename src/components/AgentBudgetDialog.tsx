import { useId, useState, type FormEvent } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAgentBudget } from "../hooks/useAgentBudget";
import {
  AGENT_BUDGET_DURATIONS,
  formatBudgetExpiry,
  grantAgentBudget,
  revokeAgentBudget,
  usdToMicrousd,
} from "../lib/agent-budget";
import { formatGenerationCost } from "../lib/generation-usage";
import { imageConfigs, videoConfigs } from "../lib/models/registry";
import { modelProviderName } from "../lib/model-provider";

const budgetModels = [...imageConfigs, ...videoConfigs]
  .filter((model) => model.enabled)
  .map((model) => ({
    id: model.id,
    label: `${model.name} (${modelProviderName(model) ?? model.apiKeyProvider})`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function AgentBudgetDialog() {
  const ids = useId();
  const { budget, error: loadError } = useAgentBudget();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [cap, setCap] = useState("");
  const [minutes, setMinutes] = useState<number>(AGENT_BUDGET_DURATIONS[0].minutes);
  const [limitModels, setLimitModels] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setSaving(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.error?.message ?? "The budget was not saved.");
      return result.ok;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function grant(event: FormEvent) {
    event.preventDefault();
    const max = usdToMicrousd(amount);
    if (max === null) return setError("Enter a budget above zero.");
    const perRequest = cap.trim() ? usdToMicrousd(cap) : undefined;
    if (perRequest === null) return setError("Enter a per-request limit above zero, or leave it empty.");
    if (limitModels && models.length === 0) return setError("Choose at least one model, or allow any model.");
    const saved = await run(() =>
      grantAgentBudget({
        max_microusd: max,
        duration_minutes: minutes,
        ...(perRequest ? { per_request_cap_microusd: perRequest } : {}),
        ...(limitModels ? { allowed_models: models } : {}),
      }),
    );
    if (saved) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Bot size={15} />
          Agent budget
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agent budget</DialogTitle>
          <DialogDescription>
            Set how much an agent connected through MCP may spend on
            generation. Only you can grant or revoke it, here in Showbiz.
          </DialogDescription>
        </DialogHeader>
        {loadError && (
          <p role="alert" className="text-xs text-destructive">
            The current budget could not be read. {loadError}
          </p>
        )}
        {budget && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-xs">
            <p>
              {formatGenerationCost(budget.remaining_microusd)} left of{" "}
              {formatGenerationCost(budget.grant.max_microusd)}, at most{" "}
              {formatGenerationCost(budget.grant.per_request_cap_microusd)} per
              request, until {formatBudgetExpiry(budget.grant.expires_at)}.
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => void run(revokeAgentBudget)}
            >
              Revoke
            </Button>
          </div>
        )}
        <form className="grid gap-2 text-xs" onSubmit={(event) => void grant(event)}>
          <label htmlFor={`${ids}-amount`}>Budget (USD)</label>
          <Input
            id={`${ids}-amount`}
            className="h-8 text-xs"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <label htmlFor={`${ids}-cap`}>Per request, at most (USD)</label>
          <Input
            id={`${ids}-cap`}
            className="h-8 text-xs"
            inputMode="decimal"
            placeholder="Same as budget"
            value={cap}
            onChange={(event) => setCap(event.target.value)}
          />
          <label htmlFor={`${ids}-lasts`}>Lasts</label>
          <select
            id={`${ids}-lasts`}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          >
            {AGENT_BUDGET_DURATIONS.map((duration) => (
              <option key={duration.minutes} value={duration.minutes}>
                {duration.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={limitModels}
              onChange={(event) => setLimitModels(event.target.checked)}
            />
            Only allow chosen models
          </label>
          {limitModels && (
            <fieldset className="grid max-h-40 gap-1 overflow-auto rounded-md border border-border p-2">
              <legend className="sr-only">Allowed models</legend>
              {budgetModels.map((model) => (
                <label key={model.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={models.includes(model.id)}
                    onChange={(event) =>
                      setModels((current) =>
                        event.target.checked
                          ? [...current, model.id]
                          : current.filter((id) => id !== model.id),
                      )
                    }
                  />
                  {model.label}
                </label>
              ))}
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              Grant budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
