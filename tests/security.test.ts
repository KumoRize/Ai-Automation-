import { describe, expect, it } from "vitest";
import { checkPassword, createSessionValue, isValidSessionValue } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { mediaPath } from "@/lib/media";
import { tiktokChunks } from "@/lib/platforms/tiktok";

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("secret-token");
    expect(decrypt(a)).toBe("secret-token");
    expect(encrypt("secret-token")).not.toBe(a);
  });

  it("detects tampering", () => {
    const a = encrypt("secret-token");
    const flipped = a.slice(0, -2) + (a.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(flipped)).toThrow();
  });
});

describe("sessions", () => {
  it("accepts fresh sessions and rejects forged or expired ones", () => {
    const value = createSessionValue();
    expect(isValidSessionValue(value)).toBe(true);
    expect(isValidSessionValue(value.replace(/.$/, "x"))).toBe(false);
    expect(isValidSessionValue(createSessionValue(Date.now() - 31 * 24 * 3600 * 1000))).toBe(false);
    expect(isValidSessionValue(undefined)).toBe(false);
  });

  it("checks the password", () => {
    expect(checkPassword("correct horse")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
  });
});

describe("media paths", () => {
  it("only allows generated file names", () => {
    expect(mediaPath("abc_DEF-123.jpg")).not.toBeNull();
    expect(mediaPath("../app.db")).toBeNull();
    expect(mediaPath("a.exe")).toBeNull();
  });
});

describe("tiktokChunks", () => {
  const MB = 1024 * 1024;
  it("uses one chunk up to 64 MB", () => {
    expect(tiktokChunks(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(tiktokChunks(64 * MB)).toEqual({ chunkSize: 64 * MB, count: 1 });
  });
  it("splits bigger files into 10 MB chunks, remainder in the last", () => {
    expect(tiktokChunks(105 * MB)).toEqual({ chunkSize: 10 * MB, count: 10 });
  });
});
