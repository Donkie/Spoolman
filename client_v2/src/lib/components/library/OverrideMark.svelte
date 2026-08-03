<script lang="ts">
	// Three fields exist at more than one level of manufacturer → filament → spool,
	// and the closest level that has one wins: full weight and price (filament →
	// spool), and empty-spool weight (all three). Which value is actually in force
	// is otherwise invisible — the case behind #1013, where a spool kept the tare
	// weight it was created with while the panel displayed the filament's newer one
	// and the scale reading was reduced by neither of the two the user could see.
	//
	// So both ends of a disagreement get marked: the level that wins says what it
	// shadows, and the level that loses names the value that applies instead. The
	// losing value is rendered muted by its caller, which owns the value cell.
	interface Props {
		/** Already-phrased and already-formatted, e.g. "Overridden by this spool · 132 g". */
		label: string;
		/** This level's value is the one in force. Shadowed levels leave it off. */
		dominant?: boolean;
	}
	let { label, dominant = false }: Props = $props();
</script>

<span class="mark" class:dominant>{label}</span>

<style>
	.mark {
		display: inline-block;
		margin-left: 6px;
		padding: 1px 5px;
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-sm);
		font-family: var(--font-sans, inherit);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
		vertical-align: middle;
		color: var(--text-dim);
	}
	/* The value that actually applies. Warmer than the shadowed end so a glance at
	   a column of fields tells the two apart without reading either. */
	.dominant {
		border-color: var(--accent-soft);
		color: var(--accent-soft);
	}
	/* Long labels wrap to their own line rather than widening the value column and
	   pushing the number they annotate off the panel. */
	@media (max-width: 700px) {
		.mark {
			display: block;
			margin-left: 0;
			margin-top: 3px;
			width: fit-content;
		}
	}
</style>
