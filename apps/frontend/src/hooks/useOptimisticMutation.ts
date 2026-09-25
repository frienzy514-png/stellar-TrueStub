import type { DocumentNode } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { optimisticUpdatePolicies } from '@/utils/optimistic-updates';

/**
 * Wraps Apollo's useMutation with a named optimistic-update policy.
 *
 * Apollo Client v4 (4.1.x) declares React ^19 as a supported peer, but its
 * React hooks moved to the `@apollo/client/react` entry point — importing
 * them from `@apollo/client` is what broke under v4, not React 19.
 */
export function useOptimisticMutation(
    mutation: DocumentNode,
    policyName: keyof typeof optimisticUpdatePolicies,
    options?: useMutation.Options<any, any>
) {
    const policy = optimisticUpdatePolicies[policyName];

    return useMutation(mutation, {
        ...options,
        optimisticResponse: policy.optimisticResponse,
        update: 'update' in policy ? policy.update : options?.update,
    });
}
