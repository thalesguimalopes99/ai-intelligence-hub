// Pure LIVE-badge rules (FEED-06, CONTEXT D-06/D-07, UI-SPEC "Selo LIVE").
// Everything takes `nowMs` explicitly so it is deterministic and testable; the
// client island supplies the clock. No zod import: this ships in the client
// bundle, so the payload check is a small hand-written guard.
import { differenceInDays, differenceInHours, differenceInMinutes } from "date-fns";
import { DELAYED_MAX_MIN, LIVE_MAX_MIN } from "../shared/constants";
import { formatAbsolute } from "./format-date";

export type LiveState = "live" | "atrasado" | "parado";

const NEVER_SUCCEEDED = "Última atualização: ainda nenhuma coleta concluída.";

/** LIVE < 90 min; atrasado 90–180 min inclusive; parado > 180 min or null/invalid. */
export function liveStatus(lastSuccessAt: string | null, nowMs: number): LiveState {
  if (!lastSuccessAt) return "parado";
  const t = Date.parse(lastSuccessAt);
  if (!Number.isFinite(t)) return "parado";
  const minutes = Math.max(0, (nowMs - t) / 60_000); // visitor clock behind → 0
  if (minutes < LIVE_MAX_MIN) return "live";
  if (minutes <= DELAYED_MAX_MIN) return "atrasado";
  return "parado";
}

/** 'agora mesmo' | 'há N min' | 'há N h' | 'há 1 dia' | 'há N dias' (explicit differenceIn* buckets, per UI-SPEC). */
export function formatRelative(fromIso: string, nowMs: number): string {
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from) || nowMs <= from) return "agora mesmo";
  const minutes = differenceInMinutes(nowMs, from);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = differenceInHours(nowMs, from);
  if (hours < 24) return `há ${hours} h`;
  const days = differenceInDays(nowMs, from);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/**
 * Status line. `nowMs === null` means pre-hydration (server HTML): absolute
 * time only, since the build never knows the current time.
 */
export function formatStatusLine(lastSuccessAt: string | null, nowMs: number | null): string {
  if (lastSuccessAt === null) return NEVER_SUCCEEDED;
  const absolute = `${formatAbsolute(lastSuccessAt)} (Brasília)`;
  if (nowMs === null) return `Última atualização: ${absolute}`;
  return `Última atualização: ${formatRelative(lastSuccessAt, nowMs)} · ${absolute}`;
}

/**
 * Validate a polled meta.json payload (threat T-01-17).
 * Returns the UTC ISO string, `null` when no run ever succeeded, or
 * `undefined` when the payload is invalid (caller keeps the last known value).
 */
export function parseLastSuccessAt(json: unknown): string | null | undefined {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  if (!Object.hasOwn(json, "lastSuccessAt")) return undefined;
  const value = (json as { lastSuccessAt: unknown }).lastSuccessAt;
  if (value === null) return null;
  if (typeof value !== "string" || !value.endsWith("Z")) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}
