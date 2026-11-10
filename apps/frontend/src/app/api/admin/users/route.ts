import { NextResponse } from "next/server";
import { z } from "zod";
import {
  sanitizeManagedUser,
  type ManagedUser,
  type UserRole,
  type UserStatus,
} from "@/lib/admin-users-api";
import { parseOr400, readJson } from "@/lib/server/validation";

interface DecodedTokenClaims {
  uid?: string;
  sub?: string;
  email?: string;
  exp?: number;
  role?: unknown;
  "https://hasura.io/jwt/claims"?: {
    "x-hasura-role"?: unknown;
    "x-hasura-default-role"?: unknown;
  };
}

function decodeJwtPayload(token: string): DecodedTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const json = Buffer.from(padded, "base64").toString("utf-8");
    const parsed = JSON.parse(json) as DecodedTokenClaims;
    if (!parsed || typeof parsed !== "object") return null;
    if (
      typeof parsed.exp === "number" &&
      parsed.exp * 1000 < Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function verifyAdminRequest(
  request: Request,
):
  | { authorized: true; token: string; claims: DecodedTokenClaims }
  | { authorized: false; response: NextResponse } {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Authorization header is required" },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      ),
    };
  }

  const claims = decodeJwtPayload(token);
  if (!claims) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      ),
    };
  }

  const hasuraClaims = claims["https://hasura.io/jwt/claims"];
  const role =
    claims.role ??
    hasuraClaims?.["x-hasura-role"] ??
    hasuraClaims?.["x-hasura-default-role"];

  if (role !== "admin") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Administrator access is required" },
        { status: 403 },
      ),
    };
  }

  return { authorized: true, token, claims };
}

const LIST_USERS_QUERY = `
  query AdminUserDirectory {
    users(
      where: { deleted_at: { _is_null: true } }
      order_by: { created_at: desc }
    ) {
      id
      first_name
      last_name
      email
      phone_number
      role
      status
      kyc_verified
      wallet_address
      escrows_count
      completed_volume
      reputation_score
      total_reviews
      created_at
      profile_image_url
    }
  }
`;

const INSERT_ADMIN_USER_MUTATION = `
  mutation AdminCreateUser($object: users_insert_input!) {
    insert_users_one(object: $object) {
      id
      first_name
      last_name
      email
      phone_number
      role
      status
      kyc_verified
      wallet_address
      escrows_count
      completed_volume
      reputation_score
      total_reviews
      created_at
      profile_image_url
    }
  }
`;

const UPDATE_ADMIN_USER_MUTATION = `
  mutation AdminUpdateUser($id: uuid!, $changes: users_set_input!) {
    update_users_by_pk(pk_columns: { id: $id }, _set: $changes) {
      id
      first_name
      last_name
      email
      phone_number
      role
      status
      kyc_verified
      wallet_address
      escrows_count
      completed_volume
      reputation_score
      total_reviews
      created_at
      profile_image_url
    }
  }
`;

async function queryHasura<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<T> {
  const hasuraUrl =
    process.env.HASURA_GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL ||
    "http://localhost:8080/v1/graphql";
  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;

  const response = await fetch(hasuraUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(adminSecret ? { "x-hasura-admin-secret": adminSecret } : {}),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Hasura request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message || "GraphQL query failed");
  }

  return payload.data;
}

const createUserBodySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Valid email is required"),
  phoneNumber: z.string().optional(),
  role: z.enum(["admin", "moderator", "seller", "buyer"]).default("buyer"),
  walletAddress: z.string().optional(),
  kycVerified: z.boolean().optional().default(false),
});

const updateUserBodySchema = z.object({
  id: z.string().trim().min(1, "User ID is required"),
  role: z.enum(["admin", "moderator", "seller", "buyer"]).optional(),
  status: z.enum(["active", "pending", "suspended", "flagged"]).optional(),
  kycVerified: z.boolean().optional(),
});

export async function GET(request: Request) {
  const authResult = verifyAdminRequest(request);
  if (!authResult.authorized) return authResult.response;

  try {
    const data = await queryHasura<{
      users?: Array<Record<string, unknown>>;
    }>(LIST_USERS_QUERY, {}, authResult.token);

    const users: ManagedUser[] = (data.users ?? []).map((row) =>
      sanitizeManagedUser(row),
    );

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Admin user directory GET error:", error);
    return NextResponse.json(
      { error: "Failed to load user directory" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const authResult = verifyAdminRequest(request);
  if (!authResult.authorized) return authResult.response;

  const parsed = parseOr400(createUserBodySchema, await readJson(request));
  if (parsed.error) return parsed.error;

  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    role,
    walletAddress,
    kycVerified,
  } = parsed.data;

  try {
    const data = await queryHasura<{
      insert_users_one?: Record<string, unknown> | null;
    }>(
      INSERT_ADMIN_USER_MUTATION,
      {
        object: {
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phoneNumber ?? null,
          role: role as UserRole,
          status: "active" as UserStatus,
          kyc_verified: Boolean(kycVerified),
          wallet_address: walletAddress ?? null,
        },
      },
      authResult.token,
    );

    if (!data.insert_users_one) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { user: sanitizeManagedUser(data.insert_users_one) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin user directory POST error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  const authResult = verifyAdminRequest(request);
  if (!authResult.authorized) return authResult.response;

  const parsed = parseOr400(updateUserBodySchema, await readJson(request));
  if (parsed.error) return parsed.error;

  const { id, role, status, kycVerified } = parsed.data;
  const changes: Record<string, unknown> = {};
  if (role !== undefined) changes.role = role;
  if (status !== undefined) changes.status = status;
  if (kycVerified !== undefined) changes.kyc_verified = kycVerified;

  if (Object.keys(changes).length === 0) {
    return NextResponse.json(
      { error: "At least one update field is required" },
      { status: 400 },
    );
  }

  try {
    const data = await queryHasura<{
      update_users_by_pk?: Record<string, unknown> | null;
    }>(UPDATE_ADMIN_USER_MUTATION, { id, changes }, authResult.token);

    if (!data.update_users_by_pk) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      user: sanitizeManagedUser(data.update_users_by_pk),
    });
  } catch (error) {
    console.error("Admin user directory PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 502 },
    );
  }
}
