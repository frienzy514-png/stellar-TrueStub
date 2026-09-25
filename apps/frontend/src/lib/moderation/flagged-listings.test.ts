import { INITIAL_FLAGGED_LISTINGS, resolveFlag } from "./flagged-listings";

describe("resolveFlag", () => {
  it("marks only the targeted flag and does not mutate the input", () => {
    const next = resolveFlag(INITIAL_FLAGGED_LISTINGS, "flag-1", "removed");
    expect(next.find((f) => f.id === "flag-1")?.status).toBe("removed");
    expect(next.filter((f) => f.status === "pending")).toHaveLength(
      INITIAL_FLAGGED_LISTINGS.length - 1,
    );
    expect(INITIAL_FLAGGED_LISTINGS[0].status).toBe("pending");
  });

  it("ignores unknown ids", () => {
    expect(resolveFlag(INITIAL_FLAGGED_LISTINGS, "nope", "approved")).toEqual(
      INITIAL_FLAGGED_LISTINGS,
    );
  });
});
