import { getSettings, setSetting, parseSetting } from '$lib/api/settings';

// Server-backed user settings (currency, round_prices, base_url) plus one
// client-only preference (low-stock threshold, persisted to localStorage — the
// backend has no such setting).

const LOW_THRESHOLD_KEY = 'spoolman-v2-low-threshold';

class Settings {
	currency = $state('EUR');
	roundPrices = $state(false);
	baseUrl = $state('');
	lowThreshold = $state(150);
	loaded = $state(false);

	async load() {
		if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem(LOW_THRESHOLD_KEY);
			if (stored) this.lowThreshold = Number(stored) || this.lowThreshold;
		}
		try {
			const s = await getSettings();
			this.currency = parseSetting(s.currency, 'EUR');
			this.roundPrices = parseSetting(s.round_prices, false);
			this.baseUrl = parseSetting(s.base_url, '');
		} catch (e) {
			console.error('Failed to load settings', e);
		} finally {
			this.loaded = true;
		}
	}

	async setCurrency(code: string) {
		this.currency = code;
		await setSetting('currency', code);
	}
	async setRoundPrices(v: boolean) {
		this.roundPrices = v;
		await setSetting('round_prices', v);
	}
	async setBaseUrl(v: string) {
		this.baseUrl = v;
		await setSetting('base_url', v);
	}
	setLowThreshold(v: number) {
		this.lowThreshold = v;
		if (typeof localStorage !== 'undefined') localStorage.setItem(LOW_THRESHOLD_KEY, String(v));
	}

	/** A spool is "low" when in use and at/under the threshold. */
	isLow(remaining: number, unused: boolean): boolean {
		return !unused && remaining <= this.lowThreshold;
	}

	/** Format a price using the configured ISO currency, honoring round_prices. */
	formatPrice(value: number): string {
		const digits = this.roundPrices ? 0 : 2;
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: this.currency,
				minimumFractionDigits: digits,
				maximumFractionDigits: digits
			}).format(value);
		} catch {
			return `${value.toFixed(digits)} ${this.currency}`;
		}
	}

	/** Format a price's numeric part only (no currency symbol), honoring round_prices. */
	formatPriceValue(value: number): string {
		const digits = this.roundPrices ? 0 : 2;
		return value.toFixed(digits);
	}

	/** The configured currency's symbol, e.g. "€" or "$", for use as an input addon. */
	get currencySymbol(): string {
		try {
			const parts = new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: this.currency,
				currencyDisplay: 'narrowSymbol'
			}).formatToParts(0);
			return parts.find((p) => p.type === 'currency')?.value ?? this.currency;
		} catch {
			return this.currency;
		}
	}
}

export const settings = new Settings();
