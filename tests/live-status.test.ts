import { describe, expect, it } from "vitest";
import {
  formatRelative,
  formatStatusLine,
  liveStatus,
  parseLastSuccessAt,
} from "@/lib/live-status";

const BASE = "2026-10-06T17:17:00Z";
const BASE_MS = Date.parse(BASE);
const MIN = 60_000;
const at = (minutes: number) => BASE_MS + minutes * MIN;

describe("liveStatus", () => {
  it("is live from 0 up to just under 90 min", () => {
    expect(liveStatus(BASE, at(0))).toBe("live");
    expect(liveStatus(BASE, at(89.9))).toBe("live");
  });

  it("is atrasado at exactly 90 and 180 min (inclusive)", () => {
    expect(liveStatus(BASE, at(90))).toBe("atrasado");
    expect(liveStatus(BASE, at(180))).toBe("atrasado");
  });

  it("is parado after 180 min", () => {
    expect(liveStatus(BASE, at(180.1))).toBe("parado");
  });

  it("is parado for null or invalid values", () => {
    expect(liveStatus(null, at(0))).toBe("parado");
    expect(liveStatus("garbage", at(0))).toBe("parado");
  });

  it("treats a future lastSuccessAt (clock skew) as 0 min → live", () => {
    expect(liveStatus(BASE, at(-5))).toBe("live");
  });
});

describe("formatRelative", () => {
  it.each([
    [0.5, "agora mesmo"],
    [12, "há 12 min"],
    [59, "há 59 min"],
    [60, "há 1 h"],
    [23 * 60 + 59, "há 23 h"],
    [24 * 60, "há 1 dia"],
    [72 * 60, "há 3 dias"],
    [-5, "agora mesmo"],
  ])("%s min → %s", (minutes, expected) => {
    expect(formatRelative(BASE, at(minutes))).toBe(expected);
  });
});

describe("formatStatusLine", () => {
  it("relative + absolute Brasília time", () => {
    expect(formatStatusLine(BASE, Date.parse("2026-10-06T17:29:00Z"))).toBe(
      "Última atualização: há 12 min · 06/10 14:17 (Brasília)",
    );
  });

  it("'agora mesmo' variant drops 'há'", () => {
    expect(formatStatusLine(BASE, Date.parse("2026-10-06T17:17:30Z"))).toBe(
      "Última atualização: agora mesmo · 06/10 14:17 (Brasília)",
    );
  });

  it("absolute only before hydration (now = null)", () => {
    expect(formatStatusLine(BASE, null)).toBe("Última atualização: 06/10 14:17 (Brasília)");
  });

  it("never-succeeded copy for null", () => {
    expect(formatStatusLine(null, at(0))).toBe(
      "Última atualização: ainda nenhuma coleta concluída.",
    );
    expect(formatStatusLine(null, null)).toBe(
      "Última atualização: ainda nenhuma coleta concluída.",
    );
  });
});

describe("parseLastSuccessAt", () => {
  it("returns a valid UTC Z string", () => {
    expect(parseLastSuccessAt({ lastSuccessAt: BASE })).toBe(BASE);
  });

  it("returns null for an explicit null", () => {
    expect(parseLastSuccessAt({ lastSuccessAt: null })).toBeNull();
  });

  it("rejects non-date and non-UTC strings", () => {
    expect(parseLastSuccessAt({ lastSuccessAt: "yesterday" })).toBeUndefined();
    expect(parseLastSuccessAt({ lastSuccessAt: "2026-10-06T14:17:00-03:00" })).toBeUndefined();
    expect(parseLastSuccessAt({ lastSuccessAt: "notadateZ" })).toBeUndefined();
    expect(parseLastSuccessAt({ lastSuccessAt: 123 })).toBeUndefined();
  });

  it("rejects non-object payloads and missing keys", () => {
    expect(parseLastSuccessAt("str")).toBeUndefined();
    expect(parseLastSuccessAt(null)).toBeUndefined();
    expect(parseLastSuccessAt({})).toBeUndefined();
    expect(parseLastSuccessAt([])).toBeUndefined();
  });
});
