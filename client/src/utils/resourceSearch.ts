type SearchableValue = unknown;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[#_\-./\\]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectSearchValues(value: SearchableValue, seen = new WeakSet<object>()): string[] {
  if (value == null) return [];

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (value instanceof Date) {
    return [value.toISOString()];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSearchValues(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return [];
    seen.add(value);

    return Object.entries(value).flatMap(([key, entryValue]) => {
      // Include field names too so extra-field labels/metadata can be found.
      return [key, ...collectSearchValues(entryValue, seen)];
    });
  }

  return [];
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + substitutionCost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function fuzzyTokenMatches(token: string, haystack: string, haystackWords: string[]): boolean {
  if (haystack.includes(token)) return true;

  if (token.length < 4) return false;

  return haystackWords.some((word) => {
    if (word.includes(token)) return true;

    if (word.length < 4) return false;
    if (token.includes(word) && word.length >= token.length - 1) return true;

    // Avoid broad typo matches between unrelated words like "gray" and AMS "tray" metadata.
    // Common color spelling variants/typos such as "grey" -> "gray" and "gren" -> "green"
    // still work because they share the first character.
    if (token[0] !== word[0]) return false;

    const maxDistance = token.length <= 5 ? 1 : 2;
    return levenshteinDistance(token, word) <= maxDistance;
  });
}

export function resourceSearchMatches(resource: SearchableValue, search: string): boolean {
  const tokens = normalizeSearchText(search).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = normalizeSearchText(collectSearchValues(resource).join(" "));
  if (!haystack) return false;

  const haystackWords = haystack.split(" ").filter(Boolean);
  return tokens.every((token) => fuzzyTokenMatches(token, haystack, haystackWords));
}

export function filterByResourceSearch<T>(resources: T[], search: string): T[] {
  if (normalizeSearchText(search).length === 0) return resources;
  return resources.filter((resource) => resourceSearchMatches(resource, search));
}
