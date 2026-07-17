<script lang="ts">
	import Toggle from '$components/Toggle.svelte';
	import Card from '$components/Card.svelte';
	import SettingRow from '$components/settings/SettingRow.svelte';
	import ExtraFieldsManager from '$components/settings/ExtraFieldsManager.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { locales, getLocale, setLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages';
	import { languages } from '$lib/i18n/languages';

	function saveCurrency(v: string) {
		const code = v.trim().toUpperCase();
		if (/^[A-Z]{3}$/.test(code)) settings.setCurrency(code).catch((e) => console.error(e));
	}
	function saveBaseUrl(v: string) {
		settings.setBaseUrl(v.trim()).catch((e) => console.error(e));
	}

	let localeData = locales.map((code) => {
		return {
			code,
			langData: languages[code]
		};
	});
</script>

<svelte:head>
	<title>{m['documentTitle.settings.list']()}</title>
</svelte:head>

<div class="page scroll-y">
	<div class="wrap">
		<div class="title">{m['settings.header']()}</div>

		<div class="sec-label">{m['settings.appearance.tab']()}</div>
		<Card divided>
			<SettingRow title={m['settings.language.label']()} desc={m['settings.language.desc']()}>
				<select class="lang" value={getLocale()} onchange={(e) => setLocale(e.currentTarget.value)}>
					{#each localeData as locale (locale.code)}
						<option value={locale.code}>{locale.langData.name}</option>
					{/each}
				</select>
			</SettingRow>
		</Card>

		<div class="sec-label">{m['settings.general.tab']()}</div>
		<Card divided>
			<SettingRow title={m['settings.general.currency.label']()} desc={m['settings.general.currency.desc']()}>
				<input
					class="code mono"
					value={settings.currency}
					maxlength="3"
					onchange={(e) => saveCurrency(e.currentTarget.value)}
				/>
			</SettingRow>
			<SettingRow
				title={m['settings.general.roundPrices.label']()}
				desc={m['settings.general.roundPrices.tooltip']()}
			>
				<Toggle
					checked={settings.roundPrices}
					onchange={(v) => settings.setRoundPrices(v).catch((e) => console.error(e))}
					ariaLabel={m['settings.general.roundPrices.label']()}
				/>
			</SettingRow>
			<SettingRow
				title={m['settings.general.baseUrl.label']()}
				desc={m['settings.general.baseUrl.tooltip']()}
			>
				<input
					class="url"
					value={settings.baseUrl}
					placeholder="https://spoolman.example.com"
					onchange={(e) => saveBaseUrl(e.currentTarget.value)}
				/>
			</SettingRow>
		</Card>

		<div class="sec-label">{m['settings.library.tab']()}</div>
		<Card divided>
			<SettingRow
				title={m['settings.library.lowThreshold.label']()}
				desc={m['settings.library.lowThreshold.desc']()}
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

		<div class="sec-label">{m['settings.extraFields.tab']()}</div>
		<div class="subtitle sub2">
			<p>{m['settings.extraFields.description.intro']()}</p>
			<p>{m['settings.extraFields.description.constraints']()}</p>
			<p>{m['settings.extraFields.description.keyUsage']()}</p>
			<p>{m['settings.extraFields.description.tableViews']()}</p>
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
