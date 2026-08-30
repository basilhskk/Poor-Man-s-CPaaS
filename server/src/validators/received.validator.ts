import { z } from "zod";

export const ReceivedSmsItemSchema = z.object({
  from: z.string().min(1),
  body: z.string().min(1),
  receivedAt: z.number().int().positive(),
});

export const ReceivedSmsBatchSchema = z.array(ReceivedSmsItemSchema).min(1);

export type ReceivedSmsItem = z.infer<typeof ReceivedSmsItemSchema>;
