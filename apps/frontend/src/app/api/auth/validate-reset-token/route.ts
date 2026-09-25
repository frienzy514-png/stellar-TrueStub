import { NextResponse } from "next/server";
import { parseOr400, validateResetTokenSchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseOr400(validateResetTokenSchema, {
      token: searchParams.get("token") ?? "",
    });
    if (parsed.error) return parsed.error;
    const { token } = parsed.data;

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.error("BACKEND_URL is not defined in environment variables");
      return NextResponse.json(
        { error: "Backend URL configuration error" },
        { status: 500 },
      );
    }

    const url = `${backendUrl}/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`;
    console.log("Making request to:", url);

    const response = await fetch(url);
    console.log("Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      return NextResponse.json(
        { error: "Failed to validate token" },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log("Response data:", data);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Validate token API error:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
