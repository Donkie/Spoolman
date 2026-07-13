<script lang="ts">
	// Self-contained date + time picker for a nullable ISO timestamp.
	//
	// We deliberately avoid the native `<input type="date/time/datetime-local">`
	// controls: their picker UX is wildly inconsistent across browsers — Firefox
	// in particular offers NO clickable time picker at all (time must be typed
	// digit by digit), which is what made the previous field feel broken. This
	// component renders its own calendar + time dropdowns in a popover, so both
	// date and time are always fully clickable and identical in every browser.
	interface Props {
		/** Current value as an ISO timestamp, or undefined if unset. */
		value: string | undefined;
		/** Emit the new ISO timestamp, or undefined to clear it. */
		oninput: (iso: string | undefined) => void;
	}
	let { value, oninput }: Props = $props();

	const pad = (n: number) => String(n).padStart(2, '0');
	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

	// --- popover open/close + positioning ------------------------------------
	let root = $state<HTMLDivElement>();
	let pop = $state<HTMLDivElement>();
	let open = $state(false);
	let popStyle = $state('');

	// --- working selection (mirrors `value` while the popover is open) --------
	// Selected calendar day (null = date not chosen yet) plus a separate view
	// month, so the user can browse months without changing the selection.
	let selYear = $state<number | null>(null);
	let selMonth = $state<number | null>(null);
	let selDay = $state<number | null>(null);
	let hour = $state(0);
	let minute = $state(0);
	let viewYear = $state(new Date().getFullYear());
	let viewMonth = $state(new Date().getMonth());

	function syncFromValue() {
		if (value) {
			const d = new Date(value);
			if (!Number.isNaN(d.getTime())) {
				selYear = d.getFullYear();
				selMonth = d.getMonth();
				selDay = d.getDate();
				hour = d.getHours();
				minute = d.getMinutes();
				viewYear = d.getFullYear();
				viewMonth = d.getMonth();
				return;
			}
		}
		const now = new Date();
		selYear = selMonth = selDay = null;
		hour = 0;
		minute = 0;
		viewYear = now.getFullYear();
		viewMonth = now.getMonth();
	}

	// Label shown on the trigger.
	let label = $derived.by(() => {
		if (!value) return '';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '';
		return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	});

	// Calendar grid: 6 weeks × 7 days, Monday-first, null = blank leading cell.
	let grid = $derived.by(() => {
		const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // 0 = Mon
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const cells: (number | null)[] = [];
		for (let i = 0; i < firstDow; i++) cells.push(null);
		for (let d = 1; d <= daysInMonth; d++) cells.push(d);
		while (cells.length % 7 !== 0) cells.push(null);
		while (cells.length < 42) cells.push(null);
		return cells;
	});

	const today = new Date();
	function isToday(day: number) {
		return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
	}
	function isSelected(day: number) {
		return selYear === viewYear && selMonth === viewMonth && selDay === day;
	}

	const hours = Array.from({ length: 24 }, (_, i) => i);
	const minutes = Array.from({ length: 60 }, (_, i) => i);

	// --- emit ----------------------------------------------------------------
	function commit() {
		if (selYear === null || selMonth === null || selDay === null) return;
		const d = new Date(selYear, selMonth, selDay, hour, minute, 0, 0);
		oninput(d.toISOString());
	}

	function pickDay(day: number) {
		selYear = viewYear;
		selMonth = viewMonth;
		selDay = day;
		commit();
	}
	function onHour(e: Event) {
		hour = Number((e.currentTarget as HTMLSelectElement).value);
		commit();
	}
	function onMinute(e: Event) {
		minute = Number((e.currentTarget as HTMLSelectElement).value);
		commit();
	}
	function prevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear -= 1;
		} else viewMonth -= 1;
	}
	function nextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear += 1;
		} else viewMonth += 1;
	}
	function setNow() {
		const now = new Date();
		viewYear = now.getFullYear();
		viewMonth = now.getMonth();
		selYear = now.getFullYear();
		selMonth = now.getMonth();
		selDay = now.getDate();
		hour = now.getHours();
		minute = now.getMinutes();
		commit();
	}
	function clear() {
		oninput(undefined);
		close();
	}

	// --- open/close ----------------------------------------------------------
	function position() {
		if (!root || !pop) return;
		const r = root.getBoundingClientRect();
		const ph = pop.offsetHeight;
		const pw = pop.offsetWidth;
		const gap = 4;
		let top = r.bottom + gap;
		if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - gap - ph);
		let left = r.left;
		if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - pw);
		popStyle = `top:${top}px; left:${left}px;`;
	}
	function toggle() {
		if (open) close();
		else {
			syncFromValue();
			open = true;
		}
	}
	function close() {
		open = false;
	}

	$effect(() => {
		if (!open) return;
		// Position once the popover is in the DOM, then keep it glued while open.
		position();
		const onDocPointer = (e: PointerEvent) => {
			if (root && !root.contains(e.target as Node)) close();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		const onScroll = () => close();
		document.addEventListener('pointerdown', onDocPointer, true);
		document.addEventListener('keydown', onKey);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onScroll);
		return () => {
			document.removeEventListener('pointerdown', onDocPointer, true);
			document.removeEventListener('keydown', onKey);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onScroll);
		};
	});
</script>

<div class="dtf" bind:this={root}>
	<button type="button" class="trigger" class:empty={!value} onclick={toggle} aria-haspopup="dialog" aria-expanded={open}>
		<span class="cal-icon" aria-hidden="true">🗓</span>
		<span class="trigger-label mono">{label || '—'}</span>
	</button>

	{#if open}
		<div class="pop" bind:this={pop} style={popStyle} role="dialog" aria-label="Pick date and time">
			<div class="cal-head">
				<button type="button" class="nav" onclick={prevMonth} aria-label="Previous month">‹</button>
				<span class="month-label">{MONTHS[viewMonth]} {viewYear}</span>
				<button type="button" class="nav" onclick={nextMonth} aria-label="Next month">›</button>
			</div>
			<div class="dow">
				{#each WEEKDAYS as w (w)}
					<span>{w}</span>
				{/each}
			</div>
			<div class="days">
				{#each grid as day, i (i)}
					{#if day === null}
						<span class="day blank"></span>
					{:else}
						<button
							type="button"
							class="day"
							class:selected={isSelected(day)}
							class:today={isToday(day)}
							onclick={() => pickDay(day)}
						>
							{day}
						</button>
					{/if}
				{/each}
			</div>
			<div class="time-row">
				<span class="time-label">Time</span>
				<select class="sel mono" value={hour} onchange={onHour} aria-label="Hour">
					{#each hours as h (h)}
						<option value={h}>{pad(h)}</option>
					{/each}
				</select>
				<span class="colon">:</span>
				<select class="sel mono" value={minute} onchange={onMinute} aria-label="Minute">
					{#each minutes as m (m)}
						<option value={m}>{pad(m)}</option>
					{/each}
				</select>
			</div>
			<div class="actions">
				<button type="button" class="link" onclick={clear}>Clear</button>
				<button type="button" class="link" onclick={setNow}>Now</button>
				<button type="button" class="done" onclick={close}>Done</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.dtf {
		position: relative;
		width: 100%;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px dashed #3a3a3a;
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		padding: 2px 0;
		cursor: pointer;
		text-align: left;
	}
	.trigger:hover,
	.trigger:focus-visible {
		border-bottom-color: var(--accent);
		outline: none;
	}
	.cal-icon {
		font-size: 12px;
		opacity: 0.75;
		flex: none;
	}
	.trigger.empty .trigger-label {
		color: var(--text-dim);
	}

	.pop {
		position: fixed;
		z-index: 100;
		width: 250px;
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
		padding: 10px;
		font-size: 12.5px;
	}
	.cal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}
	.month-label {
		font-weight: 600;
		color: var(--text);
	}
	.nav {
		background: none;
		border: none;
		color: var(--text-2);
		font-size: 18px;
		line-height: 1;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.nav:hover {
		background: var(--surface);
		color: var(--text);
	}
	.dow,
	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.dow span {
		text-align: center;
		color: var(--text-dim);
		font-size: 10.5px;
		padding: 3px 0;
	}
	.day {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--text-2);
		font: inherit;
		font-size: 12px;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.day.blank {
		cursor: default;
	}
	.day:not(.blank):hover {
		background: var(--surface);
		color: var(--text);
	}
	.day.today:not(.selected) {
		box-shadow: inset 0 0 0 1px var(--accent-border);
		color: var(--accent-soft);
	}
	.day.selected {
		background: var(--accent);
		color: #fff;
	}
	.time-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--border-soft);
	}
	.time-label {
		color: var(--text-muted);
		margin-right: auto;
	}
	.sel {
		background: var(--input-bg);
		border: 1px solid var(--border-input);
		border-radius: var(--radius-sm);
		color: var(--text);
		padding: 3px 4px;
		font-size: 12.5px;
	}
	.colon {
		color: var(--text-dim);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
	}
	.link {
		background: none;
		border: none;
		color: var(--accent-link);
		font: inherit;
		font-size: 11.5px;
		padding: 0;
		cursor: pointer;
	}
	.link:hover {
		color: var(--accent-link-hover);
	}
	.done {
		margin-left: auto;
		background: var(--accent);
		border: none;
		color: #fff;
		font: inherit;
		font-size: 11.5px;
		font-weight: 600;
		padding: 4px 12px;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.done:hover {
		background: var(--accent-hover);
	}
</style>
