// Display formatting (UI-SPEC "Formatação de data e hora", CONTEXT D-07).
// Stored values are UTC ISO strings; display converts to America/Sao_Paulo via
// @date-fns/tz (never a hard-coded -03:00 offset).
import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { TZ_BRASILIA } from "../shared/constants";
import type { Item } from "../shared/schema";

const inBrasilia = tz(TZ_BRASILIA);
const inUtc = tz("UTC");

/** '06/10 14:17' in Brasília time. */
export function formatAbsolute(iso: string): string {
  return format(iso, "dd/MM HH:mm", { in: inBrasilia });
}

/**
 * datetime → 'dd/MM/yyyy · HH:mm' (Brasília); day → 'dd/MM/yyyy' in UTC (the
 * collector stores day-only dates as noon UTC, so the day never shifts);
 * null/none → 'Data não informada' (never "now", never firstSeenAt).
 */
export function formatItemDate(item: Pick<Item, "publishedAt" | "datePrecision">): string {
  if (item.publishedAt === null || item.datePrecision === "none") return "Data não informada";
  if (item.datePrecision === "day") return format(item.publishedAt, "dd/MM/yyyy", { in: inUtc });
  return format(item.publishedAt, "dd/MM/yyyy '·' HH:mm", { in: inBrasilia });
}
