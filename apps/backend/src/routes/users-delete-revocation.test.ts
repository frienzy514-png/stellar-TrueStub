/**
 * DELETE /api/users/me must revoke the user's refresh tokens so existing
 * sessions are cut off immediately, not after their ID token expires (issue #554).
 */

import express from 'express';
import request from 'supertest';

jest.mock('../lib/openapi', () => ({ registerRoute: jest.fn() }), { virtual: true });

jest.mock('../lib/firebase-admin', () => ({
  firebaseAuth: {
    verifyIdToken: jest.fn(),
    deleteUser: jest.fn(),
    revokeRefreshTokens: jest.fn(),
  },
}));

jest.mock('../lib/hasura', () => ({ hasuraRequest: jest.fn() }));

jest.mock('../services/changelog.service', () => ({
  changelogService: {
    getEntry: jest.fn().mockResolvedValue(null),
    appendEntry: jest.fn().mockResolvedValue(undefined),
  },
}));

import { firebaseAuth } from '../lib/firebase-admin';
import { hasuraRequest } from '../lib/hasura';
import { usersRouter } from './users';

const mockedVerify = firebaseAuth.verifyIdToken as jest.Mock;
const mockedDeleteUser = firebaseAuth.deleteUser as jest.Mock;
const mockedRevoke = firebaseAuth.revokeRefreshTokens as jest.Mock;
const mockedHasura = hasuraRequest as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedVerify.mockResolvedValue({ uid: 'user-123', email: 'alice@example.com' });
  mockedHasura.mockResolvedValue({ update_users: { affected_rows: 1 } });
  mockedDeleteUser.mockResolvedValue(undefined);
  mockedRevoke.mockResolvedValue(undefined);
});

describe('DELETE /api/users/me — session revocation (#554)', () => {
  it('revokes the deleted user\'s refresh tokens', async () => {
    const res = await request(buildApp()).delete('/api/users/me').set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(mockedRevoke).toHaveBeenCalledWith('user-123');
  });

  it('revokes sessions before the Firebase account is deleted', async () => {
    const order: string[] = [];
    mockedRevoke.mockImplementation(async () => { order.push('revoke'); });
    mockedDeleteUser.mockImplementation(async () => { order.push('delete'); });

    await request(buildApp()).delete('/api/users/me').set('Authorization', 'Bearer valid');
    expect(order).toEqual(['revoke', 'delete']);
  });
});
