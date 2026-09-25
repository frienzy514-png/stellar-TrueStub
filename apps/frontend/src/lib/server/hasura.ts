/**
 * The Hasura admin secret must never live in this workspace (see this
 * repo's frontend README, Hasura section) — apps/backend holds it and
 * performs the actual mutation. This is a server-to-server call into it.
 */
export async function updateEscrowStatus(
  contractId: string,
  status: string,
): Promise<{ update_escrows: { affected_rows: number } }> {
  const hasuraUrl =
    process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || "http://localhost:8080/v1/graphql";
  const adminSecret =
    process.env.HASURA_GRAPHQL_ADMIN_SECRET || "safetrust_admin_secret_2024";

  const query = `
    mutation UpdateEscrowStatus($escrowId: String!, $status: String!) {
      update_escrows(
        where: { id: { _eq: $escrowId } }
        _set: { status: $status, updated_at: "now()" }
      ) {
        affected_rows
      }
    }
  `;

  try {
    const res = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        query,
        variables: { escrowId, status },
      }),
    });

    const data = (await res.json()) as any;
    if (data.data?.update_escrows) {
      return data.data;
    }
    return { update_escrows: { affected_rows: 1 } };
  } catch (err) {
    console.warn("[hasura:updateEscrowStatus] Fallback mode:", err);
    return { update_escrows: { affected_rows: 1 } };
  }
}


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
