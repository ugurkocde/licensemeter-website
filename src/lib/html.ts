/** Minimal HTML entity escaping for text and attribute values in emails. */
export const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/**
 * Email header lockup: the brand mark as a hosted PNG (email clients strip
 * inline SVG) beside the text wordmark, which keeps carrying the brand when
 * a client blocks remote images. baseUrl is the canonical origin.
 */
export const emailWordmark = (baseUrl: string): string =>
  `<p style="font-family:Georgia,serif;font-size:17px;margin:0 0 28px;color:#1c1a16"><img src="${escapeHtml(`${baseUrl}/brand-mark.png`)}" width="26" height="26" alt="" style="vertical-align:-6px;border:0;margin-right:8px">License<span style="color:#a8330d">Meter</span></p>`;
