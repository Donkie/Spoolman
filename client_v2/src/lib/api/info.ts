import { getJson } from './http';

// Backend build/runtime info, served once at startup from GET /info.
export interface Info {
	version: string;
	debug_mode: boolean;
	automatic_backups: boolean;
	data_dir: string;
	backups_dir: string;
	db_type: string;
	git_commit?: string;
	build_date?: string;
}

export function getInfo(): Promise<Info> {
	return getJson<Info>('/info');
}
