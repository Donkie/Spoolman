<script lang="ts">
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

	<a class="sponsor" href="https://github.com/sponsors/Donkie" target="_blank" rel="noopener noreferrer">
		<!-- Octicon heart-fill, inlined so the footer needs no request to github.com. -->
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path
				d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002Z"
			/>
		</svg>
		{m.sponsor()}
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
	.sponsor {
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
	.sponsor:hover {
		border-color: var(--accent);
	}
	.sponsor svg {
		height: 16px;
		width: 16px;
		fill: #db61a2;
	}

	@media (max-width: 560px) {
		.footer {
			padding: 6px 12px;
		}
		.sponsor {
			font-size: 0;
			gap: 0;
			padding: 5px 8px;
		}
		.sponsor svg {
			height: 18px;
			width: 18px;
		}
	}
</style>
