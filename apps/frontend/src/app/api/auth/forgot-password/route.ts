import { NextResponse } from "next/server";
import {
  forgotPasswordSchema,
  parseOr400,
  readJson,
} from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const parsed = parseOr400(forgotPasswordSchema, await readJson(request));
    if (parsed.error) return parsed.error;
    const { email } = parsed.data;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_WEBHOOK_URL}/webhooks/forgot-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to process request" },
        { status: response.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Forgot password API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
