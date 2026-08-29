/**
 * Trustlines | Non-Native Tokens from Stellar
 *
 * @description Trustlines are the tokens that are used to pay for the escrow
 * @description The trustlines are filtered by the network
 * @description The trustlines are filtered by the network in the trustlineOptions
 *
 * ## Extending the asset list
 * To add a new asset, append an entry to the `trustlines` array below and
 * supply both a `testnet` and `mainnet` entry (or whichever networks apply).
 * Consumer code reads assets through `getSupportedAssets(network)` which
 * filters by the `network` field — no other changes are required.
 *
 * Note: For Soroban contracts, `address` is the contract address (starts with C)
 * For traditional assets, `issuer` is the Stellar account that issues the asset (starts with G)
 */
export const trustlines = [
  // TESTNET
  {
    name: "USDC",
    symbol: "USDC",
    address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", // Soroban contract
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", // USDC issuer on testnet
    decimals: 10000000,
    network: "testnet",
    icon: "💵",
    description: "USD Coin (Stablecoin)",
  },
  {
    name: "XLM",
    symbol: "XLM",
    address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", // Native XLM Soroban SAC contract
    issuer: "native",
    decimals: 10000000,
    network: "testnet",
    icon: "🚀",
    description: "Stellar Lumens (Native)",
  },
  {
    name: "EURC",
    symbol: "EURC",
    address: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
    issuer: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO", // Same as address for traditional assets
    decimals: 10000000,
    network: "testnet",
    icon: "💶",
    description: "Euro Coin (Stablecoin)",
  },
  // MAINNET
  {
    name: "USDC",
    symbol: "USDC",
    address: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", // Soroban contract
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", // USDC issuer on mainnet
    decimals: 10000000,
    network: "mainnet",
    icon: "💵",
    description: "USD Coin (Stablecoin)",
  },
  {
    name: "XLM",
    symbol: "XLM",
    address: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2SLH34QDHA4", // Native XLM Soroban SAC contract
    issuer: "native",
    decimals: 10000000,
    network: "mainnet",
    icon: "🚀",
    description: "Stellar Lumens (Native)",
  },
  {
    name: "EURC",
    symbol: "EURC",
    address: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
    issuer: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
    decimals: 10000000,
    network: "mainnet",
    icon: "💶",
    description: "Euro Coin (Stablecoin)",
  },
];

export interface TrustlineOption {
  value: string;
  label: string;
  symbol: string;
  issuer?: string;
  decimals: number;
  icon?: string;
  description?: string;
}

export const getSupportedAssets = (network = "testnet"): TrustlineOption[] => {
  return trustlines
    .filter((trustline) => trustline.network === network)
    .map((trustline) => ({
      value: trustline.address,
      label: trustline.name,
      symbol: trustline.symbol || trustline.name,
      issuer: trustline.issuer,
      decimals: trustline.decimals,
      icon: trustline.icon,
      description: trustline.description,
    }));
};

export const getTrustlineBySymbol = (symbol: string, network = "testnet"): TrustlineOption | undefined => {
  const asset = trustlines.find(
    (t) => (t.name.toUpperCase() === symbol.toUpperCase() || t.symbol?.toUpperCase() === symbol.toUpperCase()) && t.network === network
  );
  if (!asset) return undefined;
  return {
    value: asset.address,
    label: asset.name,
    symbol: asset.symbol || asset.name,
    issuer: asset.issuer,
    decimals: asset.decimals,
    icon: asset.icon,
    description: asset.description,
  };
};

export const trustlineOptions: TrustlineOption[] = getSupportedAssets("testnet");

// ---------------------------------------------------------------------------
// Network-aware helpers
// ---------------------------------------------------------------------------

/**
 * Return the active Stellar network ("testnet" | "mainnet") from the
 * NEXT_PUBLIC_TRUSTLESS_NETWORK environment variable, defaulting to
 * "testnet" in development and "mainnet" in production.
 *
 * Call this anywhere you need the network without importing from a context.
 */
export const getActiveNetwork = (): "testnet" | "mainnet" => {
  const fromEnv = process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK;
  if (fromEnv === "testnet" || fromEnv === "mainnet") return fromEnv;
  return process.env.NODE_ENV === "production" ? "mainnet" : "testnet";
};

/**
 * Return the supported assets for the currently active network.
 *
 * Prefer this over the static `trustlineOptions` constant so that
 * mainnet deployments automatically show mainnet assets.
 *
 * @example
 * const assets = getSupportedAssetsForActiveNetwork();
 * // → [{ value: "CCW67...", label: "USDC", ... }, ...]  on mainnet
 */
export const getSupportedAssetsForActiveNetwork = (): TrustlineOption[] =>
  getSupportedAssets(getActiveNetwork());

/**
 * Add a custom asset to the `trustlines` registry at runtime.
 *
 * This is the primary extension point for multi-asset escrow work (#94).
 * Pass a full asset definition and it will be available to all callers of
 * `getSupportedAssets(network)` and `getSupportedAssetsForActiveNetwork()`
 * for the remainder of the session.
 *
 * @param asset - Asset definition to register.
 *
 * @example
 * addTrustlineAsset({
 *   name: "yXLM",
 *   symbol: "yXLM",
 *   address: "CBIELTK6...",
 *   issuer: "GBUYYBXWCLT2MOSSHRFCKMEDFOVSCAXNIEW424GLN666OEXHAAWBDYMX",
 *   decimals: 10000000,
 *   network: "testnet",
 *   icon: "💫",
 *   description: "Yield-bearing XLM",
 * });
 */
export interface TrustlineAssetDefinition {
  name: string;
  symbol: string;
  address: string;
  issuer: string;
  decimals: number;
  network: "testnet" | "mainnet";
  icon?: string;
  description?: string;
}

export const addTrustlineAsset = (asset: TrustlineAssetDefinition): void => {
  // Prevent duplicate registrations (idempotent by address + network).
  const duplicate = trustlines.some(
    (t) => t.address === asset.address && t.network === asset.network,
  );
  if (!duplicate) {
    trustlines.push({
      ...asset,
      icon: asset.icon ?? "🪙",
      description: asset.description ?? "",
    });
  }
};

// ---------------------------------------------------------------------------
// React hook (client-side only)
// ---------------------------------------------------------------------------

import { useMemo } from "react";

/**
 * React hook that returns the trustline assets for a given network.
 *
 * Using this hook instead of the static `trustlineOptions` constant means
 * components automatically receive the correct assets when the network
 * changes, and pick up any assets registered via `addTrustlineAsset`.
 *
 * @param network - Override the network; defaults to `getActiveNetwork()`.
 *
 * @example
 * function AssetSelector() {
 *   const assets = useTrustlineAssets();
 *   return (
 *     <select>
 *       {assets.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
 *     </select>
 *   );
 * }
 */
export const useTrustlineAssets = (
  network?: "testnet" | "mainnet",
): TrustlineOption[] => {
  const resolvedNetwork = network ?? getActiveNetwork();
  return useMemo(
    () => getSupportedAssets(resolvedNetwork),
    // Re-compute only when the resolved network changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedNetwork],
  );
};

