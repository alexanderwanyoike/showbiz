import { z } from "zod";

export const openRouterUsageSchema = z.object({
  cost: z.number().finite().nonnegative().nullable().optional(),
});
