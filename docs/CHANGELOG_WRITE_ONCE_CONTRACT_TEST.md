# Changelog Write-Once Contract: PUT/PATCH → 409 `CHANGELOG_UPDATE_FORBIDDEN`

**Issue:** #606
**Area:** `apps/backend/src/routes/changelog.ts`

---

## 1. The contract

Changelog entries are write-once (issue #155). Any attempt to update an entry
must be rejected with exactly this response, for both `PUT` and `PATCH`:

| Field              | Value                              |
| ------------------ | ---------------------------------- |
| HTTP status        | `409 Conflict`                     |
| `error.code`       | `CHANGELOG_UPDATE_FORBIDDEN`       |
| `error.message`    | Explains that entries are write-once and how to correct one (DELETE then POST) |

```http
PUT /api/changelog/:entryId     → 409
PATCH /api/changelog/:entryId   → 409
```

```json
{
  "error": {
    "code": "CHANGELOG_UPDATE_FORBIDDEN",
    "message": "Changelog entries are write-once and cannot be updated. To correct an entry: DELETE it then POST a new one."
  }
}
```

The correct way to fix a wrong entry is:

1. `DELETE /api/changelog/:entryId`
2. `POST /api/changelog` with the corrected data

## 2. Current implementation

- The route handlers for `PUT` and `PATCH` in
  `apps/backend/src/routes/changelog.ts` each return the 409 response directly.
- The service layer (`apps/backend/src/services/changelog.service.ts`) exports
  `CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN = "CHANGELOG_UPDATE_FORBIDDEN"` and
  its `updateEntry` method always throws `AppError(409, CHANGELOG_UPDATE_FORBIDDEN)`.

**Note:** the route handlers hard-code the string `"CHANGELOG_UPDATE_FORBIDDEN"`
twice instead of using `CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN`. That is
exactly the kind of drift this test protects against — if someone renames the
constant, or edits one handler but not the other, the test should fail.

## 3. Why lock this in with a test

A refactor could keep "rejecting" updates while silently changing the
contract — for example:

- returning `405 Method Not Allowed` or `400` instead of `409`;
- removing the explicit routes so Express falls through to a `404`;
- dropping or renaming `error.code`, which clients match on;
- fixing `PUT` but not `PATCH` (or vice versa).

Each of these still looks like a rejection in manual testing, but breaks any
client that relies on the documented code.

## 4. Test to add

**Location:** `apps/backend/src/routes/changelog.test.ts` (or alongside the
existing changelog route tests).

For **both** `PUT` and `PATCH`:

1. Create an entry via `POST /api/changelog` so the target exists (this proves
   the 409 isn't a disguised "not found").
2. Send the update request with a valid-looking body.
3. Assert:
   - `res.status === 409` (exact, not just `>= 400`);
   - `res.body.error.code === CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN`;
   - `res.body.error.code === "CHANGELOG_UPDATE_FORBIDDEN"` (the literal, so
     renaming the constant also fails the test);
   - `res.body.error.message` is a non-empty string.
4. `GET` the entry afterwards and assert it is unchanged.

Also assert the same 409 for an `entryId` that does **not** exist — the
contract is "update is never allowed", not "update of an existing entry is
not allowed".

Sketch (supertest + the existing app factory):

```ts
import request from "supertest";
import { CHANGELOG_ERROR_CODES } from "../services/changelog.service";

describe.each(["put", "patch"] as const)("%s /api/changelog/:entryId", (method) => {
  it("returns 409 CHANGELOG_UPDATE_FORBIDDEN and leaves the entry untouched", async () => {
    const created = await request(app).post("/api/changelog").set(auth).send(validEntry);
    const id = created.body.entry.entryId;

    const res = await request(app)[method](`/api/changelog/${id}`).set(auth).send({ action: "changed" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CHANGELOG_UPDATE_FORBIDDEN");
    expect(res.body.error.code).toBe(CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN);
    expect(typeof res.body.error.message).toBe("string");

    const after = await request(app).get(`/api/changelog/${id}`).set(auth);
    expect(after.body.entry).toEqual(created.body.entry);
  });

  it("returns the same 409 for a nonexistent entry", async () => {
    const res = await request(app)[method]("/api/changelog/does-not-exist").set(auth).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CHANGELOG_UPDATE_FORBIDDEN");
  });
});
```

`/api/changelog` sits behind `requireAuth`, so the test must send valid auth
(or mock `authenticate`) — otherwise it will get a 401 and never reach the
handler.

## 5. Acceptance criteria

- [ ] A test asserts the exact `409` status and `CHANGELOG_UPDATE_FORBIDDEN`
      code for `PUT`.
- [ ] The same assertions run for `PATCH`.
- [ ] The test confirms the entry is unchanged after the rejected update.
