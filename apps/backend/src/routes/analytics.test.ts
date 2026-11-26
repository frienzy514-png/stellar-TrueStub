/**
 * Tests for GET /api/analytics — platform analytics aggregation.
 * (closes #633)
 *
 * Covers:
 *  1. The pure aggregation helpers (currencyOf / amountOf / rawAmountOf /
 *     releaseDurationHours) — unit tests.
 *  2. The mounted analytics route — date-range validation, the empty-data
 *     case, multi-asset / multi-status fixtures, and a 502 on backend failure.
 *
 * The Hasura transport is mocked so the route's fetchEscrows (which paginates
 * hasuraClient.request in pages of PAGE_SIZE = 500) returns fixture rows. Each
 * fixture set has fewer than 500 rows, so exactly one request call happens per
 * fetch and the pagination loop stops after the first page.
 */

jest.mock('../lib/hasura', () => ({ hasuraClient: { request: jest.fn() } }));

import { hasuraClient } from '../lib/hasura';
import request from 'supertest';
import express from 'express';
import {
  analyticsRouter,
  analyticsCache,
  amountOf,
  rawAmountOf,
  releaseDurationHours,
  currencyOf,
} from './analytics';

const requestMock = hasuraClient.request as jest.Mock;

// EscrowRow is module-private in analytics.ts; this structurally-identical
// type lets the test build rows the exported helpers accept.
type Row = {
  amount: number | string;
  currency: string | null;
  status: string;
  created_at: string;
  released_at: string | null;
};

// Builds an EscrowRow-shaped fixture, letting overrides (including null
// currency / released_at) flow through. Cast `as Row` so the literal is
// accepted by the helper signatures.
function row(overrides: Partial<Row> = {}): Row {
  return {
    amount: '0',
    currency: 'USD',
    status: 'completed',
    created_at: '2026-01-01T00:00:00Z',
    released_at: null,
    ...overrides,
  } as Row;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRouter);
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helpers (pure unit tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics aggregation helpers', () => {
  describe('amountOf', () => {
    it('returns the numeric amount for dollar-denominated currencies', () => {
      expect(amountOf(row({ amount: '100', currency: 'USD' }))).toBe(100);
      expect(amountOf(row({ amount: '50', currency: 'USDC' }))).toBe(50);
    });

    it('returns 0 for non-dollar-denominated currencies', () => {
      expect(amountOf(row({ amount: '200', currency: 'EUR' }))).toBe(0);
    });

    it('returns 0 when the currency is null', () => {
      expect(amountOf(row({ amount: '100', currency: null }))).toBe(0);
    });

    it('returns 0 when the amount is not a finite number (NaN guard)', () => {
      expect(amountOf(row({ amount: 'not-a-number', currency: 'USD' }))).toBe(0);
    });
  });

  describe('rawAmountOf', () => {
    it('returns the numeric amount regardless of currency', () => {
      expect(rawAmountOf(row({ amount: '100' }))).toBe(100);
      expect(rawAmountOf(row({ amount: 50 }))).toBe(50);
    });

    it('returns 0 when the amount is not a finite number', () => {
      expect(rawAmountOf(row({ amount: 'not-a-number' }))).toBe(0);
    });
  });

  describe('releaseDurationHours', () => {
    it('returns elapsed hours for a completed escrow', () => {
      const r = row({
        status: 'completed',
        created_at: '2026-01-01T10:00:00Z',
        released_at: '2026-01-01T12:00:00Z',
      });
      expect(releaseDurationHours(r)).toBe(2);
    });

    it('returns the correct positive hours for a released escrow with a later released_at', () => {
      const r = row({
        status: 'released',
        created_at: '2026-01-01T00:00:00Z',
        released_at: '2026-01-02T00:00:00Z',
      });
      expect(releaseDurationHours(r)).toBe(24);
    });

    it('returns null for a pending escrow even if released_at is set', () => {
      const r = row({
        status: 'pending',
        created_at: '2026-01-01T10:00:00Z',
        released_at: '2026-01-01T12:00:00Z',
      });
      expect(releaseDurationHours(r)).toBeNull();
    });

    it('returns null for a completed escrow with no released_at', () => {
      const r = row({ status: 'completed', released_at: null });
      expect(releaseDurationHours(r)).toBeNull();
    });

    it('returns null when released_at is earlier than created_at', () => {
      const r = row({
        status: 'completed',
        created_at: '2026-01-01T12:00:00Z',
        released_at: '2026-01-01T10:00:00Z',
      });
      expect(releaseDurationHours(r)).toBeNull();
    });

    it('returns null for invalid date strings', () => {
      const r = row({
        status: 'completed',
        created_at: 'not-a-date',
        released_at: 'also-not-a-date',
      });
      expect(releaseDurationHours(r)).toBeNull();
    });
  });

  describe('currencyOf', () => {
    it('upper-cases and trims a currency code', () => {
      expect(currencyOf(row({ currency: 'usd' }))).toBe('USD');
      expect(currencyOf(row({ currency: '  Usdc ' }))).toBe('USDC');
    });

    it('returns UNKNOWN for an empty currency', () => {
      expect(currencyOf(row({ currency: '' }))).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for a null currency', () => {
      expect(currencyOf(row({ currency: null }))).toBe('UNKNOWN');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mounted route (integration tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/analytics (mounted route)', () => {
  let app: express.Express;

  beforeEach(() => {
    requestMock.mockReset();
    analyticsCache.clear();
    app = buildApp();
  });

  describe('date-range validation', () => {
    it('rejects an invalid start date with 400 and never calls Hasura', async () => {
      const res = await request(app).get('/api/analytics').query({
        start: 'not-a-date',
        end: '2026-01-02T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('rejects a range where start is after end with 400 and never calls Hasura', async () => {
      const res = await request(app).get('/api/analytics').query({
        start: '2026-01-02T00:00:00.000Z',
        end: '2026-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('rejects a range longer than 366 days with 400 and never calls Hasura', async () => {
      const res = await request(app).get('/api/analytics').query({
        start: '2024-01-01T00:00:00.000Z',
        end: '2026-01-02T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
      expect(requestMock).not.toHaveBeenCalled();
    });
  });

  describe('empty data', () => {
    it('returns a single all-zero bucket and hasData false', async () => {
      requestMock.mockResolvedValue({ escrow_transactions: [] });

      const res = await request(app).get('/api/analytics').query({
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T23:59:59.999Z',
      });

      expect(res.status).toBe(200);
      expect(res.body.hasData).toBe(false);

      // A single UTC-day bucket with every numeric field at zero.
      expect(res.body.escrowChartData).toHaveLength(1);
      const bucket = res.body.escrowChartData[0];
      expect(bucket.volume).toBe(0);
      expect(bucket.escrowsCreated).toBe(0);
      expect(bucket.escrowsCompleted).toBe(0);
      expect(bucket.disputes).toBe(0);
      expect(bucket.disputeRate).toBe(0);
      expect(bucket.avgReleaseHours).toBe(0);

      expect(res.body.assetBreakdown).toEqual([]);
      expect(res.body.platformHealth.activeEscrows).toBe(0);
      expect(res.body.platformHealth.totalCreated).toBe(0);
      expect(res.body.platformHealth.completionRate).toBe(0);
    });
  });

  describe('multi-asset / multi-status fixtures', () => {
    it('aggregates daily volume, disputes, asset breakdown and platform health', async () => {
      // periodRows — returned by the first fetchEscrows (created_at range).
      const periodRows = [
        { amount: '100', currency: 'USD', status: 'completed', created_at: '2026-01-01T10:00:00Z', released_at: '2026-01-01T12:00:00Z' },
        { amount: '50', currency: 'USDC', status: 'disputed', created_at: '2026-01-01T11:00:00Z', released_at: null },
        { amount: '200', currency: 'EUR', status: 'pending', created_at: '2026-01-02T09:00:00Z', released_at: null },
      ];
      // activeRows — returned by the second fetchEscrows (status _in active).
      const activeRows = [
        { amount: '10', currency: 'USD', status: 'active', created_at: '2026-01-01T00:00:00Z', released_at: null },
        { amount: '5', currency: 'USDC', status: 'pending', created_at: '2026-01-01T00:00:00Z', released_at: null },
      ];

      // Promise.all issues the period call first, then the active call.
      requestMock
        .mockResolvedValueOnce({ escrow_transactions: periodRows }) // period (created_at range) call first
        .mockResolvedValueOnce({ escrow_transactions: activeRows }); // active (status _in) call second
      requestMock.mockResolvedValue({ escrow_transactions: [] }); // safety: any extra call returns empty

      const res = await request(app).get('/api/analytics').query({
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-02T23:59:59.999Z',
      });

      expect(res.status).toBe(200);
      expect(res.body.hasData).toBe(true);

      // Two daily buckets (2026-01-01 and 2026-01-02).
      expect(res.body.escrowChartData).toHaveLength(2);

      const day1 = res.body.escrowChartData[0];
      expect(day1.volume).toBe(150); // USD 100 + USDC 50; EUR excluded from volume
      expect(day1.escrowsCreated).toBe(2);
      expect(day1.escrowsCompleted).toBe(1);
      expect(day1.disputes).toBe(1);
      expect(day1.disputeRate).toBe(50);
      expect(day1.avgReleaseHours).toBe(2);

      const day2 = res.body.escrowChartData[1];
      expect(day2.escrowsCreated).toBe(1);
      expect(day2.disputes).toBe(0);
      expect(day2.disputeRate).toBe(0);

      // Asset breakdown sorted by currency ascending: EUR, USD, USDC.
      expect(
        res.body.assetBreakdown.map((entry: { currency: string }) => entry.currency),
      ).toEqual(['EUR', 'USD', 'USDC']);

      const usd = res.body.assetBreakdown.find(
        (entry: { currency: string }) => entry.currency === 'USD',
      );
      expect(usd.escrowsCreated).toBe(1);
      expect(usd.escrowsCompleted).toBe(1);
      expect(usd.completedVolume).toBe(100);

      const eur = res.body.assetBreakdown.find(
        (entry: { currency: string }) => entry.currency === 'EUR',
      );
      expect(eur.escrowsCreated).toBe(1);
      expect(eur.escrowsCompleted).toBe(0);

      const health = res.body.platformHealth;
      expect(health.totalVolumeUsd).toBe(150);
      expect(health.activeEscrows).toBe(2);
      expect(health.totalCreated).toBe(3);
      expect(health.totalCompleted).toBe(1);
      expect(health.totalDisputes).toBe(1);
      expect(health.totalValueLockedUsd).toBe(15); // USD 10 + USDC 5
      expect(health.avgReleaseHours).toBe(2);
      expect(health.completionRate).toBeGreaterThan(33);
      expect(health.completionRate).toBeLessThan(34);
    });
  });

  describe('USD/USDC-denominated headline totals (mixed-asset labelling)', () => {
    // The headline volume/TVL figures are deliberately USD/USDC-scoped
    // (#627): non-dollar escrows must NOT silently inflate them. This test
    // pins that contract with mixed-asset data — a non-dollar escrow is
    // excluded from totalVolumeUsd/totalValueLockedUsd while its real amount
    // is preserved in the per-asset breakdown.
    it('excludes non-USD/USDC escrows from the headline totals but keeps them in the asset breakdown', async () => {
      // periodRows — created in range, across three currencies.
      const periodRows = [
        { amount: '100', currency: 'USD', status: 'completed', created_at: '2026-01-01T10:00:00Z', released_at: '2026-01-01T12:00:00Z' },
        { amount: '1000', currency: 'XLM', status: 'pending', created_at: '2026-01-01T11:00:00Z', released_at: null },
        { amount: '5000', currency: 'EURC', status: 'pending', created_at: '2026-01-01T11:30:00Z', released_at: null },
      ];
      // activeRows — include a non-dollar active escrow so TVL excludes it.
      const activeRows = [
        { amount: '10', currency: 'USDC', status: 'pending', created_at: '2026-01-01T00:00:00Z', released_at: null },
        { amount: '2000', currency: 'XLM', status: 'active', created_at: '2026-01-01T00:00:00Z', released_at: null },
      ];

      requestMock
        .mockResolvedValueOnce({ escrow_transactions: periodRows }) // period (created_at range) call first
        .mockResolvedValueOnce({ escrow_transactions: activeRows }); // active (status _in) call second
      requestMock.mockResolvedValue({ escrow_transactions: [] }); // safety: any extra call returns empty

      const res = await request(app).get('/api/analytics').query({
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T23:59:59.999Z',
      });

      expect(res.status).toBe(200);

      // Headline USD/USDC totals: XLM 1000 and EURC 5000 are NOT summed in,
      // and the XLM 2000 active escrow does NOT count toward TVL.
      expect(res.body.platformHealth.totalVolumeUsd).toBe(100); // USD only
      expect(res.body.platformHealth.totalValueLockedUsd).toBe(10); // USDC only; XLM active excluded
      expect(res.body.platformHealth.activeEscrows).toBe(2);

      // The per-asset breakdown preserves every currency's real amount.
      const byCurrency = Object.fromEntries(
        res.body.assetBreakdown.map(
          (entry: { currency: string; volume: number }) => [entry.currency, entry.volume],
        ),
      );
      expect(byCurrency.USD).toBe(100);
      expect(byCurrency.XLM).toBe(1000);
      expect(byCurrency.EURC).toBe(5000);
    });
  });

  describe('backend failure', () => {
    it('returns 502 when the Hasura request rejects', async () => {
      requestMock.mockRejectedValue(new Error('down'));

      const res = await request(app).get('/api/analytics').query({
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-02T00:00:00.000Z',
      });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('Failed to load platform analytics');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache behaviour (issue #624)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/analytics — caching (closes #624)', () => {
  let app: express.Express;

  beforeEach(() => {
    requestMock.mockReset();
    analyticsCache.clear();
    app = buildApp();
  });

  it('a second request for the same date range does NOT re-query Hasura (cache HIT)', async () => {
    requestMock.mockResolvedValue({ escrow_transactions: [] });

    const params = {
      start: '2026-02-01T00:00:00.000Z',
      end: '2026-02-01T23:59:59.999Z',
    };

    // First request — should call Hasura (once for period rows, once for active).
    const first = await request(app).get('/api/analytics').query(params);
    expect(first.status).toBe(200);
    expect(requestMock).toHaveBeenCalledTimes(2); // period + active calls

    requestMock.mockReset();

    // Second request with identical params — should be served from cache.
    const second = await request(app).get('/api/analytics').query(params);
    expect(second.status).toBe(200);
    expect(requestMock).not.toHaveBeenCalled(); // no Hasura call
    expect(second.headers['x-cache']).toBe('HIT');
  });

  it('a first request sets X-Cache: MISS', async () => {
    requestMock.mockResolvedValue({ escrow_transactions: [] });

    const res = await request(app).get('/api/analytics').query({
      start: '2026-03-01T00:00:00.000Z',
      end: '2026-03-01T23:59:59.999Z',
    });

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('different date ranges are cached independently', async () => {
    requestMock.mockResolvedValue({ escrow_transactions: [] });

    await request(app).get('/api/analytics').query({
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-04-01T23:59:59.999Z',
    });
    await request(app).get('/api/analytics').query({
      start: '2026-04-02T00:00:00.000Z',
      end: '2026-04-02T23:59:59.999Z',
    });

    // Each distinct range triggers its own Hasura queries (2 calls each = 4 total).
    expect(requestMock).toHaveBeenCalledTimes(4);
  });

  it('a 502 (Hasura failure) is NOT cached — the next request re-queries', async () => {
    requestMock.mockRejectedValueOnce(new Error('down'));

    const params = {
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-05-01T23:59:59.999Z',
    };

    const failed = await request(app).get('/api/analytics').query(params);
    expect(failed.status).toBe(502);
    expect(requestMock).toHaveBeenCalledTimes(2); // attempted but failed

    requestMock.mockReset();
    requestMock.mockResolvedValue({ escrow_transactions: [] });

    // The retry must hit Hasura again — the error must not have been cached.
    const retry = await request(app).get('/api/analytics').query(params);
    expect(retry.status).toBe(200);
    expect(requestMock).toHaveBeenCalled();
  });
});
