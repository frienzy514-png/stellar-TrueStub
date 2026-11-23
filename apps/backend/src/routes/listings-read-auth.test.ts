/**
 * Audit: `requireAuthForWrites` on `/api/listings` (issue #551)
 *
 * The router is mounted behind `requireAuthForWrites`, which lets GET/HEAD/OPTIONS
 * through unauthenticated. These tests confirm that every GET sub-route registered
 * on `listingsRouter` is reachable without a token (i.e. it is intentionally public),
 * and that every write route still requires a valid token.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../lib/firebase-admin', () => ({
  firebaseAuth: { verifyIdToken: jest.fn() },
}));

jest.mock('../openapi/registry', () => ({ registerRoute: jest.fn() }), { virtual: true });

jest.mock('../services/listing-fraud.service', () => ({ assessListingRisk: jest.fn() }));
jest.mock('../services/listing-alert.service', () => ({
  listingAlertService: {
    notifyNewListing: jest.fn(),
    notifySavedSearchMatches: jest.fn(),
    notifyListingUpdate: jest.fn(),
  },
}));
jest.mock('../services/hasura.service', () => ({
  HasuraService: { deleteTicketListing: jest.fn() },
}));
jest.mock('../services/listing-deletion.service', () => ({
  cleanupListingDependentDocuments: jest.fn(),
}));

import { firebaseAuth } from '../lib/firebase-admin';
import { requireAuthForWrites } from '../middleware/auth';
import { listingsRouter } from './listings';

const mockedVerify = firebaseAuth.verifyIdToken as jest.Mock;

/** Mirrors index.ts: `app.use("/api/listings", requireAuthForWrites, listingsRouter)`. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/listings', requireAuthForWrites, listingsRouter);
  return app;
}

/** Collects the method + path of every route registered directly on the router. */
function registeredRoutes(): Array<{ method: string; path: string }> {
  const stack = (listingsRouter as unknown as { stack: any[] }).stack;
  return stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route.methods).map((method) => ({ method, path: layer.route.path as string })),
    );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedVerify.mockRejectedValue(new Error('no token'));
});

describe('/api/listings read/write auth audit (#551)', () => {
  it('every GET sub-route is reachable without a token (not blanket-blocked by the mount)', async () => {
    const getRoutes = registeredRoutes().filter((r) => r.method === 'get');
    const app = buildApp();

    for (const route of getRoutes) {
      const res = await request(app).get(`/api/listings${route.path}`);
      expect(res.status).not.toBe(401);
    }
  });

  it('every write sub-route rejects an unauthenticated request with 401', async () => {
    const writeRoutes = registeredRoutes().filter((r) => ['post', 'patch', 'delete'].includes(r.method));
    expect(writeRoutes.length).toBeGreaterThan(0);
    const app = buildApp();

    for (const route of writeRoutes) {
      const path = route.path.replace(/:[^/]+/g, 'sample-id');
      const res = await request(app)[route.method as 'post' | 'patch' | 'delete'](`/api/listings${path}`).send({});
      expect(res.status).toBe(401);
    }
  });

  it('a GET request with a valid token is still served', async () => {
    mockedVerify.mockResolvedValue({ uid: 'user-1' });
    const res = await request(buildApp()).get('/api/listings/does-not-exist').set('Authorization', 'Bearer ok');
    expect(res.status).not.toBe(401);
  });
});
