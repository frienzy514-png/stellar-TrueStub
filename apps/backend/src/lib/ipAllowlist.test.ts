import { parseIpAllowlist } from "./ipAllowlist";

describe("parseIpAllowlist (#532)", () => {
  it("matches exact IPv4 and IPv6 addresses", () => {
    const list = parseIpAllowlist("203.0.113.10, 2001:db8::1");
    expect(list.check("203.0.113.10")).toBe(true);
    expect(list.check("2001:db8::1")).toBe(true);
    expect(list.check("203.0.113.11")).toBe(false);
    expect(list.check("2001:db8::2")).toBe(false);
  });

  it("matches CIDR ranges", () => {
    const list = parseIpAllowlist("198.51.100.0/24,2001:db8:abcd::/48");
    expect(list.check("198.51.100.42")).toBe(true);
    expect(list.check("198.51.101.1")).toBe(false);
    expect(list.check("2001:db8:abcd:1::5")).toBe(true);
    expect(list.check("2001:db8:abce::5")).toBe(false);
  });

  it("normalizes IPv4-mapped IPv6 peer addresses", () => {
    const list = parseIpAllowlist("127.0.0.1");
    expect(list.check("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects missing or non-IP peer addresses", () => {
    const list = parseIpAllowlist("127.0.0.1");
    expect(list.check(undefined)).toBe(false);
    expect(list.check("not-an-ip")).toBe(false);
  });

  it.each([
    ["", /empty/],
    [" , ", /empty/],
    ["example.com", /Invalid IP allowlist entry/],
    ["10.0.0.0/33", /Invalid CIDR prefix/],
    ["10.0.0.0/abc", /Invalid CIDR prefix/],
    ["10.0.0.0/8/1", /Invalid IP allowlist entry/],
  ])("throws on malformed input %p", (raw, message) => {
    expect(() => parseIpAllowlist(raw)).toThrow(message);
  });
});
