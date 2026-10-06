// Shared constants for the collector and the site. Framework-free on purpose.

export const SCHEMA_VERSION = 1 as const;

// INTL-03: the 13 categories (assigned from Phase 5; [] / null until then).
export const CATEGORIES = [
  "models",
  "agents",
  "coding",
  "api",
  "automation",
  "prompt-engineering",
  "research",
  "image",
  "video",
  "audio",
  "business",
  "safety",
  "hardware",
] as const;

export const WINDOW_DAYS = 30;
/** User decision: the feed shows at most the 50 most recent items, no pagination. */
export const FEED_LIMIT = 50;
export const LIVE_MAX_MIN = 90;
export const DELAYED_MAX_MIN = 180;

export const POLL_INTERVAL_MS = 60_000;
export const CLOCK_TICK_MS = 30_000;
export const MAX_FEED_BYTES = 5_000_000;
/**
 * Global fetch budget for one collector run (WR-06). Well under the job's
 * timeout-minutes: 10, so meta.json is always written and committed even when
 * sources hang: once spent, in-flight fetches abort and the rest are skipped.
 */
export const RUN_BUDGET_MS = 240_000;

export const TZ_BRASILIA = "America/Sao_Paulo";

export const USER_AGENT =
  "AI-Intelligence-Hub/1.0 (+https://github.com/thalesguimalopes99/ai-intelligence-hub)";

export const DATA_DIR_DEFAULT = "data";
export const PUBLIC_DATA_DIR = "public/data";
