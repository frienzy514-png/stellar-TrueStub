export type PublicEscrowStatus = "pending" | "funded" | "released" | "disputed";

const PUBLIC_STATUS_MAP: Record<string, PublicEscrowStatus> = {
  pending: "pending",
  funded: "funded",
  active: "funded",
  completed: "released",
  released: "released",
  resolved: "released",
  disputed: "disputed",
};

/** Escrow IDs are contract IDs / UUIDs — reject anything else before querying. */
export function isValidEscrowId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

/**
 * Public, no-login status lookup (#191). Selects ONLY the status column and
 * collapses it to a coarse public state so no counterparty data, amounts or
 * wallet addresses can leak. Returns null when the escrow is unknown or the
 * lookup fails.
 */
export async function getPublicEscrowStatus(
  escrowId: string,
): Promise<{ status: PublicEscrowStatus } | null> {
  if (!isValidEscrowId(escrowId)) return null;

  const hasuraUrl =
    process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || "http://localhost:8080/v1/graphql";
  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;

  const query = `
    query PublicEscrowStatus($escrowId: String!) {
      escrows(where: { id: { _eq: $escrowId } }, limit: 1) {
        status
      }
    }
  `;

  try {
    const res = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(adminSecret ? { "x-hasura-admin-secret": adminSecret } : {}),
      },
      body: JSON.stringify({ query, variables: { escrowId } }),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: { escrows?: Array<{ status?: string }> };
    };
    const raw = data.data?.escrows?.[0]?.status;
    if (!raw) return null;

    return { status: PUBLIC_STATUS_MAP[raw.toLowerCase()] ?? "pending" };
  } catch {
    return null;
  }
}
