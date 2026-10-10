import { describe, expect, it } from "vitest";
import { isExistingSignup, passwordChecks, passwordStrength } from "./auth-flow";

describe("registration checks", () => {
  it("requires at least eight characters with a letter and a number", () => {
    expect(passwordChecks("abc1234")).toEqual({ length: false, mixed: true });
    expect(passwordChecks("abcdefgh")).toEqual({ length: true, mixed: false });
    expect(passwordChecks("abc12345")).toEqual({ length: true, mixed: true });
  });

  it("raises strength for longer and more varied passwords", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc12345")).toBe(2);
    expect(passwordStrength("abcdefgh1234")).toBe(3);
    expect(passwordStrength("Abcdefgh1234!")).toBe(4);
  });

  it("recognizes both explicit and obfuscated duplicate signups", () => {
    expect(isExistingSignup({ code: "email_exists" }, undefined)).toBe(true);
    expect(isExistingSignup({ message: "User already registered" }, undefined)).toBe(true);
    expect(isExistingSignup(null, [])).toBe(true);
    expect(isExistingSignup(null, [{ provider: "email" }])).toBe(false);
    expect(isExistingSignup(null, undefined)).toBe(false);
  });
});
