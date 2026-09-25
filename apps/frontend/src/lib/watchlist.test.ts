import { getPriceChange } from "./watchlist";

describe("getPriceChange", () => {
  it("detects a price drop", () => {
    expect(getPriceChange(400, 300)).toEqual({ direction: "down", previous: 400, current: 300, percent: -25 });
  });
  it("detects a price increase", () => {
    expect(getPriceChange(200, 250)?.direction).toBe("up");
  });
  it("returns null when unchanged or no snapshot", () => {
    expect(getPriceChange(200, 200)).toBeNull();
    expect(getPriceChange(undefined, 200)).toBeNull();
  });
});
