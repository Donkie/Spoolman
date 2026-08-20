import { rm, mkdir } from 'node:fs/promises';
import { SURFACES_DIR, REPORT_PATH } from './report';

// Runs once before the suite: clear any per-surface results and the report from
// a previous run so the new report reflects only this run.
export default async function globalSetup() {
	await rm(SURFACES_DIR, { recursive: true, force: true });
	await rm(REPORT_PATH, { force: true });
	await mkdir(SURFACES_DIR, { recursive: true });
}
