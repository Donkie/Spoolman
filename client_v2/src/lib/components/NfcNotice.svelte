<script lang="ts">
	interface Props {
		kind: 'info' | 'success' | 'error' | 'warning';
		message: string;
	}
	let { kind, message }: Props = $props();
</script>

<div class="notice {kind}">{message}</div>

<style>
	.notice {
		font-size: 12.5px;
		padding: 9px 12px;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
	}
	.info {
		background: var(--accent-wash-soft);
		border-color: var(--accent-soft);
		color: var(--text-2);
	}
	.success {
		background: color-mix(in srgb, var(--success, #2a9d5c) 12%, transparent);
		border-color: var(--success, #2a9d5c);
		color: var(--text-2);
	}
	.error {
		background: var(--danger-wash);
		border-color: var(--danger-soft);
		color: var(--text-2);
	}
	.warning {
		background: var(--unused-bg);
		border-color: var(--border-strong);
		color: var(--text-2);
	}
</style>
