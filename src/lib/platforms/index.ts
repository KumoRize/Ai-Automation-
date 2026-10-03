import type { Platform } from "../types";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { tiktok } from "./tiktok";
import type { PlatformAdapter } from "./types";
import { x } from "./x";
import { youtube } from "./youtube";

export const adapters: Record<Platform, PlatformAdapter> = { instagram, facebook, tiktok, youtube, x };

export function adapter(platform: Platform): PlatformAdapter {
  return adapters[platform];
}
