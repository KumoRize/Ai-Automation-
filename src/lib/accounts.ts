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

/** How long before expiry a token is renewed. Instagram tokens last 60 days and can only be renewed while valid. */
function refreshMargin(platform: Platform): number {
  return platform === "instagram" ? 7 * 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
}

export function needsRefresh(account: Pick<AccountRow, "platform" | "expires_at" | "demo">, now = Date.now()): boolean {
  return (
    !account.demo &&
    account.expires_at !== null &&
    account.expires_at - now < refreshMargin(account.platform) &&
    Boolean(adapter(account.platform).refresh)
  );
}

// One refresh per account at a time: X and TikTok refresh tokens are single-use,
// so two parallel refreshes would make the second one fail.
const refreshing = new Map<string, Promise<void>>();

async function refreshAccount(account: AccountRow): Promise<void> {
  const running = refreshing.get(account.id);
  if (running) return running;
  const task = (async () => {
    const current = getAccount(account.id);
    if (!current || !needsRefresh(current)) return; // someone else already refreshed it
    const fresh = await adapter(current.platform).refresh!({
      externalId: current.external_id,
      username: current.username,
      accessToken: current.access_token ? decrypt(current.access_token) : "",
      refreshToken: current.refresh_token ? decrypt(current.refresh_token) : null,
      meta: JSON.parse(current.meta) as Record<string, unknown>,
    });
    run(
      "UPDATE accounts SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ? WHERE id = ?",
      encrypt(fresh.accessToken),
      fresh.refreshToken ? encrypt(fresh.refreshToken) : null,
      fresh.expiresAt ?? null,
      current.id,
    );
  })().finally(() => refreshing.delete(account.id));
  refreshing.set(account.id, task);
  return task;
}

/** Decrypts an account's tokens, refreshing them first if they're about to expire. */
export async function credentialsFor(account: AccountRow): Promise<AccountCredentials> {
  if (needsRefresh(account)) await refreshAccount(account);
  const current = getAccount(account.id) ?? account;
  return {
    externalId: current.external_id,
    username: current.username,
    accessToken: current.access_token ? decrypt(current.access_token) : "",
    refreshToken: current.refresh_token ? decrypt(current.refresh_token) : null,
    meta: JSON.parse(current.meta) as Record<string, unknown>,
  };
}

/** Renews tokens that will expire soon, so accounts stay connected even when unused. */
export async function refreshExpiringTokens(): Promise<void> {
  for (const account of all<AccountRow>("SELECT * FROM accounts WHERE demo = 0 AND expires_at IS NOT NULL")) {
    // Short-lived tokens (X, TikTok, YouTube) are renewed on use; only long-lived Instagram tokens need this.
    if (account.platform !== "instagram" || !needsRefresh(account)) continue;
    try {
      await refreshAccount(account);
    } catch (err) {
      console.error(`[tokens] could not renew ${account.platform} ${account.username}:`, err);
    }
  }
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
