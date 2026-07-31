// Ephemeral, non-URL UI state for the Library. Everything that should be
// shareable/bookmarkable (search, filters, grouping, sort, pagination,
// selection) lives in the URL instead — see lib/library/params.ts and the
// +page.ts load. What remains here is the transient add-spools modal, which has
// no place in the address bar.

class UiState {
	/** "Add spools" modal. `addModalFilamentId` pre-seeds it with a filament. */
	addModalOpen = $state(false);
	addModalFilamentId = $state<string | null>(null);
	/** When set, the modal opens on a new-filament form copied from this filament. */
	addModalDuplicateId = $state<string | null>(null);

	/** QR-code scanner modal (camera). */
	scannerOpen = $state(false);

	/** Open the Add-spools modal, optionally pre-seeded with a filament. */
	openAddModal(filamentId?: string) {
		this.addModalFilamentId = filamentId ?? null;
		this.addModalDuplicateId = null;
		this.addModalOpen = true;
	}
	/**
	 * Open the Add-spools modal on a new filament copied from `filamentId` — the
	 * "same filament, different colour" case, where everything but the name and
	 * colour carries over.
	 */
	openDuplicateModal(filamentId: string) {
		this.addModalFilamentId = null;
		this.addModalDuplicateId = filamentId;
		this.addModalOpen = true;
	}
	closeAddModal() {
		this.addModalOpen = false;
		this.addModalFilamentId = null;
		this.addModalDuplicateId = null;
	}

	openScanner() {
		this.scannerOpen = true;
	}
	closeScanner() {
		this.scannerOpen = false;
	}
}

export const ui = new UiState();
