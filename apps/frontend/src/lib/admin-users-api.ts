export type UserRole = "admin" | "moderator" | "seller" | "buyer";
export type UserStatus = "active" | "pending" | "suspended" | "flagged";

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  kycVerified: boolean;
  walletAddress: string;
  fullWalletAddress: string;
  escrowsCount: number;
  completedVolume: string;
  reputationScore: number;
  totalReviews: number;
  joinedDate: string;
  avatarUrl?: string;
}

export const PERMITTED_USER_FIELDS: ReadonlyArray<keyof ManagedUser> = [
  "id",
  "firstName",
  "lastName",
  "email",
  "phoneNumber",
  "role",
  "status",
  "kycVerified",
  "walletAddress",
  "fullWalletAddress",
  "escrowsCount",
  "completedVolume",
  "reputationScore",
  "totalReviews",
  "joinedDate",
  "avatarUrl",
] as const;

const VALID_ROLES = new Set<UserRole>(["admin", "moderator", "seller", "buyer"]);
const VALID_STATUSES = new Set<UserStatus>([
  "active",
  "pending",
  "suspended",
  "flagged",
]);

export function shortenWalletAddress(fullAddress: string): string {
  const trimmed = fullAddress.trim();
  if (!trimmed) return "Unlinked";
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Normalizes a raw user row from Hasura or the backend into the permitted
 * directory shape, stripping any sensitive/internal columns (such as password
 * hashes, reset tokens, recovery codes, or soft-delete metadata).
 */
export function sanitizeManagedUser(
  raw: Record<string, unknown>,
): ManagedUser {
  const fullWallet = String(
    raw.fullWalletAddress ?? raw.wallet_address ?? raw.walletAddress ?? "",
  ).trim();
  const shortWallet =
    typeof raw.walletAddress === "string" && raw.walletAddress.includes("...")
      ? raw.walletAddress
      : shortenWalletAddress(fullWallet);

  const rawRole = String(raw.role ?? "buyer").toLowerCase() as UserRole;
  const role: UserRole = VALID_ROLES.has(rawRole) ? rawRole : "buyer";

  const rawStatus = String(raw.status ?? "active").toLowerCase() as UserStatus;
  const status: UserStatus = VALID_STATUSES.has(rawStatus)
    ? rawStatus
    : "active";

  const rawCreated = String(
    raw.joinedDate ?? raw.created_at ?? new Date().toISOString(),
  );
  const joinedDate = rawCreated.includes("T")
    ? rawCreated.split("T")[0]
    : rawCreated;

  const completedVolume =
    typeof raw.completedVolume === "string" && raw.completedVolume.trim()
      ? raw.completedVolume
      : typeof raw.completed_volume === "number"
        ? `$${raw.completed_volume.toLocaleString()} USDC`
        : "$0 USDC";

  const sanitized: ManagedUser = {
    id: String(raw.id ?? ""),
    firstName: String(raw.firstName ?? raw.first_name ?? ""),
    lastName: String(raw.lastName ?? raw.last_name ?? ""),
    email: String(raw.email ?? ""),
    phoneNumber: String(raw.phoneNumber ?? raw.phone_number ?? ""),
    role,
    status,
    kycVerified: Boolean(raw.kycVerified ?? raw.kyc_verified ?? false),
    walletAddress: shortWallet,
    fullWalletAddress: fullWallet,
    escrowsCount: Number(raw.escrowsCount ?? raw.escrows_count ?? 0) || 0,
    completedVolume,
    reputationScore:
      Number(raw.reputationScore ?? raw.reputation_score ?? 0) || 0,
    totalReviews: Number(raw.totalReviews ?? raw.total_reviews ?? 0) || 0,
    joinedDate,
  };

  const avatar = raw.avatarUrl ?? raw.profile_image_url;
  if (typeof avatar === "string" && avatar.trim()) {
    sanitized.avatarUrl = avatar.trim();
  }

  return sanitized;
}

export class AdminAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

async function getBearerHeader(): Promise<Record<string, string>> {
  const { auth } = await import("@/lib/firebase");
  const user = auth.currentUser;
  if (!user) {
    throw new AdminAuthError(
      "Administrator sign-in is required to access the user directory.",
      401,
    );
  }
  const token = await user.getIdToken();
  if (!token) {
    throw new AdminAuthError(
      "Administrator sign-in is required to access the user directory.",
      401,
    );
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchAdminUsers(
  signal?: AbortSignal,
): Promise<ManagedUser[]> {
  const headers = await getBearerHeader();
  const response = await fetch("/api/admin/users", {
    method: "GET",
    headers,
    signal,
  });

  const body = (await response.json().catch(() => null)) as {
    users?: Array<Record<string, unknown>>;
    error?: string;
  } | null;

  if (response.status === 401 || response.status === 403) {
    throw new AdminAuthError(
      body?.error || "Administrator access is required.",
      response.status,
    );
  }

  if (!response.ok) {
    throw new Error(body?.error || "Failed to load user directory.");
  }

  return (body?.users ?? []).map((u) => sanitizeManagedUser(u));
}

export interface CreateAdminUserInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: UserRole;
  walletAddress?: string;
  kycVerified?: boolean;
}

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<ManagedUser> {
  const headers = await getBearerHeader();
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as {
    user?: Record<string, unknown>;
    error?: string;
  } | null;

  if (response.status === 401 || response.status === 403) {
    throw new AdminAuthError(
      body?.error || "Administrator access is required.",
      response.status,
    );
  }

  if (!response.ok || !body?.user) {
    throw new Error(body?.error || "Failed to create user.");
  }

  return sanitizeManagedUser(body.user);
}

export async function updateAdminUser(
  id: string,
  patch: Partial<Pick<ManagedUser, "role" | "status" | "kycVerified">>,
): Promise<ManagedUser> {
  const headers = await getBearerHeader();
  const response = await fetch("/api/admin/users", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ id, ...patch }),
  });

  const body = (await response.json().catch(() => null)) as {
    user?: Record<string, unknown>;
    error?: string;
  } | null;

  if (response.status === 401 || response.status === 403) {
    throw new AdminAuthError(
      body?.error || "Administrator access is required.",
      response.status,
    );
  }

  if (!response.ok || !body?.user) {
    throw new Error(body?.error || "Failed to update user.");
  }

  return sanitizeManagedUser(body.user);
}
