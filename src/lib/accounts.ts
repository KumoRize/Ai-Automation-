import { randomBytes } from "node:crypto";
import { decrypt, encrypt, randomId } from "./crypto";
import { all, get, run } from "./db";
import { adapter } from "./platforms";
import type { AccountCredentials, ConnectedAccount } from "./platforms/types";
import { PLATFORM_LABELS, type AccountRow, type Platform } from "./types";

/** Account fields that are safe to send to the browser. */
export type PublicAccount = Pick<AccountRow, "id" | "platform" | "username" | "demo" | "created_at" | "expires_at">;

export function listAccounts(): PublicAccount[] {
  return all<PublicAccount>(
    "SELECT id, platform, username, demo, created_at, expires_at FROM accounts ORDER BY platform, created_at",
  );
}

export function getAccount(id: string): AccountRow | undefined {
  return get<AccountRow>("SELECT * FROM accounts WHERE id = ?", id);
}

export function findAccountByExternal(platform: Platform, externalId: string): AccountRow | undefined {
  return get<AccountRow>("SELECT * FROM accounts WHERE platform = ? AND external_id = ?", platform, externalId);
}

export function saveConnectedAccount(platform: Platform, account: ConnectedAccount, demo = false): string {
  const existing = findAccountByExternal(platform, account.externalId);
  const id = existing?.id ?? randomId(12);
  run(
    `INSERT INTO accounts (id, platform, external_id, username, access_token, refresh_token, expires_at, meta, demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (platform, external_id) DO UPDATE SET
       username = excluded.username,
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, accounts.refresh_token),
       expires_at = excluded.expires_at,
       meta = excluded.meta`,
    id,
    platform,
    account.externalId,
    account.username,
    encrypt(account.accessToken),
    account.refreshToken ? encrypt(account.refreshToken) : null,
    account.expiresAt ?? null,
    JSON.stringify(account.meta ?? {}),
    demo ? 1 : 0,
    existing?.created_at ?? Date.now(),
  );
  return id;
}

export function createDemoAccount(platform: Platform): string {
  const suffix = randomBytes(2).toString("hex");
  return saveConnectedAccount(
    platform,
    {
      externalId: `demo-${platform}-${suffix}`,
      username: `Demo ${PLATFORM_LABELS[platform]} (${suffix})`,
      accessToken: "demo",
    },
    true,
  );
}

export function deleteAccount(id: string): void {
  run("DELETE FROM accounts WHERE id = ?", id);
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Decrypts an account's tokens, refreshing them first if they're about to expire. */
export async function credentialsFor(account: AccountRow): Promise<AccountCredentials> {
  let creds: AccountCredentials = {
    externalId: account.external_id,
    username: account.username,
    accessToken: account.access_token ? decrypt(account.access_token) : "",
    refreshToken: account.refresh_token ? decrypt(account.refresh_token) : null,
    meta: JSON.parse(account.meta) as Record<string, unknown>,
  };
  const expiring = account.expires_at !== null && account.expires_at - Date.now() < REFRESH_MARGIN_MS;
  const refresh = adapter(account.platform).refresh;
  if (!account.demo && expiring && refresh) {
    const fresh = await refresh(creds);
    run(
      "UPDATE accounts SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ? WHERE id = ?",
      encrypt(fresh.accessToken),
      fresh.refreshToken ? encrypt(fresh.refreshToken) : null,
      fresh.expiresAt ?? null,
      account.id,
    );
    creds = { ...creds, accessToken: fresh.accessToken, refreshToken: fresh.refreshToken ?? creds.refreshToken };
  }
  return creds;
}

const STATE_TTL_MS = 15 * 60 * 1000;

export function saveOAuthState(state: string, platform: Platform, codeVerifier: string | null): void {
  run("DELETE FROM oauth_states WHERE created_at < ?", Date.now() - STATE_TTL_MS);
  run(
    "INSERT INTO oauth_states (state, platform, code_verifier, created_at) VALUES (?, ?, ?, ?)",
    state,
    platform,
    codeVerifier,
    Date.now(),
  );
}

/** Returns the PKCE verifier (or "" when unused) if the state is valid; each state works once. */
export function consumeOAuthState(state: string, platform: Platform): string | null {
  const row = get<{ code_verifier: string | null; created_at: number }>(
    "SELECT code_verifier, created_at FROM oauth_states WHERE state = ? AND platform = ?",
    state,
    platform,
  );
  run("DELETE FROM oauth_states WHERE state = ?", state);
  if (!row || Date.now() - row.created_at > STATE_TTL_MS) return null;
  return row.code_verifier ?? "";
}
