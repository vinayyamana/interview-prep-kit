import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { assertSafeUrl, isPrivateOrReservedIp } = require("../services/security/validateUrl");

describe("isPrivateOrReservedIp", () => {
  it("blocks loopback, private and link-local IPv4", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("rejects non-http protocols", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects localhost", async () => {
    await expect(assertSafeUrl("http://localhost:3000")).rejects.toThrow();
  });

  it("rejects private IP literals", async () => {
    await expect(assertSafeUrl("http://127.0.0.1")).rejects.toThrow();
  });
});