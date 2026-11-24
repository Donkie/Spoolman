<script lang="ts">
	import Card from '../Card.svelte';
	import Button from '../Button.svelte';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';
	import { settings } from '$lib/stores/settings.svelte';
	import { HttpError } from '$lib/api/http';
	import { toasts } from '$lib/stores/toasts.svelte';
	import * as m from '$lib/paraglide/messages';

	let draft = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function save(next: string[]): Promise<boolean> {
		busy = true;
		error = null;
		try {
			await settings.setCorsOrigins(next);
			toasts.success(m['notifications.saveSuccessful']());
			return true;
		} catch (e) {
			console.error('Failed to save trusted origins', e);
			const message = e instanceof HttpError ? e.body?.message : undefined;
			error =
				typeof message === 'string'
					? message
					: m['notifications.error']({ statusCode: e instanceof HttpError ? e.status : '?' });
			return false;
		} finally {
			busy = false;
		}
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const origin = draft.trim();
		if (!origin) return;
		if (await save([...settings.corsOrigins, origin])) draft = '';
	}

	function remove(origin: string) {
		save(settings.corsOrigins.filter((o) => o !== origin));
	}
</script>

<Card divided>
	{#each settings.corsOrigins as origin (origin)}
		<div class="row">
			<span class="origin mono">{origin}</span>
			<Button
				variant="danger-ghost"
				ariaLabel={m['settings.network.corsOrigins.remove']({ origin })}
				title={m['settings.network.corsOrigins.remove']({ origin })}
				disabled={busy}
				onclick={() => remove(origin)}
			>
				<X size={15} />
			</Button>
		</div>
	{:else}
		<div class="row empty">{m['settings.network.corsOrigins.none']()}</div>
	{/each}
	<form class="row" onsubmit={add}>
		<input
			class="url mono"
			aria-label={m['settings.network.corsOrigins.label']()}
			placeholder="http://fluidd.local:8080"
			autocomplete="off"
			spellcheck="false"
			bind:value={draft}
			oninput={() => (error = null)}
		/>
		<Button variant="outline" type="submit" disabled={busy || !draft.trim()}>
			<Plus size={15} />
			{m['settings.network.corsOrigins.add']()}
		</Button>
	</form>
</Card>
{#if error}<div class="error" role="alert">{error}</div>{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		min-height: 44px;
		box-sizing: border-box;
	}
	.origin {
		flex: 1;
		font-size: 12.5px;
		overflow-wrap: anywhere;
	}
	.empty {
		font-size: 12px;
		color: var(--text-dim);
	}
	.url {
		flex: 1;
		min-width: 0;
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius);
		color: var(--text);
		padding: 6px 10px;
		font-size: 12.5px;
	}
	.error {
		margin-top: 8px;
		font-size: 12px;
		color: var(--danger-soft);
		line-height: 1.5;
	}
</style>
