/**
 * Tests for DisputeService state machine — issue #156
 *
 * Covers: all valid transitions, all invalid transitions, final-state guard,
 * duplicate dispute guard, and state machine completeness.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DisputeService,
  InMemoryDisputeStore,
  DISPUTE_ERROR_CODES,
  DISPUTE_TRANSITIONS,
  FINAL_STATES,
  resolveTransition,
  type DisputeState,
  type DisputeEvent,
} from "./dispute.service";
import { AppError } from "../middleware/errorHandler";

function makeService() {
  const store = new InMemoryDisputeStore();
  return { service: new DisputeService(store), store };
}

const base = {
  disputeId: "dispute-001",
  escrowId: "escrow-abc",
  raisedBy: "buyer-1",
  reason: "Ticket never arrived",
};

// ── Helper: open a dispute ─────────────────────────────────────────────────
async function openDispute(service: DisputeService, overrides = {}) {
  return service.openDispute({ ...base, ...overrides });
}

describe("DisputeService — state machine (#156)", () => {
  // ── openDispute ────────────────────────────────────────────────────────
  describe("openDispute", () => {
    it("creates a dispute in OPEN state", async () => {
      const { service } = makeService();
      const d = await openDispute(service);

      assert.equal(d.state, "OPEN");
      assert.equal(d.disputeId, base.disputeId);
      assert.ok(d.openedAt);
    });

    it("throws DISPUTE_ALREADY_EXISTS for a duplicate disputeId", async () => {
      const { service } = makeService();
      await openDispute(service);

      await assert.rejects(
        () => openDispute(service),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 409);
          assert.equal((err as AppError).code, DISPUTE_ERROR_CODES.ALREADY_EXISTS);
          return true;
        }
      );
    });

    it("throws 400 when required fields are missing", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.openDispute({ ...base, reason: "" }),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 400);
          return true;
        }
      );
    });
  });

  // ── Valid transitions ──────────────────────────────────────────────────
  describe("valid transitions", () => {
    it("OPEN → escalate → ESCALATED", async () => {
      const { service } = makeService();
      await openDispute(service);
      const d = await service.transition(base.disputeId, "escalate");
      assert.equal(d.state, "ESCALATED");
    });

    it("OPEN → resolve → RESOLVED (sets resolvedAt)", async () => {
      const { service } = makeService();
      await openDispute(service);
      const d = await service.transition(base.disputeId, "resolve", { resolution: "Refund issued" });
      assert.equal(d.state, "RESOLVED");
      assert.ok(d.resolvedAt, "resolvedAt should be set");
      assert.equal(d.resolution, "Refund issued");
    });

    it("OPEN → withdraw → WITHDRAWN", async () => {
      const { service } = makeService();
      await openDispute(service);
      const d = await service.transition(base.disputeId, "withdraw");
      assert.equal(d.state, "WITHDRAWN");
    });

    it("ESCALATED → resolve → RESOLVED", async () => {
      const { service } = makeService();
      await openDispute(service);
      await service.transition(base.disputeId, "escalate");
      const d = await service.transition(base.disputeId, "resolve");
      assert.equal(d.state, "RESOLVED");
      assert.ok(d.resolvedAt);
    });

    it("ESCALATED → withdraw → WITHDRAWN", async () => {
      const { service } = makeService();
      await openDispute(service);
      await service.transition(base.disputeId, "escalate");
      const d = await service.transition(base.disputeId, "withdraw");
      assert.equal(d.state, "WITHDRAWN");
    });
  });

  // ── Invalid transitions ────────────────────────────────────────────────
  describe("invalid transitions (explicit errors)", () => {
    it("OPEN → [no such event 'reopen'] → DISPUTE_INVALID_TRANSITION", async () => {
      const { service } = makeService();
      await openDispute(service);

      await assert.rejects(
        () => service.transition(base.disputeId, "reopen" as DisputeEvent),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 422);
          assert.equal((err as AppError).code, DISPUTE_ERROR_CODES.INVALID_TRANSITION);
          return true;
        }
      );
    });

    it("ESCALATED → escalate (already escalated) → DISPUTE_INVALID_TRANSITION", async () => {
      const { service } = makeService();
      await openDispute(service);
      await service.transition(base.disputeId, "escalate");

      await assert.rejects(
        () => service.transition(base.disputeId, "escalate"),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).code, DISPUTE_ERROR_CODES.INVALID_TRANSITION);
          return true;
        }
      );
    });
  });

  // ── Final state guard ──────────────────────────────────────────────────
  describe("final state guard", () => {
    for (const finalState of ["RESOLVED", "WITHDRAWN"] as DisputeState[]) {
      for (const event of ["escalate", "resolve", "withdraw"] as DisputeEvent[]) {
        it(`${finalState} → ${event} → DISPUTE_ALREADY_FINAL`, async () => {
          const { service } = makeService();
          await openDispute(service);

          if (finalState === "RESOLVED") {
            await service.transition(base.disputeId, "resolve");
          } else {
            await service.transition(base.disputeId, "withdraw");
          }

          await assert.rejects(
            () => service.transition(base.disputeId, event),
            (err: unknown) => {
              assert.ok(err instanceof AppError);
              assert.equal((err as AppError).statusCode, 409);
              assert.equal((err as AppError).code, DISPUTE_ERROR_CODES.ALREADY_FINAL);
              return true;
            }
          );
        });
      }
    }

    it("throws 404 for unknown disputeId", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.transition("ghost", "resolve"),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 404);
          assert.equal((err as AppError).code, DISPUTE_ERROR_CODES.NOT_FOUND);
          return true;
        }
      );
    });
  });

  // ── State machine completeness ─────────────────────────────────────────
  describe("state machine completeness", () => {
    const ALL_STATES: DisputeState[] = ["OPEN", "ESCALATED", "RESOLVED", "WITHDRAWN"];
    const ALL_EVENTS: DisputeEvent[] = ["escalate", "resolve", "withdraw"];

    it("resolveTransition returns defined only for documented valid pairs", () => {
      const expectedValid = new Set([
        "OPEN:escalate",
        "OPEN:resolve",
        "OPEN:withdraw",
        "ESCALATED:resolve",
        "ESCALATED:withdraw",
      ]);

      for (const state of ALL_STATES) {
        for (const event of ALL_EVENTS) {
          const key = `${state}:${event}`;
          const result = resolveTransition(state, event);
          if (expectedValid.has(key)) {
            assert.ok(result !== undefined, `Expected ${key} to be a valid transition`);
          } else {
            assert.equal(result, undefined, `Expected ${key} to be an invalid transition`);
          }
        }
      }
    });

    it("FINAL_STATES contains exactly RESOLVED and WITHDRAWN", () => {
      assert.ok(FINAL_STATES.has("RESOLVED"));
      assert.ok(FINAL_STATES.has("WITHDRAWN"));
      assert.equal(FINAL_STATES.size, 2);
    });

    it("DISPUTE_TRANSITIONS has an entry for every known state", () => {
      for (const state of ALL_STATES) {
        assert.ok(
          state in DISPUTE_TRANSITIONS,
          `DISPUTE_TRANSITIONS is missing state: ${state}`
        );
      }
    });

    it("final states have no outgoing transitions in the table", () => {
      for (const state of FINAL_STATES) {
        const outgoing = Object.keys(DISPUTE_TRANSITIONS[state]);
        assert.equal(
          outgoing.length,
          0,
          `Final state ${state} should have 0 outgoing transitions, found: ${outgoing.join(", ")}`
        );
      }
    });
  });
});
