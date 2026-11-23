/**
 * Every HTTP method's handling by `requireAuthForWrites` (#531).
 *
 * Only GET, HEAD and OPTIONS may pass without a token. Every other method —
 * standard, WebDAV-style, unknown, or a non-canonical spelling of a read
 * method — must be treated as a write and require authentication, so the
 * allow-list fails closed.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const verifyIdToken = jest.fn();
jest.mock("../lib/firebase-admin", () => ({
  firebaseAuth: { verifyIdToken: (token: string) => verifyIdToken(token) },
}));

import { requireAuthForWrites } from "./auth";

function buildApp() {
  const app = express();
  app.use("/writes", requireAuthForWrites, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

type SupertestMethod = "get" | "head" | "options" | "post" | "put" | "patch" | "delete";

const READ_METHODS: SupertestMethod[] = ["get", "head", "options"];
const WRITE_METHODS: SupertestMethod[] = ["post", "put", "patch", "delete"];

beforeEach(() => verifyIdToken.mockReset());

describe("requireAuthForWrites over HTTP", () => {
  it.each(READ_METHODS)("lets an unauthenticated %s request through", async (method) => {
    const res = await request(buildApp())[method]("/writes");
    expect(res.status).toBe(200);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it.each(WRITE_METHODS)("rejects an unauthenticated %s request with 401", async (method) => {
    const res = await request(buildApp())[method]("/writes");
    expect(res.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it.each(WRITE_METHODS)("rejects a %s request with an invalid token with 401", async (method) => {
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    const res = await request(buildApp())[method]("/writes").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
    expect(verifyIdToken).toHaveBeenCalledWith("bad");
  });

  it.each(WRITE_METHODS)("allows a %s request with a valid token", async (method) => {
    verifyIdToken.mockResolvedValue({ uid: "user-1" });
    const res = await request(buildApp())[method]("/writes").set("Authorization", "Bearer good");
    expect(res.status).toBe(200);
  });
});

/**
 * Methods Node's HTTP parser or supertest won't send as-is (non-canonical
 * casing, unknown verbs). Call the middleware directly with a fake request so
 * the method string reaches it unchanged.
 */
describe("requireAuthForWrites with non-standard method strings", () => {
  function invoke(method: string) {
    const req = { method, headers: {} } as unknown as Request;
    const res = {
      locals: {},
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response & { status: jest.Mock; json: jest.Mock };
    const next = jest.fn() as unknown as NextFunction & jest.Mock;
    return { req, res, next };
  }

  it.each(["GET", "HEAD", "OPTIONS"])("passes the canonical read method %s", async (method) => {
    const { req, res, next } = invoke(method);
    await requireAuthForWrites(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    // Non-canonical spellings of read methods must not be treated as reads.
    "get",
    "Get",
    "head",
    "options",
    " GET",
    "GET ",
    // Write methods.
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    // Less common / WebDAV / unknown verbs.
    "TRACE",
    "CONNECT",
    "PURGE",
    "PROPFIND",
    "PROPPATCH",
    "MKCOL",
    "COPY",
    "MOVE",
    "LOCK",
    "UNLOCK",
    "SEARCH",
    "REPORT",
    "LINK",
    "UNLINK",
    "QUERY",
    "",
  ])("requires auth for method %p", async (method) => {
    const { req, res, next } = invoke(method);
    await requireAuthForWrites(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
