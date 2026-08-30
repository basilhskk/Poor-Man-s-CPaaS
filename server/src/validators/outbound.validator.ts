import { z } from "zod";

export const SendSmsSchema = z.object({
  to: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, "must be E.164 format e.g. +12125551234"),
  body: z.string().min(1),
  deviceId: z.string().uuid().optional(),
  webhookUrl: z.string().url().optional(),
});

export const AckItemSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["in_progress", "sent", "failed", "dead_letter"]),
  sentAt: z.number().optional(),
  reason: z.string().optional(),
});

export const AckBatchSchema = z.array(AckItemSchema).min(1);

export type SendSmsInput = z.infer<typeof SendSmsSchema>;
export type AckItem = z.infer<typeof AckItemSchema>;
