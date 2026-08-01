import { describe, expect, it } from 'vitest';
import { extractUrls, splitLinks } from './links';

// These run over user-authored comments and text extra fields, whose contents are
// rendered as anchors. Both halves matter: finding the link the user meant, and
// never producing an href from something that isn't a web URL.

describe('splitLinks', () => {
	it('returns nothing for empty text', () => {
		expect(splitLinks('')).toEqual([]);
	});

	it('leaves link-free text as one plain segment', () => {
		expect(splitLinks('Bought at the local shop')).toEqual([{ text: 'Bought at the local shop' }]);
	});

	it('links a bare url', () => {
		expect(splitLinks('https://example.com/p?id=4')).toEqual([
			{ text: 'https://example.com/p?id=4', href: 'https://example.com/p?id=4' }
		]);
	});

	it('keeps the text around a url', () => {
		expect(splitLinks('order https://shop.example/x thanks')).toEqual([
			{ text: 'order ' },
			{ text: 'https://shop.example/x', href: 'https://shop.example/x' },
			{ text: ' thanks' }
		]);
	});

	it('links several urls in one value', () => {
		expect(extractUrls('a http://one.example b https://two.example/c')).toEqual([
			'http://one.example',
			'https://two.example/c'
		]);
	});

	it('gives a bare www. host a https scheme', () => {
		expect(splitLinks('www.example.com/x')).toEqual([
			{ text: 'www.example.com/x', href: 'https://www.example.com/x' }
		]);
	});

	it('leaves sentence punctuation out of the url', () => {
		expect(extractUrls('see https://example.com/p.')).toEqual(['https://example.com/p']);
		expect(extractUrls('https://example.com/a, https://example.com/b!')).toEqual([
			'https://example.com/a',
			'https://example.com/b'
		]);
	});

	it('drops a wrapping paren but keeps a balanced one', () => {
		expect(extractUrls('(https://example.com/p)')).toEqual(['https://example.com/p']);
		expect(extractUrls('https://example.com/Foo_(bar)')).toEqual(['https://example.com/Foo_(bar)']);
	});

	it('accepts a schemed host without a dot, for LAN links', () => {
		expect(extractUrls('http://octopi/spool')).toEqual(['http://octopi/spool']);
	});

	it('does not link prose that merely looks host-like', () => {
		expect(extractUrls('www.something')).toEqual([]);
		expect(extractUrls('Sold out, see notes.txt')).toEqual([]);
	});

	it('never links a non-web scheme', () => {
		// The renderer trusts these hrefs, so anything that could execute must not
		// come back as a link at all.
		expect(extractUrls('javascript:alert(1)')).toEqual([]);
		expect(extractUrls('data:text/html,<script>')).toEqual([]);
		expect(extractUrls('file:///etc/passwd')).toEqual([]);
	});

	it('reassembles to the original text', () => {
		const text = 'buy (https://example.com/a) or www.example.org/b. done';
		expect(
			splitLinks(text)
				.map((s) => s.text)
				.join('')
		).toBe(text);
	});
});
