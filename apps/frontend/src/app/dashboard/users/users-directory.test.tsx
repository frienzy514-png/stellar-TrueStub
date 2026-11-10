import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

let mockCurrentUser: { getIdToken: () => Promise<string> } | null = {
  getIdToken: jest.fn().mockResolvedValue("admin-jwt-token"),
};

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    cb(mockCurrentUser);
    return jest.fn();
  },
}));

jest.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { sanitizeManagedUser } from "@/lib/admin-users-api";
import UsersManagementPage from "@/app/dashboard/users/page";

describe("UsersManagementPage UI states (#499)", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = {
      getIdToken: jest.fn().mockResolvedValue("admin-jwt-token"),
    };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the loading state while the directory is being fetched", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<UsersManagementPage />);
    expect(screen.getByText("Loading user directory...")).toBeInTheDocument();
    expect(screen.queryByText("Sarah Connor")).not.toBeInTheDocument();
  });

  it("renders the unauthorized state when the caller lacks admin authorization", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Administrator access is required" }),
    });

    render(<UsersManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /administrator access required/i,
      );
    });
    expect(screen.queryByText("Sarah Connor")).not.toBeInTheDocument();
  });

  it("renders the error state and retries when the directory request fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "Hasura upstream unavailable" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          users: [
            sanitizeManagedUser({
              id: "usr-live-1",
              firstName: "Mateo",
              lastName: "Vargas",
              email: "mateo@truestub.io",
              role: "seller",
              status: "active",
              kycVerified: true,
              fullWalletAddress:
                "GASKQBX7ABCDEF1234567890MNOPQRSTUVWXYZ1234567890XN32",
              escrowsCount: 7,
              completedVolume: "$1,400 USDC",
              reputationScore: 4.8,
              totalReviews: 6,
              joinedDate: "2026-03-15",
            }),
          ],
        }),
      });

    render(<UsersManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /failed to load user directory/i,
      );
      expect(
        screen.getByText("Hasura upstream unavailable"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("Mateo Vargas")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sarah Connor")).not.toBeInTheDocument();
  });

  it("renders the empty state when no users exist in the authorized directory", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ users: [] }),
    });

    render(<UsersManagementPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No registered users found"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Sarah Connor")).not.toBeInTheDocument();
  });

  it("persists new users through POST /api/admin/users and updates the directory", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ users: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          user: {
            id: "usr-persisted-9",
            firstName: "Lucia",
            lastName: "Rojas",
            email: "lucia@truestub.io",
            phoneNumber: "+506 7000 0000",
            role: "seller",
            status: "active",
            kycVerified: true,
            walletAddress: "GBLM...9Y2A",
            fullWalletAddress:
              "GBLM9876543210ABCDEF1234567890MNOPQRSTUVWXYZ9Y2A",
            escrowsCount: 0,
            completedVolume: "$0 USDC",
            reputationScore: 5.0,
            totalReviews: 0,
            joinedDate: "2026-06-01",
          },
        }),
      });

    render(<UsersManagementPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No registered users found"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /add user/i }));

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Lucia" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Rojas" },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "lucia@truestub.io" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByText("Lucia Rojas")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/users",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
