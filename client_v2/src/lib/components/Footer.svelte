<script lang="ts">
	import { asset } from '$app/paths';
	import { getInfo, type Info } from '$lib/api/info';
	import * as m from '$lib/paraglide/messages';

	let info = $state<Info | null>(null);

	$effect(() => {
		getInfo()
			.then((i) => (info = i))
			.catch((e) => console.error('Failed to load version info', e));
	});
</script>

<footer class="footer">
	<div class="version" title={info?.build_date ?? ''}>
		Spoolman
		{#if info}
			v{info.version}{#if info.git_commit}<span class="commit"> ({info.git_commit})</span>{/if}
		{/if}
		·
		<a href="https://github.com/Donkie/Spoolman">{m['footer.documentation']()}</a>
		·
		<a href="https://github.com/Donkie/Spoolman/issues">{m['footer.reportIssue']()}</a>
	</div>

	<a class="kofi" href="https://ko-fi.com/donkie" target="_blank" rel="noopener noreferrer">
		<img src={asset('/kofi_s_logo_nolabel.png')} alt="" />
		{m.kofi()}
	</a>
</footer>

<style>
	.footer {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 6px 18px;
		background: var(--surface);
		border-top: 1px solid var(--border);
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.version {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.commit {
		color: var(--text-faint);
	}
	.kofi {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 4px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--input-bg);
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		transition: border-color 0.12s;
	}
	.kofi:hover {
		border-color: var(--accent);
	}
	.kofi img {
		height: 16px;
		width: auto;
	}

	@media (max-width: 560px) {
		.footer {
			padding: 6px 12px;
		}
		.kofi {
			font-size: 0;
			gap: 0;
			padding: 5px 8px;
		}
		.kofi img {
			height: 18px;
		}
	}
</style>
