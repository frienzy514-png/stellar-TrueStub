// frontend-TrueStub/src/core/store/data/index.ts

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { AuthenticationGlobalStore } from "./@types/authentication.entity";
import {
  readStoredWalletAuth,
  useGlobalAuthenticationSlice,
} from "./slices/authentication.slice";

export const useGlobalAuthenticationStore = create<AuthenticationGlobalStore>()(
  devtools(useGlobalAuthenticationSlice, { name: "AuthenticationStore" })
);

export function hydrateWalletAuthFromStorage(): void {
  const current = useGlobalAuthenticationStore.getState();
  if (current.address) {
    return;
  }
  const stored = readStoredWalletAuth();
  if (stored.address) {
    useGlobalAuthenticationStore.setState({
      address: stored.address,
      name: stored.name,
      token: stored.token || current.token,
    });
  }
}

if (typeof window !== "undefined") {
  (
    window as unknown as {
      __TRUESTUB_AUTH_STORE__?: typeof useGlobalAuthenticationStore;
    }
  ).__TRUESTUB_AUTH_STORE__ = useGlobalAuthenticationStore;
}
