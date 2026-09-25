/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

import { POST } from "./route";

function buildRequest(rawBody: string, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/webhooks/escrow-status", {
    method: "POST",
    body: rawBody,
    headers,
  });
}

function backendResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /webhooks/escrow-status (pass-through to apps/backend)", () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env = { ...originalEnv, BACKEND_URL: "http://backend.internal" };
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("forwards the raw body and signature header unchanged to the backend webhook", async () => {
    // Whitespace must survive, or the backend's HMAC check would fail.
    const rawBody = '{ "contractId": "contract-123",  "status": "completed" }';
    fetchMock.mockResolvedValue(
      backendResponse(200, { success: true, contractId: "contract-123", status: "completed", rowsUpdated: 1 }),
    );

    const response = await POST(buildRequest(rawBody, { "x-webhook-signature": "sha256=abc" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.internal/webhooks/escrow-status");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(rawBody);
    expect(init.headers).toMatchObject({ "x-webhook-signature": "sha256=abc" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, rowsUpdated: 1 });
  });

  it("relays the backend's rejection status (e.g. invalid signature)", async () => {
    fetchMock.mockResolvedValue(backendResponse(401, { error: "Invalid webhook signature" }));

    const response = await POST(
      buildRequest("{}", { "x-trustless-work-signature": "0".repeat(64) }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid webhook signature" });
  });

  it("relays a backend 500 so Trustless Work retries", async () => {
    fetchMock.mockResolvedValue(backendResponse(500, { error: "Failed to sync escrow status" }));

    const response = await POST(buildRequest("{}", { "x-trustless-work-signature": "sig" }));

    expect(response.status).toBe(500);
  });

  it("rejects a request with no signature header without calling the backend", async () => {
    const response = await POST(buildRequest(JSON.stringify({ status: "completed" })));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the backend is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await POST(buildRequest("{}", { "x-trustless-work-signature": "sig" }));

    expect(response.status).toBe(502);
  });

  it("returns 500 when BACKEND_URL is not configured", async () => {
    process.env = { ...originalEnv, BACKEND_URL: "" };

    const response = await POST(buildRequest("{}", { "x-trustless-work-signature": "sig" }));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
