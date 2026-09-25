import { NextResponse } from "next/server";
import { z } from "zod";

// Server-side mirrors of the client-side auth form rules (ResetPasswordForm
// enforces an 8-char minimum; forgot-password expects a valid email).
// Client validation is trivially bypassed by calling the API routes directly,
// so every route handler re-validates with these before forwarding anything.

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const validateResetTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

// sync-user forwards a free-form profile payload; only require a JSON object.
export const syncUserSchema = z.record(z.unknown());

/**
 * Parses `input` with `schema`. On failure returns a ready-to-return 400
 * response (never forwarded downstream); on success returns the typed data.
 */
export function parseOr400<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): { data: z.infer<T>; error?: undefined } | { data?: undefined; error: NextResponse } {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data };

  const issues = result.error.issues.map((i) => ({
    field: i.path.join("."),
    message: i.message,
  }));
  return {
    error: NextResponse.json(
      { error: issues[0]?.message ?? "Invalid request", issues },
      { status: 400 },
    ),
  };
}

/** Reads a JSON body, treating unparseable input as `undefined` (→ 400 via schema). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
