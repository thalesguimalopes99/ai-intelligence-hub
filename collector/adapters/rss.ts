// RSS/Atom adapter: feedsmith parses, we map to a minimal RawEntry shape.
import { parseFeed } from "feedsmith";
import { FetchError } from "../http";

export type RawEntry = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
};

type Loose = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** feedsmith returns Atom text constructs (title, summary) as { value, type }. */
function atomText(v: unknown): string {
  if (typeof v === "string") return v;
  return v !== null && typeof v === "object" ? str((v as Loose).value) : "";
}

function atomLink(entry: Loose): string {
  const links = Array.isArray(entry.links) ? (entry.links as Loose[]) : [];
  const alt = links.find((l) => !l.rel || l.rel === "alternate") ?? links[0];
  return alt ? str(alt.href) : "";
}

/** RSS 2.0: a guid is a permalink unless isPermaLink="false". */
function rssPermalinkGuid(guid: Loose | undefined): string {
  if (!guid) return "";
  const flag = guid.isPermaLink;
  if (flag === false || (typeof flag === "string" && flag.trim().toLowerCase() === "false")) return "";
  return str(guid.value);
}

export function parseRss(xml: string): RawEntry[] {
  let parsed: ReturnType<typeof parseFeed>;
  try {
    parsed = parseFeed(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FetchError("parse", null, `not a feed: ${message}`);
  }

  const feed = parsed.feed as unknown as Loose;
  let entries: RawEntry[];
  if (parsed.format === "rss") {
    const items = (Array.isArray(feed.items) ? feed.items : []) as Loose[];
    entries = items.map((it) => ({
      title: str(it.title),
      link: str(it.link),
      description: str(it.description),
      pubDate: str(it.pubDate),
      // Only a permalink guid may stand in for a missing <link> (WR-04).
      guid: rssPermalinkGuid(it.guid as Loose | undefined),
    }));
  } else if (parsed.format === "atom") {
    const items = (Array.isArray(feed.entries) ? feed.entries : []) as Loose[];
    entries = items.map((it) => ({
      title: atomText(it.title),
      link: atomLink(it),
      description: atomText(it.summary),
      pubDate: str(it.published) || str(it.updated),
      guid: str(it.id),
    }));
  } else {
    throw new FetchError("parse", null, `unsupported feed format: ${parsed.format}`);
  }

  if (entries.length === 0) throw new FetchError("empty", null, "feed has zero entries");
  return entries;
}
