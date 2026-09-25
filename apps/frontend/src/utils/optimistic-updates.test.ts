import { optimisticUpdatePolicies } from './optimistic-updates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCreateVars(overrides?: Partial<{ amount: number; users: any[] }>) {
  const users = overrides?.users ?? [
    { role: 'buyer', wallet_address: 'GBUY111' },
    { role: 'seller', wallet_address: 'GSEL222' },
  ];
  return {
    input: {
      amount: overrides?.amount ?? 100,
      escrow_transaction_users: {
        data: users,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// createEscrowTransaction — optimisticResponse
// ---------------------------------------------------------------------------

describe('optimisticUpdatePolicies.createEscrowTransaction.optimisticResponse', () => {
  it('returns the correct top-level shape', () => {
    const vars = makeCreateVars();
    const result = optimisticUpdatePolicies.createEscrowTransaction.optimisticResponse(vars);

    expect(result).toHaveProperty('insert_escrow_transactions_one');
    const escrow = result.insert_escrow_transactions_one;
    expect(escrow.__typename).toBe('escrow_transactions');
    expect(escrow.status).toBe('pending');
    expect(escrow.created_at).toBeDefined();
  });

  it('generates a temp id prefixed with "temp-"', () => {
    const vars = makeCreateVars();
    const result = optimisticUpdatePolicies.createEscrowTransaction.optimisticResponse(vars);
    expect(result.insert_escrow_transactions_one.id).toMatch(/^temp-/);
  });

  it('uses the amount from variables', () => {
    const vars = makeCreateVars({ amount: 350 });
    const result = optimisticUpdatePolicies.createEscrowTransaction.optimisticResponse(vars);
    expect(result.insert_escrow_transactions_one.amount).toBe(350);
  });

  it('maps escrow_transaction_users correctly from variables', () => {
    const users = [
      { role: 'buyer', wallet_address: 'GBUY_WALLET' },
      { role: 'seller', wallet_address: 'GSELL_WALLET' },
    ];
    const vars = makeCreateVars({ users });
    const result = optimisticUpdatePolicies.createEscrowTransaction.optimisticResponse(vars);
    const txUsers = result.insert_escrow_transactions_one.escrow_transaction_users;

    expect(txUsers).toHaveLength(2);

    expect(txUsers[0].__typename).toBe('escrow_transaction_users');
    expect(txUsers[0].role).toBe('buyer');
    expect(txUsers[0].wallet_address).toBe('GBUY_WALLET');
    expect(txUsers[0].funding_status).toBe('pending');
    expect(txUsers[0].id).toMatch(/^temp-user-/);

    expect(txUsers[1].role).toBe('seller');
    expect(txUsers[1].wallet_address).toBe('GSELL_WALLET');
  });

  it('produces unique temp ids for each user', () => {
    const users = [
      { role: 'buyer', wallet_address: 'W1' },
      { role: 'seller', wallet_address: 'W2' },
    ];
    const vars = makeCreateVars({ users });
    const result = optimisticUpdatePolicies.createEscrowTransaction.optimisticResponse(vars);
    const ids = result.insert_escrow_transactions_one.escrow_transaction_users.map(
      (u: any) => u.id
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// updateFundingStatus — optimisticResponse
// ---------------------------------------------------------------------------

describe('optimisticUpdatePolicies.updateFundingStatus.optimisticResponse', () => {
  const baseVars = {
    escrowUserId: 'user-abc-123',
    fundingStatus: 'funded',
    transactionHash: '0xdeadbeef',
  };

  it('returns the correct top-level key', () => {
    const result = optimisticUpdatePolicies.updateFundingStatus.optimisticResponse(baseVars);
    expect(result).toHaveProperty('update_escrow_transaction_users_by_pk');
  });

  it('echoes back escrowUserId as id', () => {
    const result = optimisticUpdatePolicies.updateFundingStatus.optimisticResponse(baseVars);
    expect(result.update_escrow_transaction_users_by_pk.id).toBe('user-abc-123');
  });

  it('echoes back fundingStatus', () => {
    const result = optimisticUpdatePolicies.updateFundingStatus.optimisticResponse(baseVars);
    expect(result.update_escrow_transaction_users_by_pk.funding_status).toBe('funded');
  });

  it('echoes back transactionHash', () => {
    const result = optimisticUpdatePolicies.updateFundingStatus.optimisticResponse(baseVars);
    expect(result.update_escrow_transaction_users_by_pk.transaction_hash).toBe('0xdeadbeef');
  });

  it('sets __typename to escrow_transaction_users', () => {
    const result = optimisticUpdatePolicies.updateFundingStatus.optimisticResponse(baseVars);
    expect(result.update_escrow_transaction_users_by_pk.__typename).toBe('escrow_transaction_users');
  });

  it('nested escrow_transaction has status funding_in_progress', () => {
    const result = optimisticUpdatePolicies.updateFundingStatus.optimisticResponse(baseVars);
    const nested = result.update_escrow_transaction_users_by_pk.escrow_transaction;
    expect(nested.__typename).toBe('escrow_transactions');
    expect(nested.status).toBe('funding_in_progress');
  });

  it('funded_at is a valid ISO date string', () => {
    const result = optimisticUpdatePolicies.updateFundingStatus.optimisticResponse(baseVars);
    const { funded_at } = result.update_escrow_transaction_users_by_pk;
    expect(() => new Date(funded_at)).not.toThrow();
    expect(new Date(funded_at).toISOString()).toBe(funded_at);
  });
});

// ---------------------------------------------------------------------------
// createEscrowTransaction — update (cache updater)
// ---------------------------------------------------------------------------

describe('optimisticUpdatePolicies.createEscrowTransaction.update', () => {
  function makeMockCache() {
    const writeFragment = jest.fn().mockReturnValue({ __ref: 'EscrowRef:1' });
    const modify = jest.fn().mockImplementation(({ fields }) => {
      // Call the escrow_transactions field updater with an empty existing array
      // so we can assert the return value
      if (fields.escrow_transactions) {
        fields.escrow_transactions([]);
      }
    });
    return { modify, writeFragment };
  }

  it('calls cache.modify when data contains the new escrow', () => {
    const cache = makeMockCache();
    const newEscrow = {
      __typename: 'escrow_transactions',
      id: 'temp-123',
      amount: 100,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    optimisticUpdatePolicies.createEscrowTransaction.update(cache, {
      data: { insert_escrow_transactions_one: newEscrow },
    });

    expect(cache.modify).toHaveBeenCalledTimes(1);
  });

  it('calls cache.writeFragment with the new escrow data', () => {
    const cache = makeMockCache();
    const newEscrow = {
      __typename: 'escrow_transactions',
      id: 'temp-456',
      amount: 200,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    optimisticUpdatePolicies.createEscrowTransaction.update(cache, {
      data: { insert_escrow_transactions_one: newEscrow },
    });

    expect(cache.writeFragment).toHaveBeenCalledTimes(1);
    const [writeCall] = cache.writeFragment.mock.calls;
    expect(writeCall[0].data).toEqual(newEscrow);
    expect(writeCall[0].fragment).toBeDefined(); // gql DocumentNode
  });

  it('prepends the new ref to the existing escrow list', () => {
    const existingRef = { __ref: 'EscrowRef:old' };
    const newRef = { __ref: 'EscrowRef:new' };

    const writeFragment = jest.fn().mockReturnValue(newRef);
    let capturedUpdater: ((existing: any[]) => any[]) | null = null;
    const modify = jest.fn().mockImplementation(({ fields }) => {
      capturedUpdater = fields.escrow_transactions;
    });
    const cache = { modify, writeFragment };

    const newEscrow = {
      __typename: 'escrow_transactions',
      id: 'temp-789',
      amount: 50,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    optimisticUpdatePolicies.createEscrowTransaction.update(cache, {
      data: { insert_escrow_transactions_one: newEscrow },
    });

    expect(capturedUpdater).not.toBeNull();
    const updatedList = capturedUpdater!([existingRef]);
    expect(updatedList[0]).toEqual(newRef);
    expect(updatedList[1]).toEqual(existingRef);
  });

  it('skips update (rollback guard) when insert_escrow_transactions_one is null', () => {
    const cache = makeMockCache();

    optimisticUpdatePolicies.createEscrowTransaction.update(cache, {
      data: { insert_escrow_transactions_one: null },
    });

    expect(cache.modify).not.toHaveBeenCalled();
    expect(cache.writeFragment).not.toHaveBeenCalled();
  });

  it('skips update (rollback guard) when insert_escrow_transactions_one is undefined', () => {
    const cache = makeMockCache();

    optimisticUpdatePolicies.createEscrowTransaction.update(cache, {
      data: { insert_escrow_transactions_one: undefined },
    });

    expect(cache.modify).not.toHaveBeenCalled();
    expect(cache.writeFragment).not.toHaveBeenCalled();
  });

  it('skips update (rollback guard) when data itself has no escrow key', () => {
    const cache = makeMockCache();

    optimisticUpdatePolicies.createEscrowTransaction.update(cache, {
      data: {},
    });

    expect(cache.modify).not.toHaveBeenCalled();
    expect(cache.writeFragment).not.toHaveBeenCalled();
  });
});
