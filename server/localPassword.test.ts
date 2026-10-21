import { describe, expect, it } from "vitest";
import { getDummyLocalPasswordHash, hashLocalPassword, verifyLocalPassword } from "./_core/localPassword";

describe("local password hashing", () => {
  it("verifies a password against its salted scrypt hash", async () => {
    const testPassword = "temporary unit-test phrase 2026";
    const hash = await hashLocalPassword(testPassword);
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyLocalPassword(testPassword, hash)).toBe(true);
    expect(await verifyLocalPassword("incorrect test phrase", hash)).toBe(false);
  });

  it("rejects malformed hashes and creates a valid dummy hash", async () => {
    expect(await verifyLocalPassword("anything", "not-a-valid-hash")).toBe(false);
    const dummyHash = await getDummyLocalPasswordHash();
    expect(await verifyLocalPassword("anything", dummyHash)).toBe(false);
  });
});
