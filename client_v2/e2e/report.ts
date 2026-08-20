// Shared types and paths for the mobile-a11y audit's file-based result
// aggregation. Each test writes one JSON file per audited surface into
// SURFACES_DIR; globalTeardown reads them all and renders a11y-report.md.
//
// We go through disk rather than module-level state because Playwright may
// recycle the worker process between failing tests, which would wipe any
// in-memory accumulator before the final report is written.
import path from 'node:path';

export const TAP_MIN = 44;

export const SURFACES_DIR = path.resolve('test-results', 'a11y-surfaces');
export const REPORT_PATH = path.resolve('a11y-report.md');

export interface TapTarget {
	tag: string;
	text: string;
	selector: string;
	width: number;
	height: number;
}

export interface SurfaceResult {
	order: number;
	label: string;
	url: string;
	axe: {
		id: string;
		impact: string | null | undefined;
		help: string;
		nodes: number;
		targets: string[];
	}[];
	smallTargets: TapTarget[];
}
