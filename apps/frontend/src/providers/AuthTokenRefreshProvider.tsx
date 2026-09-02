"use client";

import { useEffect } from "react";
import type React from "react";
import { startAuthTokenRefresh } from "@/lib/authTokenRefresh";

export function AuthTokenRefreshProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return startAuthTokenRefresh();
  }, []);

  return <>{children}</>;
}
