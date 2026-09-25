# tw-blocks Providers

Context providers used by the Trustless Work escrow blocks under
`src/components/tw-blocks/`. Each provider owns exactly one piece of state;
none of them duplicate state held by another.

## Responsibilities

| Provider | File | Owns | Consumer hook |
|---|---|---|---|
| `ReactQueryClientProvider` | `ReactQueryClientProvider.tsx` | The TanStack `QueryClient` — **only when no ancestor provides one**; otherwise it reuses the app-wide client from `src/providers/QueryProvider.tsx` | `useQueryClient` (TanStack) |
| `TrustlessWorkProvider` | `TrustlessWork.tsx` → re-exports `@/lib/trustless-work/provider` | Trustless Work SDK config (base URL + API key), resolved once in `@/lib/trustless-work/config` | SDK hooks from `@trustless-work/escrow` |
| `EscrowProvider` | `EscrowProvider.tsx` | The currently **selected escrow** object (persisted to `localStorage`) and the connected user's roles in it | `useEscrowContext` |
| `EscrowAmountProvider` | `EscrowAmountProvider.tsx` | **Derived UI amounts only**: receiver / platform-fee / Trustless Work split of a total, dispute-resolution inputs and the MoonPay amount | `useEscrowAmountContext` |
| `EscrowDialogsProvider` | `EscrowDialogsProvider.tsx` | Open/closed state of the escrow detail and success-release dialogs | `useEscrowDialogs` |

### Why `EscrowProvider` and `EscrowAmountProvider` are not duplicates

`EscrowProvider` stores the escrow as returned by the indexer, including its
on-chain `amount`. `EscrowAmountProvider` never stores the escrow or its amount;
it only holds the *breakdown* computed by `setAmounts(total, platformFee)` for
display, plus transient form inputs used while resolving a dispute. Keep new
escrow fields in `EscrowProvider` and new display-only calculations in
`EscrowAmountProvider`.

### One query cache

`ClientProviders` already mounts an app-wide `QueryProvider`. Previously
`ReactQueryClientProvider` always created a second `QueryClient`, so escrow
blocks had a separate cache from the rest of the app. It now detects an
ancestor client and passes through, creating its own only for standalone use.

### SDK config has a single source

`TrustlessWork.tsx` used to resolve `NEXT_PUBLIC_API_KEY` /
`NEXT_PUBLIC_TRUSTLESS_API_URL(_DEV)` itself, duplicating
`@/lib/trustless-work/config`. It now re-exports the lib provider so both import
paths share one implementation.

> Note: `src/providers/TrustlessWorkProvider.tsx` (mounted in `app/layout.tsx`)
> is a pass-through stub for skeleton mode and does **not** configure the SDK.
> Escrow flows must mount the real provider from this folder (or
> `@/lib/trustless-work`) themselves, as shown below.

## Required nesting order

Outer → inner:

```tsx
<ReactQueryClientProvider>        {/* 1. query cache – needed by SDK hooks & tanstack queries */}
  <TrustlessWorkProvider>         {/* 2. SDK config – needed by any SDK hook */}
    <WalletProvider>              {/* 3. wallet (src/components/tw-blocks/wallet-kit) – signer address */}
      <EscrowProvider>            {/* 4. selected escrow – read by escrow action blocks */}
        <EscrowAmountProvider>    {/* 5. optional – only for blocks that show amount breakdowns */}
          <EscrowDialogsProvider> {/* 6. optional – only for blocks that open escrow dialogs */}
            {children}
          </EscrowDialogsProvider>
        </EscrowAmountProvider>
      </EscrowProvider>
    </WalletProvider>
  </TrustlessWorkProvider>
</ReactQueryClientProvider>
```

- (1) and (2) must wrap anything that calls a Trustless Work SDK hook.
- (4) must wrap any block that calls `useEscrowContext` (all
  `escrows/single-multi-release/*` blocks and the `initialize-escrow` forms).
- (1) and (3) are already mounted app-wide by `src/providers/ClientProviders.tsx`
  (`QueryProvider`, `WalletProvider`); an escrow flow rendered inside the app
  only strictly needs (2) and (4) and up.
- (5) and (6) have no dependencies on each other and can be omitted when no
  descendant uses `useEscrowAmountContext` / `useEscrowDialogs`. They are
  currently not mounted anywhere in the app.

Reference usage: `src/components/ticket-purchase/TicketEscrowWrapper.tsx`.
