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
	//
	// Styled as a footnote rather than a badge: accent-coloured text, but none of
	// the pill's border, weight or uppercasing. Those sit in a column of otherwise
	// quiet fields and are read once, when something looks wrong, so a badge gave
	// them the weight of a warning and made the panel tiring to look at. The colour
	// on its own is enough to find them again. It carries no meaning beyond that —
	// the wording says which end of the override you are looking at.
	interface Props {
		/** Already-phrased and already-formatted, e.g. "Overridden by this spool · 132 g". */
		label: string;
	}
	let { label }: Props = $props();
</script>

<span class="mark">{label}</span>

<style>
	.mark {
		display: inline-block;
		margin-left: 7px;
		font-family: var(--font-sans, inherit);
		font-size: 10.5px;
		white-space: nowrap;
		vertical-align: middle;
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
