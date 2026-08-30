import { z } from "zod";

export const RegisterDeviceSchema = z.object({
  name: z.string().min(1).max(100),
});

export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;
