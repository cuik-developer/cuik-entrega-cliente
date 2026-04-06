import { z } from "zod"

export const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export type SignInInput = z.infer<typeof signInSchema>

export const signUpSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1, "Name is required"),
})

export type SignUpInput = z.infer<typeof signUpSchema>
