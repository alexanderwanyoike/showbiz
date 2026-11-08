import { z } from "zod";
import type { AgentJob } from "../../shared/agent-generation";

const PAGE = 100;
const stateSchema = z.object({
  ok: z.literal(true),
  value: z.object({
    current: z.object({ project_id: z.string() }).nullable(),
  }),
});
const pageSchema = z.object({
  ok: z.literal(true),
  value: z.object({
    items: z.array(
      z.object({
        request_id: z.string(),
        reported_microusd: z.number().nullable(),
      }),
    ),
    total_count: z.number(),
  }),
});

/**
 * Finds the usage record an agent job started. null means none was started;
 * undefined means it cannot be known because the job's project is not open.
 */
export async function findAgentJobUsage(
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>,
  job: Pick<AgentJob, "project_id" | "subject_id" | "usage_request_id">,
): Promise<{ reported_microusd: number | null } | null | undefined> {
  const state = stateSchema.safeParse(await invoke("get_project_document_state"));
  if (!state.success || state.data.value.current?.project_id !== job.project_id)
    return undefined;
  for (let offset = 0; ; offset += PAGE) {
    const page = pageSchema.safeParse(
      await invoke("get_generation_usage", {
        project_id: job.project_id,
        subject_id: job.subject_id,
        offset,
        limit: PAGE,
      }),
    );
    if (!page.success) return undefined;
    const found = page.data.value.items.find(
      (item) => item.request_id === job.usage_request_id,
    );
    if (found) return { reported_microusd: found.reported_microusd };
    if (offset + PAGE >= page.data.value.total_count) return null;
  }
}
