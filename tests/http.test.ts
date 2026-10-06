// HTTP layer helpers that need no network: capped body reading (WR-05).
import { describe, expect, it } from "vitest";
import { classifyFetchError, FetchError, readBodyCapped } from "../collector/http";

describe("classifyFetchError (WR-06)", () => {
  it("classifies an abort by the run budget as timeout", () => {
    const err = new DOMException("run time budget exhausted", "TimeoutError");
    expect(classifyFetchError(err)).toMatchObject({ errorKind: "timeout", httpStatus: null });
    expect(classifyFetchError(new DOMException("aborted", "AbortError")).errorKind).toBe("timeout");
  });
});

function chunkedResponse(chunks: Uint8Array[]): { res: Response; pulled: () => number } {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
  // No content-length header: the size is only known while streaming.
  return { res: new Response(stream, { status: 200 }), pulled: () => i };
}

describe("readBodyCapped (WR-05)", () => {
  it("decodes a UTF-8 body split across chunks (multi-byte char on the boundary)", async () => {
    const bytes = new TextEncoder().encode("<rss>café ✓</rss>");
    const cut = bytes.indexOf(0xc3) + 1; // split inside 'é'
    const { res } = chunkedResponse([bytes.slice(0, cut), bytes.slice(cut)]);
    expect(await readBodyCapped(res, 1000)).toBe("<rss>café ✓</rss>");
  });

  it("aborts a chunked body as soon as it exceeds the byte cap, without reading the rest", async () => {
    const chunk = new Uint8Array(400).fill(0x61);
    const { res, pulled } = chunkedResponse(Array.from({ length: 50 }, () => chunk));
    const err = await readBodyCapped(res, 1000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).errorKind).toBe("invalid");
    expect((err as FetchError).message).toContain("body too large");
    expect(pulled()).toBeLessThan(10);
  });

  it("counts bytes, not UTF-16 units", async () => {
    // 400 x '✓' = 400 UTF-16 units but 1200 UTF-8 bytes.
    const { res } = chunkedResponse([new TextEncoder().encode("✓".repeat(400))]);
    await expect(readBodyCapped(res, 1000)).rejects.toBeInstanceOf(FetchError);
  });

  it("returns '' for a response without a body", async () => {
    expect(await readBodyCapped(new Response(null, { status: 204 }))).toBe("");
  });
});
