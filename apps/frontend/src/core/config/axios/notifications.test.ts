/**
 * Unit tests for src/core/config/axios/notifications.ts
 *
 * Verifies:
 * - Each function calls its own distinct endpoint (not the same copy-pasted URL).
 * - All three functions go through the shared http client (http.ts), NOT bare axios.
 * - The escrowId is forwarded as a query param on every call.
 */

import {
  checkPendingNotifications,
  checkMilestoneUpdates,
  checkDisputeNotifications,
} from "./notifications";
import http from "./http";

// ── mock the shared http client ───────────────────────────────────────────────
jest.mock("./http", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const mockGet = http.get as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  // Return a simple resolved value so the functions don't reject
  mockGet.mockResolvedValue({ data: { ok: true } });
});

// ── checkPendingNotifications ─────────────────────────────────────────────────
describe("checkPendingNotifications", () => {
  it("calls the check-pending endpoint via the shared http client", async () => {
    await checkPendingNotifications("escrow-abc");

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/notifications/test/check-pending", {
      params: { escrowId: "escrow-abc" },
    });
  });

  it("returns the data field from the response", async () => {
    mockGet.mockResolvedValueOnce({ data: { notifications: [] } });
    const result = await checkPendingNotifications("escrow-abc");
    expect(result).toEqual({ notifications: [] });
  });
});

// ── checkMilestoneUpdates ─────────────────────────────────────────────────────
describe("checkMilestoneUpdates", () => {
  it("calls the check-milestone-updates endpoint via the shared http client", async () => {
    await checkMilestoneUpdates("escrow-def");

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      "/notifications/test/check-milestone-updates",
      { params: { escrowId: "escrow-def" } }
    );
  });

  it("does NOT call the check-pending endpoint (regression guard)", async () => {
    await checkMilestoneUpdates("escrow-def");
    const [calledUrl] = mockGet.mock.calls[0];
    expect(calledUrl).not.toBe("/notifications/test/check-pending");
  });

  it("returns the data field from the response", async () => {
    mockGet.mockResolvedValueOnce({ data: { milestones: [] } });
    const result = await checkMilestoneUpdates("escrow-def");
    expect(result).toEqual({ milestones: [] });
  });
});

// ── checkDisputeNotifications ─────────────────────────────────────────────────
describe("checkDisputeNotifications", () => {
  it("calls the check-dispute-notifications endpoint via the shared http client", async () => {
    await checkDisputeNotifications("escrow-ghi");

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      "/notifications/test/check-dispute-notifications",
      { params: { escrowId: "escrow-ghi" } }
    );
  });

  it("does NOT call the check-pending endpoint (regression guard)", async () => {
    await checkDisputeNotifications("escrow-ghi");
    const [calledUrl] = mockGet.mock.calls[0];
    expect(calledUrl).not.toBe("/notifications/test/check-pending");
  });

  it("returns the data field from the response", async () => {
    mockGet.mockResolvedValueOnce({ data: { disputes: [] } });
    const result = await checkDisputeNotifications("escrow-ghi");
    expect(result).toEqual({ disputes: [] });
  });
});

// ── all three endpoints are distinct ─────────────────────────────────────────
describe("endpoint uniqueness across all three functions", () => {
  it("each function hits a different URL", async () => {
    await checkPendingNotifications("e1");
    await checkMilestoneUpdates("e2");
    await checkDisputeNotifications("e3");

    const urls = mockGet.mock.calls.map(([url]: [string]) => url);
    expect(new Set(urls).size).toBe(3); // all three must be distinct
  });
});
