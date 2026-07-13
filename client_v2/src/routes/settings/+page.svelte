<script lang="ts">
	import Toggle from '$components/Toggle.svelte';
	import Card from '$components/Card.svelte';
	import SettingRow from '$components/settings/SettingRow.svelte';
	import ExtraFieldsManager from '$components/settings/ExtraFieldsManager.svelte';
	import Trans from '$lib/i18n/Trans.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { _, locale } from 'svelte-i18n';
	import { setLocale } from '$lib/i18n';
	import { languages } from '$lib/i18n/languages';

	function saveCurrency(v: string) {
		const code = v.trim().toUpperCase();
		if (/^[A-Z]{3}$/.test(code)) settings.setCurrency(code).catch((e) => console.error(e));
	}
	function saveBaseUrl(v: string) {
		settings.setBaseUrl(v.trim()).catch((e) => console.error(e));
	}
</script>

<svelte:head>
	<title>{$_('settings.header')} | Spoolman</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">{$_('settings.header')}</div>

		<div class="sec-label">{$_('settings.appearance.tab')}</div>
		<Card divided>
			<SettingRow title={$_('settings.language.label')} desc={$_('settings.language.desc')}>
				<select class="lang" value={$locale} onchange={(e) => setLocale(e.currentTarget.value)}>
					{#each Object.entries(languages) as [code, meta] (code)}
						<option value={code}>{meta.name}</option>
					{/each}
				</select>
			</SettingRow>
		</Card>

		<div class="sec-label">{$_('settings.general.tab')}</div>
		<Card divided>
			<SettingRow title={$_('settings.general.currency.label')} desc={$_('settings.general.currency.desc')}>
				<input
					class="code mono"
					value={settings.currency}
					maxlength="3"
					onchange={(e) => saveCurrency(e.currentTarget.value)}
				/>
			</SettingRow>
			<SettingRow
				title={$_('settings.general.round_prices.label')}
				desc={$_('settings.general.round_prices.desc')}
			>
				<Toggle
					checked={settings.roundPrices}
					onchange={(v) => settings.setRoundPrices(v).catch((e) => console.error(e))}
				/>
			</SettingRow>
			<SettingRow
				title={$_('settings.general.external_url.label')}
				desc={$_('settings.general.external_url.desc')}
			>
				<input
					class="url"
					value={settings.baseUrl}
					placeholder="https://spoolman.example.com"
					onchange={(e) => saveBaseUrl(e.currentTarget.value)}
				/>
			</SettingRow>
		</Card>

		<div class="sec-label">{$_('settings.library.tab')}</div>
		<Card divided>
			<SettingRow
				title={$_('settings.library.low_threshold.label')}
				desc={$_('settings.library.low_threshold.desc')}
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

		<div class="sec-label">{$_('settings.extra_fields.tab')}</div>
		<div class="subtitle sub2"><Trans key="settings.extra_fields.description" /></div>
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
	.num,
	.lang {
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		color: var(--text);
		padding: 6px 10px;
		font-size: 12.5px;
	}
	.lang {
		min-width: 160px;
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
