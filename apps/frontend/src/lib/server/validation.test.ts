/** @jest-environment node */
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { GET as validate } from "@/app/api/auth/validate-reset-token/route";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { buildListingJsonLd, serializeJsonLd } from "@/lib/metadata/listing-jsonld";
import { STUB_EVENTS } from "@/lib/mockData/events";

const post = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("auth API validation (#194)", () => {
  const fetchSpy = jest.fn();
  beforeEach(() => { global.fetch = fetchSpy; fetchSpy.mockReset(); });

  it("rejects malformed input with 400 and never forwards", async () => {
    expect((await forgot(post({ email: "nope" }))).status).toBe(400);
    expect((await forgot(post("not json"))).status).toBe(400);
    expect((await reset(post({ token: "t", newPassword: "short" }))).status).toBe(400);
    expect((await reset(post({ newPassword: "longenough" }))).status).toBe(400);
    expect((await validate(new Request("http://x/api"))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards valid input", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    expect((await forgot(post({ email: "a@b.co" }))).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("feature flags (#195)", () => {
  it("uses default, honors env override", () => {
    expect(isFeatureEnabled("ESCROW_RECEIPTS", {})).toBe(true);
    expect(isFeatureEnabled("ESCROW_RECEIPTS", { FEATURE_FLAG_ESCROW_RECEIPTS: "false" })).toBe(false);
    expect(isFeatureEnabled("ESCROW_RECEIPTS", { FEATURE_FLAG_ESCROW_RECEIPTS: "garbage" })).toBe(true);
  });
});

describe("listing JSON-LD (#196)", () => {
  it("emits required Event fields and escapes </script>", () => {
    const ld = buildListingJsonLd(STUB_EVENTS[0]);
    expect(ld).toMatchObject({ "@type": "Event", name: STUB_EVENTS[0].name, offers: { "@type": "Offer", priceCurrency: "USD" } });
    expect(ld.startDate).toBeTruthy();
    expect(serializeJsonLd({ a: "</script>" })).not.toContain("<");
  });
});
