/**
 * Jest tests for DisputeService state machine — issue #156
 *
 * Mirror of dispute.service.test.ts but using Jest's API so the backend's
 * jest config (testMatch: ["**\/*.jest.test.ts"]) picks them up.
 *
 * Covers: all valid transitions, all invalid transitions, final-state guard,
 * duplicate dispute guard, and state machine completeness.
 */

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

async function openDispute(service: DisputeService, overrides = {}) {
  return service.openDispute({ ...base, ...overrides });
}

describe("DisputeService — state machine (#156)", () => {
  // ── openDispute ────────────────────────────────────────────────────────
  describe("openDispute", () => {
    it("creates a dispute in OPEN state", async () => {
      const { service } = makeService();
      const d = await openDispute(service);

      expect(d.state).toBe("OPEN");
      expect(d.disputeId).toBe(base.disputeId);
      expect(d.openedAt).toBeTruthy();
    });

    it("throws DISPUTE_ALREADY_EXISTS for a duplicate disputeId", async () => {
      const { service } = makeService();
      await openDispute(service);

      await expect(openDispute(service)).rejects.toMatchObject({
        statusCode: 409,
        code: DISPUTE_ERROR_CODES.ALREADY_EXISTS,
      });
    });

    it("throws 400 when required fields are missing", async () => {
      const { service } = makeService();

      await expect(
        service.openDispute({ ...base, reason: "" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ── Valid transitions ──────────────────────────────────────────────────
  describe("valid transitions", () => {
    it("OPEN → escalate → ESCALATED", async () => {
      const { service } = makeService();
      await openDispute(service);
      const d = await service.transition(base.disputeId, "escalate");
      expect(d.state).toBe("ESCALATED");
    });

    it("OPEN → resolve → RESOLVED (sets resolvedAt)", async () => {
      const { service } = makeService();
      await openDispute(service);
      const d = await service.transition(base.disputeId, "resolve", { resolution: "Refund issued" });
      expect(d.state).toBe("RESOLVED");
      expect(d.resolvedAt).toBeTruthy();
      expect(d.resolution).toBe("Refund issued");
    });

    it("OPEN → withdraw → WITHDRAWN", async () => {
      const { service } = makeService();
      await openDispute(service);
      const d = await service.transition(base.disputeId, "withdraw");
      expect(d.state).toBe("WITHDRAWN");
    });

    it("ESCALATED → resolve → RESOLVED", async () => {
      const { service } = makeService();
      await openDispute(service);
      await service.transition(base.disputeId, "escalate");
      const d = await service.transition(base.disputeId, "resolve");
      expect(d.state).toBe("RESOLVED");
      expect(d.resolvedAt).toBeTruthy();
    });

    it("ESCALATED → withdraw → WITHDRAWN", async () => {
      const { service } = makeService();
      await openDispute(service);
      await service.transition(base.disputeId, "escalate");
      const d = await service.transition(base.disputeId, "withdraw");
      expect(d.state).toBe("WITHDRAWN");
    });
  });

  // ── Invalid transitions ────────────────────────────────────────────────
  describe("invalid transitions (explicit errors)", () => {
    it("OPEN → [no such event 'reopen'] → DISPUTE_INVALID_TRANSITION", async () => {
      const { service } = makeService();
      await openDispute(service);

      await expect(
        service.transition(base.disputeId, "reopen" as DisputeEvent)
      ).rejects.toMatchObject({
        statusCode: 422,
        code: DISPUTE_ERROR_CODES.INVALID_TRANSITION,
      });
    });

    it("ESCALATED → escalate (already escalated) → DISPUTE_INVALID_TRANSITION", async () => {
      const { service } = makeService();
      await openDispute(service);
      await service.transition(base.disputeId, "escalate");

      await expect(
        service.transition(base.disputeId, "escalate")
      ).rejects.toMatchObject({ code: DISPUTE_ERROR_CODES.INVALID_TRANSITION });
    });
  });

  // ── Final state guard ──────────────────────────────────────────────────
  describe("final state guard", () => {
    const FINAL_STATE_LIST: DisputeState[] = ["RESOLVED", "WITHDRAWN"];
    const EVENTS: DisputeEvent[] = ["escalate", "resolve", "withdraw"];

    for (const finalState of FINAL_STATE_LIST) {
      for (const event of EVENTS) {
        it(`${finalState} → ${event} → DISPUTE_ALREADY_FINAL`, async () => {
          const { service } = makeService();
          await openDispute(service);

          if (finalState === "RESOLVED") {
            await service.transition(base.disputeId, "resolve");
          } else {
            await service.transition(base.disputeId, "withdraw");
          }

          await expect(
            service.transition(base.disputeId, event)
          ).rejects.toMatchObject({
            statusCode: 409,
            code: DISPUTE_ERROR_CODES.ALREADY_FINAL,
          });
        });
      }
    }

    it("throws 404 for unknown disputeId", async () => {
      const { service } = makeService();

      await expect(
        service.transition("ghost", "resolve")
      ).rejects.toMatchObject({
        statusCode: 404,
        code: DISPUTE_ERROR_CODES.NOT_FOUND,
      });
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
            expect(result).not.toBeUndefined();
          } else {
            expect(result).toBeUndefined();
          }
        }
      }
    });

    it("FINAL_STATES contains exactly RESOLVED and WITHDRAWN", () => {
      expect(FINAL_STATES.has("RESOLVED")).toBe(true);
      expect(FINAL_STATES.has("WITHDRAWN")).toBe(true);
      expect(FINAL_STATES.size).toBe(2);
    });

    it("DISPUTE_TRANSITIONS has an entry for every known state", () => {
      for (const state of ALL_STATES) {
        expect(state in DISPUTE_TRANSITIONS).toBe(true);
      }
    });

    it("final states have no outgoing transitions in the table", () => {
      for (const state of FINAL_STATES) {
        expect(Object.keys(DISPUTE_TRANSITIONS[state])).toHaveLength(0);
      }
    });
  });
});
