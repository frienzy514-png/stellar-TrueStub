import { auth } from "@/lib/firebase";
import {
  registerSavedSearch,
  registerWatch,
  unregisterWatch,
  notifyListingCreated,
} from "@/lib/listing-alerts-api";
import { fetchDisputeMetrics } from "@/lib/dispute-metrics-api";
import { fetchDisputeHistory } from "@/lib/dispute-history-api";

jest.mock("@/lib/firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: jest.fn().mockResolvedValue("test-id-token"),
    },
  },
}));

const mockFetch = jest.fn();

describe("backend API clients when the backend is unreachable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("keeps saved-search and watchlist actions best-effort when fetch rejects", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      registerSavedSearch({ eventName: "Concert" }),
    ).resolves.toBeUndefined();
    await expect(
      registerWatch({ listingId: "listing-1", eventName: "Concert", price: 50 }),
    ).resolves.toBeUndefined();
    await expect(unregisterWatch("listing-1")).resolves.toBeUndefined();
    await expect(
      notifyListingCreated({ id: "listing-1", eventName: "Concert", price: 50 }),
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("does not send alert requests when the user is signed out", async () => {
    (auth.currentUser as { getIdToken: jest.Mock }).getIdToken.mockResolvedValueOnce(undefined);

    await expect(
      registerSavedSearch({ eventName: "Concert" }),
    ).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("surfaces dispute-metrics network failures so the dashboard can show its retry state", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchDisputeMetrics(null)).rejects.toThrow("Failed to fetch");
  });

  it("surfaces non-success dispute-metrics responses", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(fetchDisputeMetrics(null)).rejects.toThrow(
      "Dispute metrics request failed (503)",
    );
  });

  it("surfaces dispute-history network failures so the table can show its error state", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      fetchDisputeHistory({ limit: 10, offset: 0 }),
    ).rejects.toThrow("Failed to fetch");
  });

  it("surfaces non-success dispute-history responses", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });

    await expect(
      fetchDisputeHistory({ limit: 10, offset: 0 }),
    ).rejects.toThrow("Dispute history request failed (502)");
  });
});
