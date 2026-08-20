<script lang="ts">
	// Small server/browser segmented switch shared by the three NFC modals —
	// reading/writing can happen through the server-attached reader or, on
	// browsers that support it, through the Web NFC API directly.
	interface Props {
		mode: 'server' | 'browser';
		serverEnabled: boolean;
		browserEnabled: boolean;
		serverLabel: string;
		browserLabel: string;
		onchange: (mode: 'server' | 'browser') => void;
	}
	let { mode, serverEnabled, browserEnabled, serverLabel, browserLabel, onchange }: Props = $props();
</script>

<div class="switch">
	<button
		type="button"
		class="opt"
		class:active={mode === 'server'}
		disabled={!serverEnabled}
		onclick={() => onchange('server')}
	>
		{serverLabel}
	</button>
	<button
		type="button"
		class="opt"
		class:active={mode === 'browser'}
		disabled={!browserEnabled}
		onclick={() => onchange('browser')}
	>
		{browserLabel}
	</button>
</div>

<style>
	.switch {
		display: flex;
		gap: 4px;
		padding: 3px;
		background: var(--surface-raised);
		border-radius: var(--radius-md);
	}
	.opt {
		flex: 1;
		background: none;
		border: none;
		color: var(--text-2);
		font-size: 12.5px;
		font-weight: 500;
		padding: 7px 10px;
		border-radius: var(--radius);
		cursor: pointer;
	}
	.opt:hover:not(:disabled) {
		color: var(--text);
	}
	.opt.active {
		background: var(--bg);
		color: var(--text);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
	}
	.opt:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
