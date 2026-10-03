import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { config } from "./config";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  username TEXT NOT NULL,
  access_token TEXT,          -- encrypted
  refresh_token TEXT,         -- encrypted
  expires_at INTEGER,         -- ms epoch, null = no expiry
  meta TEXT NOT NULL DEFAULT '{}',
  demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (platform, external_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  link TEXT,
  link_in_caption INTEGER NOT NULL DEFAULT 1,
  media_file TEXT,
  media_type TEXT NOT NULL DEFAULT 'none',   -- none | image | video
  media_mime TEXT,
  media_size INTEGER,
  status TEXT NOT NULL,                      -- scheduled | publishing | published | partial | failed
  scheduled_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,                      -- pending | publishing | published | failed
  external_id TEXT,
  external_url TEXT,
  error TEXT,
  poll_cursor TEXT,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS post_targets_external ON post_targets (platform, external_id);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,  -- null = every post
  platforms TEXT NOT NULL,                   -- JSON array
  keywords TEXT NOT NULL,                    -- JSON array
  match_mode TEXT NOT NULL DEFAULT 'contains',  -- contains | exact | any
  public_reply TEXT NOT NULL DEFAULT '',
  dm_message TEXT NOT NULL DEFAULT '',
  include_link INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comment_events (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_id TEXT,
  comment_id TEXT NOT NULL,
  external_post_id TEXT,
  author_id TEXT,
  author_name TEXT,
  text TEXT NOT NULL,
  automation_id TEXT,
  result TEXT NOT NULL,                      -- no_match | replied | partial | failed | simulated
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (platform, comment_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  code_verifier TEXT,
  created_at INTEGER NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __socialDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.__socialDb) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const conn = new DatabaseSync(path.join(config.dataDir, "app.db"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    conn.exec(SCHEMA);
    globalForDb.__socialDb = conn;
  }
  return globalForDb.__socialDb;
}

export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SQLInputValue[]): number {
  return Number(db().prepare(sql).run(...params).changes);
}
