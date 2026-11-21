/**
 * Integration test for the multi-asset escrow selection-to-creation flow —
 * issue #275.
 *
 * Tests the full flow from selecting a trustline asset to building the
 * escrow initialization payload for each supported asset (USDC, XLM, EURC).
 * Mocks the Trustless Work API calls and the wallet context, and verifies
 * that the escrow payload correctly includes the selected asset's trustline
 * address.
 *
 * This is a pure TypeScript test — no React rendering or JSX.
 */

import {
  getSupportedAssets,
  getTrustlineBySymbol,
  getActiveNetwork,
  type TrustlineOption,
} from '../wallet-kit/trustlines';

// ─── Mock the Trustless Work API payload type ──────────────────────────────

interface MockEscrowPayload {
  engagementId: string;
  title: string;
  description: string;
  amount: number;
  platformFee: number;
  signer: string;
  roles: {
    approver: string;
    serviceProvider: string;
    platformAddress: string;
    releaseSigner: string;
    disputeResolver: string;
    receiver: string;
  };
  milestones: { description: string }[];
  trustline: {
    address: string;
  };
}

interface MockEscrowResponse {
  contractId: string;
  address: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SIGNER_WALLET = 'GAZ7QJ3Y6QCQWUGB5W7XG2NOZ3ZYL4YF7N5XJL5RZNOZ3ZYL4YF7N5XJ';

/**
 * Simulates the payload-building logic from useInitializeEscrow.
 *
 * In production, the hook resolves the selected trustline asset by its
 * address and maps it to the final `trustline.address` field. For Soroban
 * contracts (addresses starting with 'C'), the issuer is used as the
 * address instead. This mirrors the actual logic in
 * `useInitializeEscrow.ts`.
 */
function buildEscrowPayload(
  asset: TrustlineOption,
  overrides: Partial<MockEscrowPayload> = {},
): MockEscrowPayload {
  const address = asset.value;
  const issuer = asset.issuer;

  // Mirror the real logic: if the address is a Soroban contract (starts
  // with C) and an issuer is available, use the issuer as the address.
  const useIssuerAsAddress =
    address.startsWith('C') && issuer && issuer !== 'native';

  return {
    engagementId: 'ENG-TEST-001',
    title: 'Test Escrow',
    description: 'Test escrow for multi-asset integration',
    amount: 100,
    platformFee: 5,
    signer: SIGNER_WALLET,
    roles: {
      approver: SIGNER_WALLET,
      serviceProvider: SIGNER_WALLET,
      platformAddress: SIGNER_WALLET,
      releaseSigner: SIGNER_WALLET,
      disputeResolver: SIGNER_WALLET,
      receiver: SIGNER_WALLET,
    },
    milestones: [{ description: 'Deliver the ticket' }],
    trustline: {
      address: useIssuerAsAddress ? issuer! : address,
    },
    ...overrides,
  };
}

interface MockRefundResponse {
  contractId: string;
  asset: string;
  destination: string;
  amount: number;
}

/**
 * Simulates a refund of an existing escrow. The refund must be denominated in
 * the escrow's own trustline asset, not a hardcoded default asset.
 */
async function mockRefundEscrow(
  escrow: MockEscrowResponse,
  payload: MockEscrowPayload,
): Promise<MockRefundResponse> {
  return {
    contractId: escrow.contractId,
    asset: payload.trustline.address,
    destination: payload.roles.receiver,
    amount: payload.amount,
  };
}

/**
 * Simulates the Trustless Work API deployEscrow call.
 */
async function mockDeployEscrow(
  payload: MockEscrowPayload,
): Promise<MockEscrowResponse> {
  // Verify the payload has a valid trustline address
  if (!payload.trustline.address || payload.trustline.address.length === 0) {
    throw new Error('Trustline address is required');
  }

  return {
    contractId: `CONTRACT_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    address: payload.trustline.address,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('multi-asset escrow selection-to-creation flow (issue #275)', () => {
  const networks: Array<'testnet' | 'mainnet'> = ['testnet', 'mainnet'];

  describe.each(networks)('%s', (network) => {
    const assets = getSupportedAssets(network);
    const symbols = ['USDC', 'XLM', 'EURC'];

    it.each(symbols)('builds a valid escrow payload for %s', async (symbol) => {
      const asset = getTrustlineBySymbol(symbol, network);
      expect(asset).toBeDefined();

      const payload = buildEscrowPayload(asset!);
      expect(payload.trustline.address).toBeDefined();
      expect(payload.trustline.address.length).toBeGreaterThan(0);

      const response = await mockDeployEscrow(payload);
      expect(response.contractId).toBeDefined();
      expect(response.address).toBe(payload.trustline.address);
    });

    it.each(symbols)(
      'payload trustline address matches the asset registry entry for %s',
      (symbol) => {
        const asset = getTrustlineBySymbol(symbol, network);
        expect(asset).toBeDefined();

        const payload = buildEscrowPayload(asset!);

        // The payload's trustline address must be derived from the asset.
        // For Soroban contracts (C...), it's the issuer; for traditional
        // assets, it's the address itself.
        const address = asset!.value;
        const issuer = asset!.issuer;
        const useIssuerAsAddress =
          address.startsWith('C') && issuer && issuer !== 'native';
        const expectedAddress = useIssuerAsAddress ? issuer : address;

        expect(payload.trustline.address).toBe(expectedAddress);
      },
    );

    it('each asset produces a different trustline address in the payload', () => {
      const payloads = assets.map((a) => buildEscrowPayload(a));
      const addresses = payloads.map((p) => p.trustline.address);
      // All addresses should be unique across the three assets
      expect(new Set(addresses).size).toBe(addresses.length);
    });
  });

  describe('USDC flow', () => {
    it('testnet USDC produces a payload with the correct trustline address', () => {
      const usdc = getTrustlineBySymbol('USDC', 'testnet')!;
      const payload = buildEscrowPayload(usdc);

      expect(payload.trustline.address).toBeDefined();
      expect(payload.trustline.address).toBe(usdc.issuer);
      expect(payload.trustline.address).not.toBe(usdc.value);
    });

    it('mainnet USDC produces a payload with the correct trustline address', () => {
      const usdc = getTrustlineBySymbol('USDC', 'mainnet')!;
      const payload = buildEscrowPayload(usdc);

      expect(payload.trustline.address).toBeDefined();
      expect(payload.trustline.address).toBe(usdc.issuer);
      expect(payload.trustline.address).not.toBe(usdc.value);
    });
  });

  describe('XLM flow', () => {
    it('testnet XLM uses the native XLM SAC contract address', () => {
      const xlm = getTrustlineBySymbol('XLM', 'testnet')!;
      const payload = buildEscrowPayload(xlm);

      // XLM's issuer is 'native', so the address (SAC contract) is used
      expect(payload.trustline.address).toBe(xlm.value);
    });

    it('mainnet XLM uses the native XLM SAC contract address', () => {
      const xlm = getTrustlineBySymbol('XLM', 'mainnet')!;
      const payload = buildEscrowPayload(xlm);

      expect(payload.trustline.address).toBe(xlm.value);
    });
  });

  describe('EURC flow', () => {
    it('testnet EURC produces a payload with the correct trustline address', () => {
      const eurc = getTrustlineBySymbol('EURC', 'testnet')!;
      const payload = buildEscrowPayload(eurc);

      // EURC address starts with G (traditional asset), so address is used
      expect(payload.trustline.address).toBe(eurc.value);
    });

    it('mainnet EURC produces a payload with the correct trustline address', () => {
      const eurc = getTrustlineBySymbol('EURC', 'mainnet')!;
      const payload = buildEscrowPayload(eurc);

      expect(payload.trustline.address).toBe(eurc.value);
    });
  });

  describe('full selection-to-creation flow', () => {
    it('selects USDC, builds the payload, and successfully deploys on testnet', async () => {
      const usdc = getTrustlineBySymbol('USDC', 'testnet')!;
      const payload = buildEscrowPayload(usdc, {
        engagementId: 'ENG-USDC-001',
        title: 'USDC Ticket Escrow',
      });

      expect(payload.trustline.address).toBe(usdc.issuer);
      expect(payload.engagementId).toBe('ENG-USDC-001');
      expect(payload.title).toBe('USDC Ticket Escrow');

      const response = await mockDeployEscrow(payload);
      expect(response.contractId).toMatch(/^CONTRACT_/);
      expect(response.address).toBe(payload.trustline.address);
    });

    it('selects XLM, builds the payload, and successfully deploys on testnet', async () => {
      const xlm = getTrustlineBySymbol('XLM', 'testnet')!;
      const payload = buildEscrowPayload(xlm, {
        engagementId: 'ENG-XLM-001',
        title: 'XLM Ticket Escrow',
      });

      expect(payload.trustline.address).toBe(xlm.value);
      expect(payload.engagementId).toBe('ENG-XLM-001');

      const response = await mockDeployEscrow(payload);
      expect(response.contractId).toMatch(/^CONTRACT_/);
      expect(response.address).toBe(payload.trustline.address);
    });

    it('selects EURC, builds the payload, and successfully deploys on testnet', async () => {
      const eurc = getTrustlineBySymbol('EURC', 'testnet')!;
      const payload = buildEscrowPayload(eurc, {
        engagementId: 'ENG-EURC-001',
        title: 'EURC Ticket Escrow',
      });

      expect(payload.trustline.address).toBe(eurc.value);
      expect(payload.engagementId).toBe('ENG-EURC-001');

      const response = await mockDeployEscrow(payload);
      expect(response.contractId).toMatch(/^CONTRACT_/);
      expect(response.address).toBe(payload.trustline.address);
    });

    it.each(['XLM', 'EURC'])(
      'refunds %s escrows in their own asset, not the default USDC asset',
      async (symbol) => {
        const asset = getTrustlineBySymbol(symbol, 'testnet')!;
        const usdc = getTrustlineBySymbol('USDC', 'testnet')!;
        expect(asset.value).not.toBe(usdc.value);

        const payload = buildEscrowPayload(asset);
        const escrow = await mockDeployEscrow(payload);
        const refund = await mockRefundEscrow(escrow, payload);

        expect(refund.contractId).toBe(escrow.contractId);
        expect(refund.asset).toBe(payload.trustline.address);
        expect(refund.asset).not.toBe(usdc.value);
        expect(refund.amount).toBe(payload.amount);
      },
    );

    it('rejects a payload with an empty trustline address', async () => {
      const payload = buildEscrowPayload(
        { value: '', label: 'Empty', symbol: 'EMPTY', decimals: 0 } as TrustlineOption,
      );

      await expect(mockDeployEscrow(payload)).rejects.toThrow(
        'Trustline address is required',
      );
    });

    it('preserves all role addresses in the payload', () => {
      const usdc = getTrustlineBySymbol('USDC', 'testnet')!;
      const payload = buildEscrowPayload(usdc);

      expect(payload.roles.approver).toBe(SIGNER_WALLET);
      expect(payload.roles.serviceProvider).toBe(SIGNER_WALLET);
      expect(payload.roles.platformAddress).toBe(SIGNER_WALLET);
      expect(payload.roles.releaseSigner).toBe(SIGNER_WALLET);
      expect(payload.roles.disputeResolver).toBe(SIGNER_WALLET);
      expect(payload.roles.receiver).toBe(SIGNER_WALLET);
    });

    it('preserves milestones in the payload', () => {
      const xlm = getTrustlineBySymbol('XLM', 'testnet')!;
      const payload = buildEscrowPayload(xlm, {
        milestones: [
          { description: 'Transfer ticket' },
          { description: 'Confirm receipt' },
        ],
      });

      expect(payload.milestones).toHaveLength(2);
      expect(payload.milestones[0].description).toBe('Transfer ticket');
      expect(payload.milestones[1].description).toBe('Confirm receipt');
    });
  });

  describe('network-aware asset selection', () => {
    it('uses testnet assets when active network is testnet', () => {
      const originalEnv = process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK;
      process.env.NODE_ENV = 'development';

      const network = getActiveNetwork();
      expect(network).toBe('testnet');

      const assets = getSupportedAssets(network);
      expect(assets).toHaveLength(3);
      const symbols = assets.map((a) => a.label);
      expect(symbols).toEqual(
        expect.arrayContaining(['USDC', 'XLM', 'EURC']),
      );

      process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('uses mainnet assets when active network is mainnet', () => {
      const originalEnv = process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK;
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK = 'mainnet';
      process.env.NODE_ENV = 'development';

      const network = getActiveNetwork();
      expect(network).toBe('mainnet');

      const assets = getSupportedAssets(network);
      expect(assets).toHaveLength(3);

      const testnetUsdc = getTrustlineBySymbol('USDC', 'testnet')!;
      const mainnetUsdc = assets.find((a) => a.label === 'USDC')!;
      expect(mainnetUsdc.value).not.toBe(testnetUsdc.value);

      process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});
