// HTTP layer: one ky instance with bounded timeouts/retries (T-01-12) and a
// classifier that turns any fetch failure into a SourceHealth errorKind.
import ky, { isHTTPError, isTimeoutError } from "ky";
import { MAX_FEED_BYTES, USER_AGENT } from "../src/shared/constants";
import type { ErrorKind } from "../src/shared/schema";

export const http = ky.create({
  headers: {
    "user-agent": USER_AGENT,
    accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  },
  timeout: 15_000,
  totalTimeout: 60_000,
  retry: {
    limit: 2,
    // ky's default is Infinity: a huge Retry-After would stall the hourly run.
    maxRetryAfter: 15_000,
    jitter: true,
    retryOnTimeout: true,
  },
});

/** A classified source failure raised by our own code (size cap, parse, empty). */
export class FetchError extends Error {
  readonly errorKind: ErrorKind;
  readonly httpStatus: number | null;

  constructor(errorKind: ErrorKind, httpStatus: number | null, message: string) {
    super(message);
    this.name = "FetchError";
    this.errorKind = errorKind;
    this.httpStatus = httpStatus;
  }
}

export type ClassifiedError = {
  errorKind: ErrorKind;
  httpStatus: number | null;
  message: string;
};

const MESSAGE_MAX = 300;
const BODY_EXCERPT = 200;

/** Strip control characters, collapse whitespace, cap length (T-01-16). */
export function sanitizeMessage(text: string, max: number = MESSAGE_MAX): string {
  return (
    text
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

/** Cloudflare challenge markers (Pitfall 4): "Just a mo-ment...", cf-chl / cf_chl. */
const CHALLENGE_RE = /just a m[o]ment|cf-chl|cf_chl/i;

function isChallenge(body: string): boolean {
  return CHALLENGE_RE.test(body);
}

export function classifyFetchError(err: unknown): ClassifiedError {
  if (err instanceof FetchError) {
    return {
      errorKind: err.errorKind,
      httpStatus: err.httpStatus,
      message: sanitizeMessage(err.message),
    };
  }
  if (isHTTPError(err)) {
    const status = err.response.status;
    const body = typeof err.data === "string" ? err.data : "";
    const blocked = (status === 403 || status === 503) && isChallenge(body);
    return {
      errorKind: blocked ? "blocked" : "http",
      httpStatus: status,
      message: sanitizeMessage(body.slice(0, BODY_EXCERPT * 2), BODY_EXCERPT) || sanitizeMessage(err.message),
    };
  }
  if (isTimeoutError(err)) {
    return { errorKind: "timeout", httpStatus: null, message: sanitizeMessage(err.message) };
  }
  // The run's global budget aborting a fetch (WR-06) is a timeout, not a network error.
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return { errorKind: "timeout", httpStatus: null, message: sanitizeMessage(err.message) };
  }
  // NetworkError, fetch TypeError, DNS/socket failures and anything unexpected.
  const message = err instanceof Error ? err.message : String(err);
  return { errorKind: "network", httpStatus: null, message: sanitizeMessage(message) };
}

/**
 * Stream the body as UTF-8 (like Response.text()) while counting bytes, and
 * cancel as soon as it exceeds `maxBytes` (WR-05): a chunked response with no
 * content-length can no longer be buffered whole before the size check.
 */
export async function readBodyCapped(res: Response, maxBytes: number = MAX_FEED_BYTES): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FetchError("invalid", res.status, `body too large: over ${maxBytes} bytes`);
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join("");
}

/**
 * GET a text body, rejecting anything larger than MAX_FEED_BYTES. `signal`
 * is the run's global budget (WR-06): it aborts the request and the body read.
 */
export async function fetchText(
  url: string,
  init: { signal?: AbortSignal } = {},
): Promise<{ status: number; text: string }> {
  const res = await http.get(url, { signal: init.signal });
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) {
    await res.body?.cancel();
    throw new FetchError("invalid", res.status, `body too large: ${declared} bytes`);
  }
  const text = await readBodyCapped(res);
  // A 200 challenge page is a block, not a feed.
  const head = text.slice(0, 2000);
  if (isChallenge(head) && !/<rss|<feed|<rdf/i.test(head)) {
    throw new FetchError("blocked", res.status, text.slice(0, BODY_EXCERPT));
  }
  return { status: res.status, text };
}
