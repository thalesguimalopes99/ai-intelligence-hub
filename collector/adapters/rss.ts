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

function atomLink(entry: Loose): string {
  const links = Array.isArray(entry.links) ? (entry.links as Loose[]) : [];
  const alt = links.find((l) => !l.rel || l.rel === "alternate") ?? links[0];
  return alt ? str(alt.href) : "";
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
      guid: str((it.guid as Loose | undefined)?.value),
    }));
  } else if (parsed.format === "atom") {
    const items = (Array.isArray(feed.entries) ? feed.entries : []) as Loose[];
    entries = items.map((it) => ({
      title: str(it.title),
      link: atomLink(it),
      description: str(it.summary),
      pubDate: str(it.published) || str(it.updated),
      guid: str(it.id),
    }));
  } else {
    throw new FetchError("parse", null, `unsupported feed format: ${parsed.format}`);
  }

  if (entries.length === 0) throw new FetchError("empty", null, "feed has zero entries");
  return entries;
}
