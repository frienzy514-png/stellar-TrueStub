import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockGetIdToken = jest.fn();

jest.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return {
        getIdToken: mockGetIdToken,
      };
    },
  },
}));

import {
  registerSavedSearch,
  unregisterSavedSearch,
} from "@/lib/listing-alerts-api";
import { useSavedSearchStore } from "@/core/store/data/saved-searches.store";
import SavedSearchesPage from "@/app/dashboard/saved-searches/page";

describe("Saved searches backend deletion & store synchronization (#503)", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIdToken.mockResolvedValue("firebase-token-123");
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    useSavedSearchStore.setState({
      searches: [],
      pendingDeleteIds: [],
      lastError: null,
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("maps the backend serverId returned at registration onto the local saved search entry", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "server-search-001",
        eventName: "Coldplay",
        maxPrice: 250,
        section: "Floor",
      }),
    });

    const added = await useSavedSearchStore.getState().addSearch({
      eventName: "Coldplay",
      maxPrice: 250,
      section: "Floor",
    });

    expect(added.id).toBeTruthy();
    expect(added.id).not.toBe("server-search-001");
    expect(added.serverId).toBe("server-search-001");

    const stored = useSavedSearchStore.getState().searches;
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(added.id);
    expect(stored[0].serverId).toBe("server-search-001");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/saved-searches"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer firebase-token-123",
        }),
      }),
    );
  });

  it("deletes the backend record using the mapped serverId when removing a saved search", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "server-search-abc",
          eventName: "Hamilton",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

    const added = await useSavedSearchStore.getState().addSearch({
      eventName: "Hamilton",
    });

    const deleted = await useSavedSearchStore.getState().removeSearch(added.id);

    expect(deleted).toBe(true);
    expect(useSavedSearchStore.getState().searches).toHaveLength(0);
    expect(useSavedSearchStore.getState().pendingDeleteIds).toEqual([]);
    expect(useSavedSearchStore.getState().lastError).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/saved-searches\/server-search-abc$/),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer firebase-token-123",
        }),
      }),
    );
  });

  it("surfaces a failed backend delete, restores local state with retry tracking, and recovers on retry", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "server-search-fail-99",
          eventName: "Costa Rica vs Mexico",
          maxPrice: 120,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

    const added = await useSavedSearchStore.getState().addSearch({
      eventName: "Costa Rica vs Mexico",
      maxPrice: 120,
    });

    const firstAttempt = await useSavedSearchStore
      .getState()
      .removeSearch(added.id);

    expect(firstAttempt).toBe(false);
    expect(useSavedSearchStore.getState().lastError).toMatch(
      /failed to delete saved search/i,
    );
    expect(useSavedSearchStore.getState().pendingDeleteIds).toEqual([
      "server-search-fail-99",
    ]);
    expect(useSavedSearchStore.getState().searches).toHaveLength(1);
    expect(useSavedSearchStore.getState().searches[0].deleteError).toMatch(
      /failed to delete saved search/i,
    );

    const retryResult = await useSavedSearchStore
      .getState()
      .retryPendingDeletes();

    expect(retryResult).toBe(true);
    expect(useSavedSearchStore.getState().searches).toHaveLength(0);
    expect(useSavedSearchStore.getState().pendingDeleteIds).toEqual([]);
    expect(useSavedSearchStore.getState().lastError).toBeNull();
  });

  it("renders the saved-searches UI, surfaces delete failure alerts, and retries from the UI", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "srv-ui-777",
          eventName: "Burna Boy Live",
          maxPrice: 180,
          section: "VIP",
        }),
      })
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

    render(<SavedSearchesPage />);

    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Burna Boy Live" },
    });
    fireEvent.change(screen.getByLabelText("Max price in USDC"), {
      target: { value: "180" },
    });
    fireEvent.change(screen.getByLabelText("Section preference"), {
      target: { value: "VIP" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /save search & alert me/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Burna Boy Live")).toBeInTheDocument();
      expect(useSavedSearchStore.getState().searches[0]?.serverId).toBe(
        "srv-ui-777",
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /delete saved search for burna boy live/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /failed to delete saved search/i,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /retry delete/i }));

    await waitFor(() => {
      expect(screen.queryByText("Burna Boy Live")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("exposes registerSavedSearch and unregisterSavedSearch helpers directly", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: "srv-direct-1", eventName: "Direct Event" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

    const created = await registerSavedSearch({ eventName: "Direct Event" });
    expect(created?.id).toBe("srv-direct-1");

    const removed = await unregisterSavedSearch("srv-direct-1");
    expect(removed).toBe(true);
  });
});
