import { describe, expect, it } from "vitest";
import { formatAbsolute, formatItemDate } from "@/lib/format-date";

describe("formatAbsolute", () => {
  it("formats in Brasília time as dd/MM HH:mm", () => {
    expect(formatAbsolute("2026-10-06T17:17:00Z")).toBe("06/10 14:17");
  });

  it("crosses the day boundary in Brasília time", () => {
    expect(formatAbsolute("2026-10-07T01:30:00Z")).toBe("06/10 22:30");
  });
});

describe("formatItemDate", () => {
  it("datetime precision: dd/MM/yyyy · HH:mm in Brasília", () => {
    expect(
      formatItemDate({ publishedAt: "2026-10-06T17:17:00Z", datePrecision: "datetime" }),
    ).toBe("06/10/2026 · 14:17");
  });

  it("day precision: dd/MM/yyyy in UTC without time", () => {
    expect(formatItemDate({ publishedAt: "2026-10-06T12:00:00Z", datePrecision: "day" })).toBe(
      "06/10/2026",
    );
  });

  it("day precision never shifts the day by time zone", () => {
    expect(formatItemDate({ publishedAt: "2026-10-06T01:00:00Z", datePrecision: "day" })).toBe(
      "06/10/2026",
    );
  });

  it("missing date: 'Data não informada'", () => {
    expect(formatItemDate({ publishedAt: null, datePrecision: "none" })).toBe(
      "Data não informada",
    );
  });
});
