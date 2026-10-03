import type { IncomingComment, Platform, PostRow } from "../types";

/** Decrypted account credentials handed to a platform adapter. */
export interface AccountCredentials {
  externalId: string;
  username: string;
  accessToken: string;
  refreshToken: string | null;
  meta: Record<string, unknown>;
}

/** What an OAuth callback produces. Facebook can return several Pages at once. */
export interface ConnectedAccount {
  externalId: string;
  username: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  meta?: Record<string, unknown>;
}

export interface TokenRefresh {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
}

export interface PublishInput {
  post: PostRow;
  /** Final text for this platform (caption + link, trimmed to limits). */
  text: string;
}

export interface PublishResult {
  externalId: string;
  url?: string | null;
}

export interface PollResult {
  comments: IncomingComment[];
  cursor: string | null;
}

export interface Capabilities {
  text: boolean;
  image: boolean;
  video: boolean;
  /** Can reply publicly under a comment. */
  publicReply: boolean;
  /** Can send the commenter a private message. */
  privateReply: boolean;
  /** How new comments reach the app. */
  commentSource: "webhook" | "poll" | "none";
}

export interface PlatformAdapter {
  id: Platform;
  capabilities: Capabilities;
  /** Env vars that must be set before real (non-demo) accounts can connect. */
  requiredEnv: string[];
  /** One-line notes shown on the setup page. */
  setupNotes: string[];
  isConfigured(): boolean;
  /** `usesPkce` adapters receive a code challenge and later the verifier. */
  usesPkce: boolean;
  authUrl(state: string, codeChallenge: string | null): string;
  exchangeCode(code: string, codeVerifier: string | null): Promise<ConnectedAccount[]>;
  refresh?(creds: AccountCredentials): Promise<TokenRefresh>;
  /** Called right after connect, e.g. to subscribe to comment webhooks. */
  afterConnect?(creds: AccountCredentials): Promise<void>;
  publish(creds: AccountCredentials, input: PublishInput): Promise<PublishResult>;
  replyToComment?(creds: AccountCredentials, comment: IncomingComment, text: string): Promise<void>;
  sendPrivateReply?(creds: AccountCredentials, comment: IncomingComment, text: string): Promise<void>;
  pollComments?(creds: AccountCredentials, postExternalId: string, cursor: string | null): Promise<PollResult>;
}
