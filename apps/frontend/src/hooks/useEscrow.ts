import { useQuery } from '@apollo/client';
import { GET_ESCROW_BY_ID } from '@/lib/graphql/queries';

export interface EscrowParty {
  id: string;
  role: string;
  user: {
    id: string;
    username?: string | null;
    email?: string | null;
  };
}

export interface Escrow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt?: string | null;
  description?: string | null;
  buyer?: EscrowParty['user'] | null;
  seller?: EscrowParty['user'] | null;
  parties?: EscrowParty[] | null;
}

export interface UseEscrowResult {
  escrow: Escrow | null;
  loading: boolean;
  error: Error | undefined;
  /** True when the current viewer is a party (buyer/seller/listed party) to the escrow. */
  isParty: boolean;
  /** True when the escrow loaded but the viewer is not authorized to view it. */
  isUnauthorized: boolean;
}

/**
 * Fetches a single escrow by id via GET_ESCROW_BY_ID and determines whether the
 * current viewer is a party to it. Used by the per-escrow receipt page so receipt
 * URLs cannot be read by guessing ids.
 */
export function useEscrow(id: string | undefined): UseEscrowResult {
  const { data, loading, error } = useQuery(GET_ESCROW_BY_ID, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });

  const escrow: Escrow | null = data?.escrowById ?? data?.escrow ?? null;

  const isParty = Boolean(escrow && escrow.isParty);
  const isUnauthorized = Boolean(escrow && !isParty);

  return {
    escrow,
    loading,
    error: error as Error | undefined,
    isParty,
    isUnauthorized,
  };
}

export default useEscrow;
