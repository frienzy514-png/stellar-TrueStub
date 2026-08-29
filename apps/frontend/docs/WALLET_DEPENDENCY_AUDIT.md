# Wallet Dependency Audit — Issue #81

## Summary

`apps/frontend/package.json` included `ethers`, `@walletconnect/core`,
`@walletconnect/ethereum-provider`, `@walletconnect/utils`, and
`@reown/walletkit` as top-level dependencies. This doc records the
audit findings and the changes made to reduce their bundle impact.

---

## Are the EVM packages still needed?

TrueStub's primary escrow flow runs on **Stellar** via the TrustlessWork
API. However the wallet connection UI still exposes MetaMask and
WalletConnect options (for users who connect an EVM wallet to verify
identity or sign off-chain messages). The packages are therefore kept
but moved behind dynamic imports.

| Package | Needed? | Action taken |
|---------|---------|-------------|
| `ethers` (~800 KB) | Yes — MetaMask flow uses `BrowserProvider` | Dynamic import |
| `@walletconnect/ethereum-provider` (~500 KB) | Yes — WalletConnect flow | Dynamic import |
| `@walletconnect/core` | Transitive peer dep of the above | No change (not directly imported) |
| `@walletconnect/utils` | Transitive peer dep of the above | No change (not directly imported) |
| `@reown/walletkit` | No direct import found in source | Candidate for removal if unused |
| `stellar-sdk` | Yes — Stellar escrow service | Keep (Stellar is primary chain) |
| `@creit.tech/stellar-wallets-kit` | Yes — Freighter/Albedo/LOBSTR | Keep |

---

## Changes made

### `src/components/auth/wallet/hooks/metamask-wallet.hook.ts`

Replaced `import { ethers } from "ethers"` with a lazy loader:

```ts
async function getEthers() {
  const { ethers } = await import("ethers");
  return ethers;
}
```

Every call-site in the hook that previously used `ethers` directly now
calls `await getEthers()` at the point of use (inside `connectWallet`,
`switchNetwork`, `getBalance`). The public type surface still uses
`import type` from `ethers` so TypeScript types remain intact.

### `src/components/auth/wallet/components/MetaMaskWalletModal.tsx`

Same treatment — the static `import { ethers }` was replaced with the
lazy loader, called inside `connectMetaMask()`.

### `src/components/auth/wallet/utils/walletConnect.ts`

Replaced `import EthereumProvider from "@walletconnect/ethereum-provider"`
with a lazy loader:

```ts
async function getEthereumProvider() {
  const mod = await import("@walletconnect/ethereum-provider");
  return (mod.default ?? mod) as typeof EthereumProvider;
}
```

The WalletConnect provider is now only fetched when
`initializeWalletConnect()` is first called — i.e. when the user
opens the WalletConnect QR modal.

---

## Bundle impact

With these changes:

- Pages that never open a wallet modal load **without** ethers or
  WalletConnect in the bundle.
- Both libraries are fetched on-demand as a separate async chunk when
  the wallet modal is opened for the first time.
- Subsequent opens reuse the already-loaded chunk from the browser's
  module cache.

---

## Future: removing `@reown/walletkit`

`@reown/walletkit` appears in `package.json` but no `import` from it
was found in the source tree at the time of this audit. If this remains
true after the next feature cycle, remove it:

```bash
yarn workspace @truestub/frontend remove @reown/walletkit
```

Verify nothing breaks (`yarn build`) before merging.
