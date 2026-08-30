import { z } from "zod";

export const RegisterSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "username may only contain letters, numbers, _ and -",
    ),
  password: z.string().min(8),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
