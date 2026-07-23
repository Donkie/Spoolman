<script lang="ts">
	// Self-contained date + time picker for a nullable ISO timestamp.
	//
	// We deliberately avoid the native `<input type="date/time/datetime-local">`
	// controls: their picker UX is wildly inconsistent across browsers — Firefox
	// in particular offers NO clickable time picker at all (time must be typed
	// digit by digit), which is what made the previous field feel broken. This
	// component renders its own calendar + time dropdowns in a popover, so both
	// date and time are always fully clickable and identical in every browser.
	import { languages } from '$lib/i18n/languages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDateTime } from '$lib/utils/datetime';
	import * as m from '$lib/paraglide/messages';
	import Calendar from '@lucide/svelte/icons/calendar';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { portal } from '$lib/actions/portal';

	interface Props {
		/** Current value as an ISO timestamp, or undefined if unset. */
		value: string | undefined;
		/** Emit the new ISO timestamp, or undefined to clear it. */
		oninput: (iso: string | undefined) => void;
	}
	let { value, oninput }: Props = $props();

	const pad = (n: number) => String(n).padStart(2, '0');
	// Month and weekday names come from Intl in the active locale; months use a
	// mid-month date to dodge timezone edge cases.
	const dtLocale = $derived(languages[getLocale()].code);

	// First day of the week per locale (1 = Monday … 7 = Sunday). Some locales
	// (e.g. en-US) start the week on Sunday, others on Saturday. Fall back to
	// Monday if the browser lacks Intl.Locale week info.
	const firstDay = $derived.by(() => {
		try {
			const loc = new Intl.Locale(dtLocale) as Intl.Locale & {
				weekInfo?: { firstDay: number };
				getWeekInfo?: () => { firstDay: number };
			};
			const info = loc.getWeekInfo?.() ?? loc.weekInfo;
			if (info?.firstDay) return info.firstDay;
		} catch {
			/* older browsers: fall through */
		}
		return 1;
	});
	// JS getDay() index (0 = Sunday) of the locale's first weekday.
	const firstJsDay = $derived(firstDay % 7);

	// Weekday short names, ordered starting from the locale's first day.
	// 2021-10-31 was a Sunday, so `Oct 31 + jsDay` yields a date with that weekday.
	const WEEKDAYS = $derived(
		Array.from({ length: 7 }, (_v, i) =>
			new Intl.DateTimeFormat(dtLocale, { weekday: 'short' }).format(
				new Date(2021, 9, 31 + ((firstJsDay + i) % 7))
			)
		)
	);
	const MONTHS = $derived(
		Array.from({ length: 12 }, (_v, m) =>
			new Intl.DateTimeFormat(dtLocale, { month: 'long' }).format(new Date(2021, m, 15))
		)
	);

	// Whether the active locale prefers a 12-hour clock (AM/PM) over 24-hour.
	const hour12 = $derived.by(() => {
		try {
			return new Intl.DateTimeFormat(dtLocale, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
		} catch {
			return false;
		}
	});
	// Localized AM/PM (day-period) labels for the 12-hour meridiem picker.
	const meridiems = $derived.by(() => {
		const label = (h: number) =>
			new Intl.DateTimeFormat(dtLocale, { hour: 'numeric', hour12: true })
				.formatToParts(new Date(2021, 0, 1, h))
				.find((p) => p.type === 'dayPeriod')?.value;
		return { am: label(9) ?? 'AM', pm: label(21) ?? 'PM' };
	});

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

	// Label shown on the trigger. Shared with datetime extra fields via
	// `formatDateTime` so both render identically.
	let label = $derived(formatDateTime(value));

	// Calendar grid: 6 weeks × 7 days, ordered from the locale's first weekday,
	// null = blank leading cell.
	let grid = $derived.by(() => {
		const firstDow = (new Date(viewYear, viewMonth, 1).getDay() - firstJsDay + 7) % 7;
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
	// 12-hour clock face, ordered 12, 1, 2 … 11.
	const hours12 = [12, ...Array.from({ length: 11 }, (_, i) => i + 1)];
	const minutes = Array.from({ length: 60 }, (_, i) => i);

	// 12-hour view of the internal 0-23 `hour`.
	const displayHour = $derived(hour % 12 === 0 ? 12 : hour % 12);
	const isPm = $derived(hour >= 12);

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
	function onHour12(e: Event) {
		const h12 = Number((e.currentTarget as HTMLSelectElement).value); // 1-12
		hour = (h12 % 12) + (isPm ? 12 : 0);
		commit();
	}
	function onMeridiem(e: Event) {
		const pm = (e.currentTarget as HTMLSelectElement).value === 'pm';
		hour = (hour % 12) + (pm ? 12 : 0);
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
			// The popover is portaled to <body> (see below), so a click inside it is
			// no longer inside `root` — check it separately or picking a date closes
			// the popup instead of registering.
			const t = e.target as Node;
			if (root && !root.contains(t) && pop && !pop.contains(t)) close();
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
	<button
		type="button"
		class="trigger"
		class:empty={!value}
		onclick={toggle}
		aria-haspopup="dialog"
		aria-expanded={open}
	>
		<span class="cal-icon" aria-hidden="true"><Calendar size={14} /></span>
		<span class="trigger-label mono">{label || '—'}</span>
	</button>

	{#if open}
		<div
			class="pop"
			bind:this={pop}
			use:portal
			style={popStyle}
			role="dialog"
			aria-label={m['datetime.pick']()}
		>
			<div class="cal-head">
				<button type="button" class="nav" onclick={prevMonth} aria-label={m['datetime.prevMonth']()}
					><ChevronLeft size={18} /></button
				>
				<span class="month-label">{MONTHS[viewMonth]} {viewYear}</span>
				<button type="button" class="nav" onclick={nextMonth} aria-label={m['datetime.nextMonth']()}
					><ChevronRight size={18} /></button
				>
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
				<span class="time-label">{m['datetime.time']()}</span>
				{#if hour12}
					<select class="sel mono" value={displayHour} onchange={onHour12} aria-label={m['datetime.hour']()}>
						{#each hours12 as h (h)}
							<option value={h}>{pad(h)}</option>
						{/each}
					</select>
				{:else}
					<select class="sel mono" value={hour} onchange={onHour} aria-label={m['datetime.hour']()}>
						{#each hours as h (h)}
							<option value={h}>{pad(h)}</option>
						{/each}
					</select>
				{/if}
				<span class="colon">:</span>
				<select class="sel mono" value={minute} onchange={onMinute} aria-label={m['datetime.minute']()}>
					{#each minutes as m (m)}
						<option value={m}>{pad(m)}</option>
					{/each}
				</select>
				{#if hour12}
					<select
						class="sel meridiem"
						value={isPm ? 'pm' : 'am'}
						onchange={onMeridiem}
						aria-label={m['datetime.time']()}
					>
						<option value="am">{meridiems.am}</option>
						<option value="pm">{meridiems.pm}</option>
					</select>
				{/if}
			</div>
			<div class="actions">
				<button type="button" class="link" onclick={clear}>{m['buttons.clear']()}</button>
				<button type="button" class="link" onclick={setNow}>{m['datetime.now']()}</button>
				<button type="button" class="done" onclick={close}>{m['datetime.done']()}</button>
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
		border-bottom: 1px dashed var(--track);
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
	.meridiem {
		margin-left: 6px;
		text-transform: uppercase;
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
