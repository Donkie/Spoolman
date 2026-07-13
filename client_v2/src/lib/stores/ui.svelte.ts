// Ephemeral, non-URL UI state for the Library. Everything that should be
// shareable/bookmarkable (search, filters, grouping, sort, pagination,
// selection) lives in the URL instead — see lib/library/params.ts and the
// +page.ts load. What remains here is the transient add-spools modal, which has
// no place in the address bar.

class UiState {
	/** "Add spools" modal. `addModalFilamentId` pre-seeds it with a filament. */
	addModalOpen = $state(false);
	addModalFilamentId = $state<string | null>(null);

	/** QR-code scanner modal (camera). */
	scannerOpen = $state(false);

	/** Open the Add-spools modal, optionally pre-seeded with a filament. */
	openAddModal(filamentId?: string) {
		this.addModalFilamentId = filamentId ?? null;
		this.addModalOpen = true;
	}
	closeAddModal() {
		this.addModalOpen = false;
		this.addModalFilamentId = null;
	}

	openScanner() {
		this.scannerOpen = true;
	}
	closeScanner() {
		this.scannerOpen = false;
	}
}

export const ui = new UiState();
