# Master Ship Remodel Materials

KanColle Assistant supplements KC3Kai's Master Ship (`艦娘圖鑑`) remodel-material tooltip.
KC3Kai provides the material icon and required quantity, but its generated tooltip does not include
the material name. The shell turns every material in that tooltip into its own row with an icon,
localized name, and required quantity before it is shown.

The shell uses the Strategy Room page's configured language and a compact table for the remodel
materials KC3Kai can render in this tooltip. This keeps the feature available from Electron's
isolated preload world, which cannot access KC3Kai's page-global metadata directly.

KC3Kai replaces Master Ship content while switching ships. The preload therefore observes Strategy
Room changes and reapplies the enrichment to newly generated remodel-material tooltips. It does not
modify KC3Kai's downloaded extension files, so the behavior survives KC3Kai updates.

KC3Kai may store the live tooltip in `titlealt` after its lazy tooltip handler initializes. The
shell updates both `title` and `titlealt`; an absent `title` must not prevent `titlealt` from being
processed.

KC3Kai ships special remodel-material icons from both `useitems` and its higher-resolution
`useitems_p2` directory. Both paths map to the same use-item IDs and localized names.

For diagnostics, the Strategy Room preload reports bounded material-tooltip state to the main
process log: content-root and target counts, whether enrichment occurred, and each displayed
icon's recognized material identifier. Icon paths are shortened and extension IDs are redacted.
