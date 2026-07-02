/**
 * In-memory fixed-window rate limiter. Per Fluid instance (resets on cold
 * start), which is sufficient to blunt abuse of the public endpoints without
 * extra infrastructure; Vercel WAF rules can be layered on later.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = (
  key: string,
  max: number,
  windowMs: number,
): boolean => {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    // Opportunistic cleanup keeps the map from growing unboundedly.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
};

/**
 * Client IP from Vercel's trusted x-real-ip header. x-forwarded-for is
 * intentionally not trusted because clients can spoof it.
 */
export const clientIp = (headerStore: {
  get(name: string): string | null;
}): string =>
  headerStore.get("x-real-ip") ?? "unknown";
