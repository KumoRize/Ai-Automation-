import crypto from "node:crypto";
import { config } from "./config";

function key(purpose: string): Buffer {
  if (!config.appSecret) throw new Error("APP_SECRET is not set");
  return crypto.createHash("sha256").update(`${purpose}:${config.appSecret}`).digest();
}

/** AES-256-GCM. Output: base64url(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key("enc"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function decrypt(token: string): string {
  const raw = Buffer.from(token, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key("enc"), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function hmac(data: string, purpose = "sign"): string {
  return crypto.createHmac("sha256", key(purpose)).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function randomId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** PKCE verifier/challenge pair (S256). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
