<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve --
	   Every href below comes from a src/lib/library/params.ts helper, which already
	   resolves against the deploy base path; resolving again would double-apply it. */
	import Swatch from '../Swatch.svelte';
	import Button from '../Button.svelte';
	import ConfirmDialog from '../ConfirmDialog.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import EditableField from '../EditableField.svelte';
	import NumberInput from '../NumberInput.svelte';
	import SectionLabel from '../SectionLabel.svelte';
	import ExtraFieldsSection from '../ExtraFieldsSection.svelte';
	import FieldGrid from '../FieldGrid.svelte';
	import Field from '../Field.svelte';
	import type { Filament, Vendor } from '$lib/types';
	import { inventory } from '$lib/stores/inventory.svelte';
	import { page } from '$app/state';
	import * as params from '$lib/library/params';
	import { spoolSource } from '$lib/api/spoolSource';
	import { live } from '$lib/api/live';
	import { classifyDeleteFailure, planVendorDelete } from '$lib/library/deletion';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { makeSaver, makeExtraSaver } from '$lib/utils/saver';
	import { trackSave } from '$lib/utils/autosave';
	import * as m from '$lib/paraglide/messages';

	let { vendor }: { vendor: Vendor } = $props();

	// Depend on the primitive id (via $derived) — not `vendor` itself — so the
	// fetch's own cache upsert (which replaces the `vendor` prop object) doesn't
	// re-trigger this effect in an infinite loop.
	let vendorId = $derived(vendor.id);
	let filaments = $state<Filament[]>([]);
	// Bumped by live filament events. The list below is fetched server-side rather
	// than read from the cache, so it needs an explicit nudge — and the delete
	// dialog counts these filaments, so a stale count would misstate what a delete
	// is about to orphan.
	let revision = $state(0);
	$effect(() => live.subscribe('filament', {}, () => revision++));
	$effect(() => {
		const id = vendorId;
		void revision;
		let cancelled = false;
		spoolSource
			.listFilamentsByVendor(id)
			.then((list) => {
				if (!cancelled) filaments = list;
			})
			.catch((e) => console.error('Failed to load vendor filaments', e));
		return () => {
			cancelled = true;
		};
	});

	let initials = $derived(
		vendor.name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);

	const saver = makeSaver<string, Partial<Vendor>>((id, patch) =>
		trackSave(spoolSource.saveVendor(id, patch))
	);
	$effect(() => () => saver.flush());

	function set(patch: Partial<Vendor>) {
		inventory.patchVendor(vendor.id, patch);
		saver.push(vendor.id, patch);
	}

	const extraSaver = makeExtraSaver(
		() => vendor.id,
		(id, e) => inventory.patchVendor(id, { extra: e }),
		(id, p) => trackSave(spoolSource.saveVendor(id, { extra: p })),
		() => vendor.extra
	);
	$effect(() => () => extraSaver.flush());

	// --- delete -------------------------------------------------------------

	// Unlike a filament, a manufacturer can always be deleted — its filaments are
	// not deleted with it, they are left without a manufacturer. That is easy to
	// mistake for "delete everything from this brand", so the dialog says it
	// outright rather than asking a bare "are you sure?".
	let plan = $derived(planVendorDelete(filaments.length));

	let confirmOpen = $state(false);
	let deleting = $state(false);

	let confirmLines = $derived(
		plan.orphaned > 0
			? [
					m['inspector.delete.vendorBody']({ name: vendor.name }),
					m['inspector.delete.vendorOrphans']({ count: plan.orphaned })
				]
			: [m['inspector.delete.vendorBody']({ name: vendor.name })]
	);

	async function remove() {
		deleting = true;
		// The pending edit belongs to a vendor that is about to stop existing.
		saver.cancel();
		extraSaver.cancel();
		try {
			await spoolSource.deleteVendor(vendor.id);
			toasts.success(m['inspector.delete.vendorDone']());
			params.clearSelection();
		} catch (e) {
			console.error('Failed to delete manufacturer', e);
			if (classifyDeleteFailure(e) === 'gone') {
				toasts.error(m['inspector.delete.errorGone']());
				inventory.removeVendor(vendor.id);
				params.clearSelection();
			} else {
				toasts.error(m['inspector.delete.errorUnknown']());
			}
		} finally {
			deleting = false;
			confirmOpen = false;
		}
	}
</script>

<div class="insp">
	<div class="head">
		<div class="avatar">{initials}</div>
		<div class="titles">
			<div class="title">{vendor.name}</div>
			<div class="subtitle">
				{m['inspector.vendorSub']({
					count: filaments.length
				})}
			</div>
		</div>
		<div class="actions">
			<Button
				variant="danger-ghost"
				title={m['inspector.delete.vendor']()}
				ariaLabel={m['inspector.delete.vendor']()}
				disabled={deleting}
				onclick={() => (confirmOpen = true)}><Trash2 size={15} /></Button
			>
		</div>
	</div>

	<ConfirmDialog
		open={confirmOpen}
		busy={deleting}
		title={m['inspector.delete.vendorTitle']()}
		lines={confirmLines}
		confirmLabel={deleting ? m['inspector.delete.deleting']() : m['buttons.delete']()}
		onconfirm={remove}
		onclose={() => (confirmOpen = false)}
	/>

	<div class="grid">
		<div class="col">
			<SectionLabel>{m['filament.fields.vendor']()}</SectionLabel>
			<FieldGrid labelWidth="140px">
				<Field label={m['vendor.fields.name']()}>
					<EditableField value={vendor.name} oninput={(v) => set({ name: v })} />
				</Field>
				<Field label={m['vendor.fields.emptySpoolWeight']()} help={m['vendor.fieldsHelp.emptySpoolWeight']()}>
					<NumberInput
						dense
						unit="g"
						step={10}
						min={0}
						width="200px"
						value={vendor.emptyWeight}
						onchange={(v) => set({ emptyWeight: Math.round(v) })}
					/>
				</Field>
				<Field label={m['vendor.fields.registered']()}>{vendor.registeredLabel}</Field>
				<Field label={m['vendor.fields.comment']()}>
					<EditableField value={vendor.comment} oninput={(v) => set({ comment: v })} />
				</Field>
			</FieldGrid>

			<ExtraFieldsSection entity="vendor" extra={vendor.extra} onchange={extraSaver.change} manage />
		</div>
		<div class="col">
			<SectionLabel>{m['filament.filament']()}</SectionLabel>
			<div class="fils">
				{#each filaments as f (f.id)}
					<a
						class="fil-row"
						href={params.selectHref(page.url.searchParams, 'filament', f.id)}
						data-sveltekit-keepfocus
						data-sveltekit-noscroll
					>
						<Swatch colors={f.colors} direction={f.multiColorDirection} size={18} radius={5} />
						<span class="fname">{f.name}</span>
						<span class="meta">{f.material}</span>
					</a>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-soft);
	}
	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 9px;
		background: var(--surface-raised);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: var(--text-2);
		flex: none;
	}
	.title {
		font-weight: 700;
		font-size: 16px;
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 2px;
	}
	.actions {
		margin-left: auto;
		flex: none;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 32px;
		padding: 4px 20px 24px;
	}
	.fils {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.fil-row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 12px;
		background: var(--surface-2);
		border: 1px solid var(--swatch-border);
		border-radius: var(--radius-md);
		font-size: 12px;
		cursor: pointer;
		color: inherit;
		font-family: inherit;
		text-align: left;
		text-decoration: none;
	}
	.fil-row:hover {
		border-color: var(--swatch-border-hover);
	}
	.fname {
		font-weight: 600;
		flex: 1;
	}
	.meta {
		color: var(--text-dim);
	}
	@media (max-width: 620px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
