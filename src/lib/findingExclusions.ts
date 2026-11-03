/**
 * Workspace exclusions: accounts an admin keeps out of per-user findings
 * (service, room and shared accounts), matched by sign-in name or display
 * name with a case-insensitive glob where `*` matches any run of characters.
 */

export const MAX_EXCLUSIONS = 50;
export const MAX_EXCLUSION_LENGTH = 120;

export type ExclusionParse =
  { ok: true; patterns: string[] } | { ok: false; error: string };

/**
 * One pattern per line (commas also separate). Trims, drops blanks, collapses
 * repeated `*` and removes case-insensitive duplicates, keeping first-seen
 * order. Rejects input that is too long or a bare `*`, which would hide every
 * account.
 */
export const parseExclusions = (raw: string): ExclusionParse => {
  const seen = new Set<string>();
  const patterns: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const pattern = part.trim().replace(/\*{2,}/g, "*");
    if (pattern === "") continue;
    if (pattern.length > MAX_EXCLUSION_LENGTH) {
      return {
        ok: false,
        error: `Each pattern can be at most ${MAX_EXCLUSION_LENGTH} characters`,
      };
    }
    if (pattern === "*") {
      return { ok: false, error: "A pattern of only * would exclude everyone" };
    }
    const key = pattern.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push(pattern);
  }
  if (patterns.length > MAX_EXCLUSIONS) {
    return { ok: false, error: `Use at most ${MAX_EXCLUSIONS} patterns` };
  }
  return { ok: true, patterns };
};

const globToRegExp = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
    "i",
  );

/** Matcher over upn and display name; with no patterns nothing matches. */
export const exclusionMatcher = (
  patterns: readonly string[],
): ((account: { upn: string; displayName: string | null }) => boolean) => {
  const regexes = patterns.map(globToRegExp);
  return ({ upn, displayName }) =>
    regexes.some(
      (r) => r.test(upn) || (displayName !== null && r.test(displayName)),
    );
};

/** The same globs as SQL ILIKE patterns (`*` -> `%`, LIKE wildcards escaped). */
export const exclusionLikePatterns = (patterns: readonly string[]): string[] =>
  patterns.map((p) => p.replace(/[\\%_]/g, "\\$&").replace(/\*/g, "%"));
