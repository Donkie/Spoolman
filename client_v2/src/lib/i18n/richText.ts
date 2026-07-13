// Rich-text parsing for i18n strings that carry inline markup tags.
//
// Our locale strings (seeded from the old React client, which used
// react-i18next's <Trans>) contain tags like <p>, <br>, <title> and named
// component tags like <helpPageLink>Help</helpPageLink> or <itemsHelp/>.
// svelte-i18n runs with ignoreTag: true, so $_(key) returns these tags as
// literal text. This module turns that literal text into a small node tree
// that Trans.svelte renders safely.
//
// SECURITY: every non-English locale is community-maintained via Weblate, so a
// translated string is untrusted input. This parser therefore only ever
// recognises *bare* tag names (no attributes are read from the string) and
// produces text + tag nodes — never HTML. Trans.svelte renders text nodes as
// escaped text and maps tag names against a fixed allowlist, so a hostile
// translation can at worst produce odd-looking but inert text. Do not feed the
// raw string into {@html}.

export type TransNode =
	| { type: 'text'; value: string }
	| { type: 'tag'; name: string; children: TransNode[] };

// Matches <name>, </name> and <name/> — and nothing with attributes. The name
// must be a plain identifier; anything else (e.g. `<a href="x">`, `<img ...>`)
// fails to match and is left in place as literal text, which Trans escapes.
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)\s*(\/?)>/g;

// Tags that never have children: an opening <br> is a leaf, not a container.
const VOID_TAGS = new Set(['br']);

/**
 * Parse a string containing bare markup tags into a node tree.
 *
 * The parser is deliberately lenient: unmatched closing tags are ignored and
 * unclosed containers are auto-closed at end of input, so a translator who
 * drops or reorders a tag gets degraded rendering rather than a thrown error.
 */
export function parseRichText(input: string): TransNode[] {
	const root: TransNode[] = [];
	// `stack` holds the children arrays we're currently appending into; stack[0]
	// is the root. `openNames` names the open container at each depth, so
	// openNames[k] corresponds to stack[k + 1].
	const stack: TransNode[][] = [root];
	const openNames: string[] = [];

	const pushText = (s: string) => {
		if (s) stack[stack.length - 1].push({ type: 'text', value: s });
	};

	let last = 0;
	let m: RegExpExecArray | null;
	TAG_RE.lastIndex = 0;
	while ((m = TAG_RE.exec(input)) !== null) {
		pushText(input.slice(last, m.index));
		last = TAG_RE.lastIndex;

		const closing = m[1] === '/';
		const name = m[2];
		const selfClosing = m[3] === '/';

		if (selfClosing || (!closing && VOID_TAGS.has(name))) {
			// <name/> or a void <br>: a childless leaf.
			stack[stack.length - 1].push({ type: 'tag', name, children: [] });
		} else if (closing) {
			// </name>: close the nearest matching open container, auto-closing any
			// still-open inner containers. A stray close with no match is ignored.
			const idx = openNames.lastIndexOf(name);
			if (idx !== -1) {
				while (openNames.length > idx) {
					openNames.pop();
					stack.pop();
				}
			}
		} else {
			// <name>: open a container and start appending into it.
			const node: TransNode = { type: 'tag', name, children: [] };
			stack[stack.length - 1].push(node);
			stack.push(node.children);
			openNames.push(name);
		}
	}
	pushText(input.slice(last));
	return root;
}
