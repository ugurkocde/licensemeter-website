/**
 * Reads a request body up to `maxBytes`, streaming, and cancels the reader as
 * soon as the limit is exceeded, so an oversized body is never fully buffered.
 * Returns null when the body is too large. A declared content-length is only a
 * cheap early exit: a chunked or understated request is still capped while
 * reading.
 */
export const readCapped = async (
  req: Request,
  maxBytes: number,
): Promise<string | null> => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
};
