import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SURFACES_DIR, REPORT_PATH, TAP_MIN, type SurfaceResult } from './report';

// Runs once after the suite (in the main process, so it survives worker
// restarts): read every per-surface JSON and render the consolidated report.
export default async function globalTeardown() {
	let files: string[] = [];
	try {
		files = (await readdir(SURFACES_DIR)).filter((f) => f.endsWith('.json'));
	} catch {
		return;
	}

	const results: SurfaceResult[] = [];
	for (const f of files) {
		try {
			results.push(JSON.parse(await readFile(path.join(SURFACES_DIR, f), 'utf8')));
		} catch {
			/* ignore malformed */
		}
	}
	results.sort((a, b) => a.order - b.order);

	const esc = (s: string) => s.replace(/\|/g, '\\|');
	const lines: string[] = [];
	lines.push('# Mobile accessibility audit — client_v2');
	lines.push('');
	lines.push(`Device profile: **Pixel 5** (393×851 CSS px, touch). Generated ${new Date().toISOString()}.`);
	lines.push('');
	lines.push(
		`Advisory tap-target minimum: **${TAP_MIN}px**. WCAG 2.2 target-size (24px) failures appear under axe.`
	);
	lines.push('');

	const totalAxe = results.reduce((n, s) => n + s.axe.reduce((m, v) => m + v.nodes, 0), 0);
	const totalSmall = results.reduce((n, s) => n + s.smallTargets.length, 0);
	lines.push('## Summary');
	lines.push('');
	lines.push(`- Surfaces audited: **${results.length}**`);
	lines.push(`- Total axe violation instances: **${totalAxe}**`);
	lines.push(`- Total tap targets under ${TAP_MIN}px: **${totalSmall}**`);
	lines.push('');

	for (const s of results) {
		lines.push(`## ${s.label}`);
		lines.push(`\`${s.url}\``);
		lines.push('');
		if (s.axe.length === 0) {
			lines.push('**axe:** no violations ✅');
		} else {
			lines.push('**axe violations:**');
			lines.push('');
			lines.push('| Rule | Impact | Instances | Example target |');
			lines.push('| --- | --- | --- | --- |');
			for (const v of s.axe) {
				lines.push(
					`| ${v.id} — ${esc(v.help)} | ${v.impact ?? '?'} | ${v.nodes} | \`${esc((v.targets[0] ?? '').slice(0, 50))}\` |`
				);
			}
		}
		lines.push('');
		if (s.smallTargets.length === 0) {
			lines.push(`**Tap targets:** all ≥ ${TAP_MIN}px ✅`);
		} else {
			lines.push(`**Tap targets under ${TAP_MIN}px (${s.smallTargets.length}):**`);
			lines.push('');
			lines.push('| Element | Size (w×h) | Text/label |');
			lines.push('| --- | --- | --- |');
			for (const t of s.smallTargets.slice(0, 30)) {
				lines.push(`| \`${esc(t.selector.slice(0, 40))}\` | ${t.width}×${t.height} | ${esc(t.text)} |`);
			}
			if (s.smallTargets.length > 30) lines.push(`| … | | +${s.smallTargets.length - 30} more |`);
		}
		lines.push('');
	}

	await writeFile(REPORT_PATH, lines.join('\n'), 'utf8');
	console.log(`\nWrote ${path.relative(process.cwd(), REPORT_PATH)} (${results.length} surfaces)`);
}
