<script lang="ts">
	import Toggle from '$components/Toggle.svelte';
	import Card from '$components/Card.svelte';
	import SettingRow from '$components/settings/SettingRow.svelte';
	import ExtraFieldsManager from '$components/settings/ExtraFieldsManager.svelte';
	import { settings } from '$lib/stores/settings.svelte';

	function saveCurrency(v: string) {
		const code = v.trim().toUpperCase();
		if (/^[A-Z]{3}$/.test(code)) settings.setCurrency(code).catch((e) => console.error(e));
	}
	function saveBaseUrl(v: string) {
		settings.setBaseUrl(v.trim()).catch((e) => console.error(e));
	}
</script>

<svelte:head>
	<title>Settings | Spoolman</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">Settings</div>
		<div class="subtitle">
			General settings and extra fields are stored on the server — applies to every client.
		</div>

		<div class="sec-label">General</div>
		<Card divided>
			<SettingRow title="Currency" desc="Three-letter ISO code (e.g. EUR, USD) used for prices">
				<input
					class="code mono"
					value={settings.currency}
					maxlength="3"
					onchange={(e) => saveCurrency(e.currentTarget.value)}
				/>
			</SettingRow>
			<SettingRow title="Round prices" desc="Hide decimals when displaying prices">
				<Toggle
					checked={settings.roundPrices}
					onchange={(v) => settings.setRoundPrices(v).catch((e) => console.error(e))}
				/>
			</SettingRow>
			<SettingRow title="External URL" desc="Base URL used in QR codes and links to this instance">
				<input
					class="url"
					value={settings.baseUrl}
					placeholder="https://spoolman.example.com"
					onchange={(e) => saveBaseUrl(e.currentTarget.value)}
				/>
			</SettingRow>
		</Card>

		<div class="sec-label">Library behavior</div>
		<Card divided>
			<SettingRow
				title="Low-stock threshold"
				desc="Spools at or below this weight are flagged red (this browser only)"
			>
				<input
					class="num mono"
					type="number"
					value={settings.lowThreshold}
					oninput={(e) => settings.setLowThreshold(Number(e.currentTarget.value) || 0)}
				/>
				<span class="unit">g</span>
			</SettingRow>
		</Card>

		<div class="sec-label">Extra fields</div>
		<div class="subtitle sub2">
			Define custom fields for spools, filaments and manufacturers. Field type and key can't change once created;
			choices can only be added.
		</div>
		<ExtraFieldsManager />
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		padding: 22px 24px 48px;
	}
	.wrap {
		max-width: 680px;
		margin: 0 auto;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-dim);
		margin-top: 3px;
	}
	.sub2 {
		margin-bottom: 10px;
		line-height: 1.5;
	}
	.sec-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		padding: 22px 0 8px;
	}
	.code,
	.url,
	.num {
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		color: var(--text);
		padding: 6px 10px;
		font-size: 12.5px;
	}
	.code {
		width: 70px;
		text-align: center;
		text-transform: uppercase;
	}
	.url {
		width: 260px;
		max-width: 45vw;
	}
	.num {
		width: 70px;
		text-align: right;
	}
	.unit {
		font-size: 12px;
		color: var(--text-dim);
	}
</style>
