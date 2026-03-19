"""Concept application stubs registered at startup for UI testing and demonstration.

These applications are descriptive only — they have no backend logic and are all
disabled by default. They populate the Applications catalog so the UI is immediately
testable and visually compelling.

Future phases will implement actual functionality for each of these concepts.
See: https://github.com/akira69/spoolman-workspace/blob/main/Agent%20Memories/pr878-summary.md
"""

from spoolman.applications import ApplicationDefinition, ApplicationSurface, register_application
from spoolman.extra_fields import EntityType


def register_demo_applications() -> None:
    """Register all demo/concept application stubs."""
    register_application(
        ApplicationDefinition(
            key="spool_count",
            app_key="spool_count",
            icon="🔢",
            entity_type=EntityType.filament,
            name="Spool Count",
            description="Shows the number of spools associated with each filament directly in the filament list.",
            enable_description="Adds a Spools column to the filament list showing total and available spool counts.",
            surfaces=[ApplicationSurface.list, ApplicationSurface.derived],
        )
    )

    register_application(
        ApplicationDefinition(
            key="inventory_alerts",
            app_key="inventory_alerts",
            icon="🔔",
            entity_type=EntityType.spool,
            name="Inventory Alerts",
            description=(
                "Warns when a spool's remaining weight drops below a configurable threshold, "
                "helping you reorder before running out."
            ),
            enable_description="Adds alert badges to low-stock spool rows and a summary warning on the dashboard.",
            surfaces=[ApplicationSurface.list, ApplicationSurface.action],
        )
    )

    register_application(
        ApplicationDefinition(
            key="drying_tracker",
            app_key="drying_tracker",
            icon="🌡️",
            entity_type=EntityType.spool,
            name="Drying Tracker",
            description=(
                "Record drying cycles for hygroscopic filaments. "
                "Tracks temperature, duration, and the date each spool was last dried."
            ),
            enable_description=(
                "Adds drying cycle history to spool detail pages and a drying status badge in the spool list."
            ),
            surfaces=[ApplicationSurface.show, ApplicationSurface.edit, ApplicationSurface.list],
        )
    )

    register_application(
        ApplicationDefinition(
            key="print_history",
            app_key="print_history",
            icon="🖨️",
            entity_type=EntityType.spool,
            name="Print History",
            description=(
                "Log which files were printed with each spool, along with estimated weight consumed per print job."
            ),
            enable_description=(
                "Adds a print history tab to spool detail pages and shows a running consumed-weight total."
            ),
            surfaces=[ApplicationSurface.show, ApplicationSurface.action],
        )
    )

    register_application(
        ApplicationDefinition(
            key="weight_audit",
            app_key="weight_audit",
            icon="⚖️",
            entity_type=EntityType.spool,
            name="Weight Audit Trail",
            description=(
                "Maintains a timestamped log of every weight change made to a spool, "
                "making it easy to track consumption over time."
            ),
            enable_description="Adds a weight history tab to spool detail pages with a consumption graph.",
            surfaces=[ApplicationSurface.show, ApplicationSurface.list],
        )
    )

    register_application(
        ApplicationDefinition(
            key="qr_customization",
            app_key="qr_customization",
            icon="📱",
            entity_type=EntityType.spool,
            name="QR Code Customization",
            description=(
                "Choose which spool and filament fields are encoded in the label QR code. "
                "Supports NFC tags and Home Assistant integrations."
            ),
            enable_description="Adds a QR field configuration panel to spool settings and label printing options.",
            surfaces=[ApplicationSurface.action],
        )
    )

    register_application(
        ApplicationDefinition(
            key="filament_textures",
            app_key="filament_textures",
            icon="🎨",
            entity_type=EntityType.filament,
            name="Filament Textures",
            description=(
                "Add texture classification to filaments: Matte, Silk, Glossy, Sparkle, Wood-fill, and others. "
                "Makes it easy to filter and search by surface finish."
            ),
            enable_description=(
                "Adds a Texture field to filament create/edit forms "
                "and enables texture-based filtering in the filament list."
            ),
            surfaces=[ApplicationSurface.show, ApplicationSurface.edit, ApplicationSurface.list],
        )
    )

    register_application(
        ApplicationDefinition(
            key="storage_conditions",
            app_key="storage_conditions",
            icon="🏠",
            entity_type=EntityType.spool,
            name="Storage Conditions",
            description=(
                "Log where each spool is stored and optionally record ambient humidity "
                "and temperature readings at the storage location."
            ),
            enable_description="Adds storage location and conditions fields to spool detail and edit pages.",
            surfaces=[ApplicationSurface.show, ApplicationSurface.edit],
        )
    )

    # Future application ideas (not yet implemented):
    #
    # - Compatibility Notes: which printer/nozzle/settings work best per filament
    # - Purchase Tracker: order IDs, receipts, price paid per spool (#292 related)
    # - Reorder Automation: generate shopping list when stock drops below threshold (#834)
    # - Color Matching Log: record print result vs expected color per spool
    # - Filament Aging: opened-date tracking + shelf-life expiration warnings
    # - Carbon Footprint: CO2 per gram consumed estimate by material type
    # - Bambu Lab Sync: pull current spool from AMS automatically (#217)
    # - Hygroscopic Tracking: detailed moisture %, drying history, sensor data (#609)
    # - OctoEverywhere Integration: sync with OctoPrint/Klipper printers (#788)
    # - Custom Export Formats: Hueforge JSON, other slicer export plugins (#854)
