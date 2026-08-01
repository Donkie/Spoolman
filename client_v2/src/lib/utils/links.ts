// Find URLs inside free-text field values (comments, text extra fields) so they
// can be rendered as real links instead of dead text — a comment holding an
// order link or a product page is a common way to use these fields (#992).
//
// Only http(s) and bare www. forms are recognised, which is deliberate: the
// values come from users but are rendered as anchors, and never producing a
// `javascript:`/`data:` href is the simplest way to keep that safe.

export interface TextSegment {
	/** The text to render. */
	text: string;
	/** Set when this segment is a URL: the href to link it to. */
	href?: string;
}

/** Matches a candidate URL; the trailing run is trimmed down by `trimUrl`. */
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/** Sentence punctuation that follows a URL far more often than it belongs to one. */
const TRAILING_PUNCT = /[.,;:!?'"]+$/;

const BRACKETS: [string, string][] = [
	['(', ')'],
	['[', ']'],
	['{', '}']
];

function count(s: string, ch: string): number {
	let n = 0;
	for (const c of s) if (c === ch) n++;
	return n;
}

/**
 * Trim what the regex over-matched: "see https://example.com/p." ends a sentence,
 * and "(https://example.com/p)" wraps the URL in parens. A *balanced* bracket is
 * kept, since paths legitimately contain them.
 */
function trimUrl(raw: string): string {
	let url = raw.replace(TRAILING_PUNCT, '');
	let trimmed = true;
	while (trimmed) {
		trimmed = false;
		for (const [open, close] of BRACKETS) {
			if (url.endsWith(close) && count(url, close) > count(url, open)) {
				url = url.slice(0, -1).replace(TRAILING_PUNCT, '');
				trimmed = true;
			}
		}
	}
	return url;
}

/**
 * Reject matches that can't be a real destination. An explicit scheme only needs
 * a host — LAN links like `http://octopi/` are perfectly valid — but the bare
 * `www.` form needs a dotted name, so prose like "www.something" isn't linked.
 */
function isUsable(url: string): boolean {
	const scheme = /^https?:\/\//i.exec(url);
	const host = url.slice(scheme ? scheme[0].length : 0).split(/[/?#]/)[0];
	if (!host || host.startsWith('.') || host.endsWith('.')) return false;
	return scheme ? true : /^www\.[^.\s]+\.[^.\s]/i.test(host);
}

function toHref(url: string): string {
	return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

/**
 * Split free text into plain and linked segments, in order. Text with no URLs
 * comes back as a single plain segment (or none, when empty).
 */
export function splitLinks(text: string): TextSegment[] {
	const out: TextSegment[] = [];
	if (!text) return out;
	const re = new RegExp(URL_PATTERN.source, 'gi');
	let last = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		const url = trimUrl(match[0]);
		if (!url || !isUsable(url)) continue;
		if (match.index > last) out.push({ text: text.slice(last, match.index) });
		out.push({ text: url, href: toHref(url) });
		last = match.index + url.length;
	}
	if (last < text.length) out.push({ text: text.slice(last) });
	return out;
}

/** The hrefs of every URL in `text`, in order. Empty when there are none. */
export function extractUrls(text: string): string[] {
	return splitLinks(text)
		.map((s) => s.href)
		.filter((h): h is string => !!h);
}
