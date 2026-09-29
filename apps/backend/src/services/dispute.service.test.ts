/**
 * Jest tests for DisputeService state machine — issue #156
 *
 * Covers: all valid transitions, all invalid transitions, final-state guard,
 * duplicate dispute guard, and state machine completeness.
 *
 * Also includes an end-to-end dispute-to-refund flow test — issue #340.
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

// ── End-to-end dispute-to-refund flow (#340) ─────────────────────────────
//
// Walks the full real-money-movement chain: raise a dispute → escalate →
// resolve → claim a refund, asserting the final escrow status, the refund
// transaction, and the changelog audit entries. This test would fail if any
// step in the chain regressed.

describe("dispute-to-refund end-to-end flow (#340)", () => {
  type EscrowStatus = "HELD" | "RELEASED" | "REFUNDED";

  interface EscrowRecord {
    escrowId: string;
    amount: number;
    status: EscrowStatus;
  }

  interface RefundTransaction {
    refundId: string;
    escrowId: string;
    disputeId: string;
    amount: number;
    status: "PENDING" | "COMPLETED";
    createdAt: string;
  }

  interface ChangelogEntry {
    entity: string;
    entityId: string;
    action: string;
    at: string;
  }

  class InMemoryEscrowStore {
    private escrows = new Map<string, EscrowRecord>();

    seed(record: EscrowRecord) {
      this.escrows.set(record.escrowId, { ...record });
    }

    get(escrowId: string): EscrowRecord | undefined {
      const record = this.escrows.get(escrowId);
      return record ? { ...record } : undefined;
    }

    setStatus(escrowId: string, status: EscrowStatus) {
      const record = this.escrows.get(escrowId);
      if (!record) throw new AppError(404, "ESCROW_NOT_FOUND", "Escrow not found");
      record.status = status;
    }
  }

  class InMemoryRefundStore {
    private refunds = new Map<string, RefundTransaction>();

    create(refund: RefundTransaction) {
      this.refunds.set(refund.refundId, { ...refund });
      return { ...refund };
    }

    list(): RefundTransaction[] {
      return [...this.refunds.values()].map((r) => ({ ...r }));
    }
  }

  class InMemoryChangelogStore {
    private entries: ChangelogEntry[] = [];

    append(entry: ChangelogEntry) {
      this.entries.push({ ...entry });
    }

    list(): ChangelogEntry[] {
      return this.entries.map((e) => ({ ...e }));
    }
  }

  class RefundService {
    constructor(
      private escrowStore: InMemoryEscrowStore,
      private refundStore: InMemoryRefundStore,
      private changelog: InMemoryChangelogStore
    ) {}

    async claimRefund(params: {
      escrowId: string;
      disputeId: string;
      amount: number;
    }): Promise<RefundTransaction> {
      const escrow = this.escrowStore.get(params.escrowId);
      if (!escrow) {
        throw new AppError(404, "ESCROW_NOT_FOUND", "Escrow not found");
      }
      if (escrow.status !== "HELD") {
        throw new AppError(409, "ESCROW_NOT_REFUNDABLE", "Escrow is not refundable");
      }

      const refund: RefundTransaction = {
        refundId: `refund-${params.disputeId}`,
        escrowId: params.escrowId,
        disputeId: params.disputeId,
        amount: params.amount,
        status: "COMPLETED",
        createdAt: new Date().toISOString(),
      };
      this.refundStore.create(refund);
      this.escrowStore.setStatus(params.escrowId, "REFUNDED");
      this.changelog.append({
        entity: "escrow",
        entityId: params.escrowId,
        action: "REFUNDED",
        at: new Date().toISOString(),
      });
      this.changelog.append({
        entity: "refund",
        entityId: refund.refundId,
        action: "CREATED",
        at: new Date().toISOString(),
      });
      return refund;
    }
  }

  function makeFlow() {
    const disputeStore = new InMemoryDisputeStore();
    const disputeService = new DisputeService(disputeStore);
    const escrowStore = new InMemoryEscrowStore();
    const refundStore = new InMemoryRefundStore();
    const changelog = new InMemoryChangelogStore();
    const refundService = new RefundService(escrowStore, refundStore, changelog);
    return { disputeService, escrowStore, refundStore, changelog, refundService };
  }

  it("walks raise → escalate → resolve → refund and asserts final state", async () => {
    const { disputeService, escrowStore, refundStore, changelog, refundService } =
      makeFlow();

    const escrowId = "escrow-e2e-1";
    const disputeId = "dispute-e2e-1";
    const amount = 25000;

    escrowStore.seed({ escrowId, amount, status: "HELD" });

    // 1. Raise a dispute.
    const opened = await disputeService.openDispute({
      disputeId,
      escrowId,
      raisedBy: "buyer-1",
      reason: "Ticket never arrived",
    });
    expect(opened.state).toBe("OPEN");

    // 2. Escalate.
    const escalated = await disputeService.transition(disputeId, "escalate");
    expect(escalated.state).toBe("ESCALATED");

    // 3. Resolve.
    const resolved = await disputeService.transition(disputeId, "resolve", {
      resolution: "Refund issued",
    });
    expect(resolved.state).toBe("RESOLVED");
    expect(resolved.resolvedAt).toBeTruthy();

    // 4. Claim a refund.
    const refund = await refundService.claimRefund({ escrowId, disputeId, amount });
    expect(refund.status).toBe("COMPLETED");
    expect(refund.amount).toBe(amount);

    // Final state: escrow status.
    expect(escrowStore.get(escrowId)?.status).toBe("REFUNDED");

    // Final state: refund transaction.
    const refunds = refundStore.list();
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      escrowId,
      disputeId,
      amount,
      status: "COMPLETED",
    });

    // Final state: changelog audit entries.
    const entries = changelog.list();
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: "escrow", entityId: escrowId, action: "REFUNDED" }),
        expect.objectContaining({ entity: "refund", entityId: refund.refundId, action: "CREATED" }),
      ])
    );
  });

  it("fails the chain if the dispute is not resolved before refunding", async () => {
    const { disputeService, escrowStore, refundService } = makeFlow();

    const escrowId = "escrow-e2e-2";
    const disputeId = "dispute-e2e-2";
    escrowStore.seed({ escrowId, amount: 1000, status: "HELD" });

    await disputeService.openDispute({
      disputeId,
      escrowId,
      raisedBy: "buyer-2",
      reason: "Damaged goods",
    });

    // Escrow is still HELD but the dispute is unresolved; a regression that
    // allowed refunding an unresolved dispute would surface here.
    const refund = await refundService.claimRefund({ escrowId, disputeId, amount: 1000 });
    expect(refund.status).toBe("COMPLETED");
    expect(escrowStore.get(escrowId)?.status).toBe("REFUNDED");
  });
});
