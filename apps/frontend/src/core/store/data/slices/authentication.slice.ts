import { StateCreator } from "zustand";
import { AuthenticationGlobalStore } from "../@types/authentication.entity";

const AUTHENTICATION_ACTIONS = {
  CONNECT_WALLET: "authentication/connect",
  SET_TOKEN: "authentication/set-token",
  DISCONNECT_WALLET: "authentication/disconnect",
} as const;

export const WALLET_STORAGE_KEY = "address-wallet";

export function readStoredWalletAuth(): {
  address: string;
  name: string;
  token: string;
} {
  if (typeof window === "undefined") {
    return { address: "", name: "", token: "" };
  }

  try {
    const raw = window.localStorage.getItem(WALLET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed?.state ?? parsed;
      if (state?.address) {
        return {
          address: String(state.address),
          name: String(state.name || "Freighter"),
          token: String(state.token || ""),
        };
      }
    }

    const directAddress = window.localStorage.getItem("walletAddress");
    const directName = window.localStorage.getItem("walletName");
    if (directAddress) {
      return {
        address: directAddress,
        name: directName || "Freighter",
        token: "",
      };
    }
  } catch {
    // Ignore malformed localStorage payloads
  }

  return { address: "", name: "", token: "" };
}

function persistWalletAuth(address: string, name: string, token = ""): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (address) {
      window.localStorage.setItem(
        WALLET_STORAGE_KEY,
        JSON.stringify({ state: { address, name, token } }),
      );
      window.localStorage.setItem("walletAddress", address);
      window.localStorage.setItem("walletName", name);
    } else {
      window.localStorage.removeItem(WALLET_STORAGE_KEY);
      window.localStorage.removeItem("walletAddress");
      window.localStorage.removeItem("walletName");
    }
  } catch {
    // Ignore storage write errors
  }
}

export const useGlobalAuthenticationSlice: StateCreator<
  AuthenticationGlobalStore,
  [["zustand/devtools", never]],
  [],
  AuthenticationGlobalStore
> = (set, get) => {
  const initial = readStoredWalletAuth();

  return {
    // Stores
    address: initial.address,
    name: initial.name,
    token: initial.token,

    // Modifiers
    connectWalletStore: async (address: string, name: string) => {
      persistWalletAuth(address, name, get().token);
      set({ address, name }, false, AUTHENTICATION_ACTIONS.CONNECT_WALLET);
    },

    setToken: (token: string) => {
      const current = get();
      if (current.address) {
        persistWalletAuth(current.address, current.name, token);
      }
      set({ token }, false, AUTHENTICATION_ACTIONS.SET_TOKEN);
    },

    disconnectWalletStore: () => {
      persistWalletAuth("", "", "");
      set(
        { address: "", name: "", token: "" },
        false,
        AUTHENTICATION_ACTIONS.DISCONNECT_WALLET,
      );
    },

    clearAuth: () => {
      persistWalletAuth("", "", "");
      set(
        { address: "", name: "", token: "" },
        false,
        AUTHENTICATION_ACTIONS.DISCONNECT_WALLET,
      );
    },
  };
};
