/**
 * `requireAuth` must verify ID tokens with revocation checking enabled, so a
 * disabled account's still-unexpired token is rejected (issue #553).
 */

import express from 'express';
import request from 'supertest';

const verifyIdToken = jest.fn();
jest.mock('../lib/firebase-admin', () => ({
  firebaseAuth: { verifyIdToken: (...args: unknown[]) => verifyIdToken(...args) },
}));

import { requireAuth } from './auth';

function buildApp() {
  const app = express();
  app.use('/protected', requireAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => verifyIdToken.mockReset());

describe('requireAuth — revoked / disabled users (#553)', () => {
  it('verifies the token with revocation checking enabled', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'user-1' });
    await request(buildApp()).get('/protected').set('Authorization', 'Bearer good');
    expect(verifyIdToken).toHaveBeenCalledWith('good', true);
  });

  it('returns 401 when the verifier reports the user as disabled or the token as revoked', async () => {
    for (const code of ['auth/user-disabled', 'auth/id-token-revoked']) {
      verifyIdToken.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
      const res = await request(buildApp()).get('/protected').set('Authorization', 'Bearer old');
      expect(res.status).toBe(401);
    }
  });
});
