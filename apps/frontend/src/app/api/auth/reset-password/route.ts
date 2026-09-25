import { NextResponse } from "next/server";
import {
  parseOr400,
  readJson,
  resetPasswordSchema,
} from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const parsed = parseOr400(resetPasswordSchema, await readJson(request));
    if (parsed.error) return parsed.error;
    const { token, newPassword } = parsed.data;

    const response = await fetch(
      `${process.env.BACKEND_URL}/api/auth/reset-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, newPassword }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to reset password" },
        { status: response.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Reset password API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
