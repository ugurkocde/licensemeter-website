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

/** A `*` glob split once into its literal chunks, lowercased. */
type CompiledGlob = { first: string; middle: string[]; last: string | null };

const compileGlob = (pattern: string): CompiledGlob => {
  const chunks = pattern.toLowerCase().split("*");
  // No star: one chunk, an exact match.
  if (chunks.length === 1) return { first: chunks[0]!, middle: [], last: null };
  return {
    first: chunks[0]!,
    middle: chunks.slice(1, -1).filter((c) => c !== ""),
    last: chunks[chunks.length - 1]!,
  };
};

/**
 * True when `chunk` occurs in `value` at `at`. Compares from the chunk's end:
 * suffix mismatches (the common case) then fail on the first character, which
 * a front-to-back startsWith/endsWith does not do for run-heavy chunks.
 */
const occursAt = (value: string, chunk: string, at: number): boolean => {
  for (let i = chunk.length - 1; i >= 0; i--) {
    if (value.charCodeAt(at + i) !== chunk.charCodeAt(i)) return false;
  }
  return true;
};

/**
 * Star-only glob match in linear time: the last chunk is an anchored suffix,
 * the first an anchored prefix, and each middle chunk is found greedily left
 * to right with indexOf. Taking the earliest occurrence never rules out a
 * match for star-only globs, so nothing is ever searched twice and no
 * pattern can backtrack.
 */
const globMatches = (g: CompiledGlob, value: string): boolean => {
  if (g.last === null) return value === g.first;
  if (value.length < g.first.length + g.last.length) return false;
  if (
    !occursAt(value, g.last, value.length - g.last.length) ||
    !occursAt(value, g.first, 0)
  ) {
    return false;
  }
  let at = g.first.length;
  const end = value.length - g.last.length;
  for (const chunk of g.middle) {
    const found = value.indexOf(chunk, at);
    if (found === -1 || found + chunk.length > end) return false;
    at = found + chunk.length;
  }
  return true;
};

/**
 * Matcher over upn and display name; with no patterns nothing matches.
 * Patterns are compiled once, so build one matcher per analysis run.
 */
export const exclusionMatcher = (
  patterns: readonly string[],
): ((account: { upn: string; displayName: string | null }) => boolean) => {
  const globs = patterns.map(compileGlob);
  if (globs.length === 0) return () => false;
  return ({ upn, displayName }) => {
    const u = upn.toLowerCase();
    const d = displayName?.toLowerCase() ?? null;
    return globs.some(
      (g) => globMatches(g, u) || (d !== null && globMatches(g, d)),
    );
  };
};

/** The same globs as SQL ILIKE patterns (`*` -> `%`, LIKE wildcards escaped). */
export const exclusionLikePatterns = (patterns: readonly string[]): string[] =>
  patterns.map((p) => p.replace(/[\\%_]/g, "\\$&").replace(/\*/g, "%"));
