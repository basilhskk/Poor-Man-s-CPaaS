import { z } from "zod";

export const UpdateSettingsSchema = z.object({
  routingStrategy: z.enum(["least_load", "round_robin"]).optional(),
  healthCheckEnabled: z.boolean().optional(),
  webhookUrl: z.string().url().nullable().optional(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
