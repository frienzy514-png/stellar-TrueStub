import { useOptimisticMutation } from './useOptimisticMutation';
import { gql } from '@apollo/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DUMMY_MUTATION = gql`
  mutation DummyMutation($id: uuid!) {
    dummy(id: $id) {
      id
    }
  }
`;

// The hook is currently a stub (no React state / effects) so we can call it
// directly in tests without a React renderer.
// ---------------------------------------------------------------------------

describe('useOptimisticMutation (stub contract)', () => {
  it('returns a tuple of [function, result object]', () => {
    const result = useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction');

    const [mutate, resultObj] = result;

    expect(typeof mutate).toBe('function');
    expect(typeof resultObj).toBe('object');
    expect(resultObj).not.toBeNull();
  });

  it('result object has loading: false', () => {
    const [, resultObj] = useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction');
    expect(resultObj.loading).toBe(false);
  });

  it('result object has error: undefined', () => {
    const [, resultObj] = useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction');
    expect(resultObj.error).toBeUndefined();
  });

  it('result object has data: undefined', () => {
    const [, resultObj] = useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction');
    expect(resultObj.data).toBeUndefined();
  });

  it('the returned mutate function resolves without throwing', async () => {
    const [mutate] = useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction');
    await expect(mutate()).resolves.not.toThrow();
  });

  it('mutate function returns a resolved promise that resolves to undefined', async () => {
    const [mutate] = useOptimisticMutation(DUMMY_MUTATION, 'updateFundingStatus');
    const promise = mutate();

    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).resolves.toBeUndefined();
  });

  it('accepts optional options parameter without throwing', () => {
    expect(() => {
      useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction', {
        onCompleted: jest.fn(),
      });
    }).not.toThrow();
  });

  it('works with updateFundingStatus policy name', () => {
    const [mutate, resultObj] = useOptimisticMutation(DUMMY_MUTATION, 'updateFundingStatus');
    expect(typeof mutate).toBe('function');
    expect(resultObj.loading).toBe(false);
    expect(resultObj.error).toBeUndefined();
  });

  it('calling mutate multiple times does not throw', async () => {
    const [mutate] = useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction');
    await expect(Promise.all([mutate(), mutate(), mutate()])).resolves.toBeDefined();
  });

  it('result tuple has exactly two elements', () => {
    const result = useOptimisticMutation(DUMMY_MUTATION, 'createEscrowTransaction');
    expect(result).toHaveLength(2);
  });
});
