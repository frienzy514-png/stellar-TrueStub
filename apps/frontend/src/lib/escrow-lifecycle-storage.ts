export const ESCROW_LIFECYCLE_STORAGE_KEY = "truestub:lifecycle-escrows";

export type LifecycleEscrowStatus =
  | "PENDING"
  | "FUNDED"
  | "TRANSFER_CONFIRMED"
  | "COMPLETED";

export interface StoredLifecycleEscrow {
  id: string;
  purchaseId: string;
  event: string;
  amount: number;
  currency: string;
  status: LifecycleEscrowStatus;
  createdAt: string;
  updatedAt: string;
}

export function getStoredLifecycleEscrows(): StoredLifecycleEscrow[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ESCROW_LIFECYCLE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredLifecycleEscrow[]) : [];
  } catch {
    return [];
  }
}

export function upsertLifecycleEscrow(
  escrow: StoredLifecycleEscrow,
): StoredLifecycleEscrow[] {
  if (typeof window === "undefined") {
    return [escrow];
  }

  const existing = getStoredLifecycleEscrows();
  const next = [escrow, ...existing.filter((item) => item.id !== escrow.id)];
  try {
    window.localStorage.setItem(
      ESCROW_LIFECYCLE_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Ignore storage write quota errors
  }
  return next;
}

export function updateLifecycleEscrowStatus(
  id: string,
  status: LifecycleEscrowStatus,
): StoredLifecycleEscrow | null {
  const existing = getStoredLifecycleEscrows();
  const index = existing.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const updated: StoredLifecycleEscrow = {
    ...existing[index],
    status,
    updatedAt: new Date().toISOString(),
  };

  const next = [...existing];
  next[index] = updated;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        ESCROW_LIFECYCLE_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      // Ignore storage write quota errors
    }
  }

  return updated;
}
