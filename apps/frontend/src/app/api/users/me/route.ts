import { NextResponse } from "next/server";

/**
 * DELETE /api/users/me
 *
 * Proxies the account-deletion request to the backend, which holds the
 * Hasura admin-secret and performs the data anonymization server-side
 * before deleting the Firebase Auth account.
 *
 * The frontend sends its Firebase ID token as a Bearer token; the backend
 * verifies it and uses the decoded uid/email to locate and anonymize the
 * user's row.
 */
export async function DELETE(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization) {
      return NextResponse.json(
        { error: "Authorization header is required" },
        { status: 401 }
      );
    }

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.error("BACKEND_URL is not set — cannot delete user data");
      return NextResponse.json(
        { error: "Backend URL configuration error" },
        { status: 500 }
      );
    }

    const response = await fetch(`${backendUrl}/api/users/me`, {
      method: "DELETE",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
    });

    const contentType = response.headers.get("content-type");
    const data = contentType?.includes("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "Failed to delete user" },
        { status: response.status }
      );
    }

    return NextResponse.json(data ?? { success: true, deleted: true });
  } catch (error) {
    console.error("Delete user API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
