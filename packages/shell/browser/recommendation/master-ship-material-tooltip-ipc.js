import { MASTER_SHIP_MATERIAL_TOOLTIP_DIAGNOSTIC_CHANNEL } from './channels'

const STRATEGY_ROOM_PATH = '/pages/strategy/strategy.html'
const MAX_DIAGNOSTIC_ELEMENTS = 3
const MAX_DIAGNOSTIC_ICONS = 12

const boundedInteger = (value, maximum) =>
  Number.isInteger(value) && value >= 0 ? Math.min(value, maximum) : 0

const sanitizeIconSource = (value) =>
  String(value || '')
    .replace(/^chrome-extension:\/\/[^/]+/i, 'chrome-extension://<extension>')
    .slice(0, 180)

const normalizeIcon = (icon) => ({
  identifier:
    icon?.identifier?.type === 'useitem' && Number.isInteger(icon.identifier.id)
      ? `useitem:${icon.identifier.id}`
      : icon?.identifier?.type === 'consumable' && typeof icon.identifier.id === 'string'
        ? `consumable:${icon.identifier.id.slice(0, 40)}`
        : 'unrecognized',
  source: sanitizeIconSource(icon?.source),
})

const normalizeDiagnostic = (diagnostic) => ({
  contentFound: diagnostic?.contentFound === true,
  enrichedCount: boundedInteger(diagnostic?.enrichedCount, MAX_DIAGNOSTIC_ELEMENTS),
  outcome: typeof diagnostic?.outcome === 'string' ? diagnostic.outcome.slice(0, 40) : 'unknown',
  phase: typeof diagnostic?.phase === 'string' ? diagnostic.phase.slice(0, 40) : 'unknown',
  targetCount: boundedInteger(diagnostic?.targetCount, MAX_DIAGNOSTIC_ELEMENTS),
  tooltips: Array.isArray(diagnostic?.tooltips)
    ? diagnostic.tooltips.slice(0, MAX_DIAGNOSTIC_ELEMENTS).map((tooltip) => ({
        attributes: Array.isArray(tooltip?.attributes)
          ? tooltip.attributes.slice(0, 2).map((attribute) => ({
              iconCount: boundedInteger(attribute?.iconCount, MAX_DIAGNOSTIC_ICONS),
              icons: Array.isArray(attribute?.icons)
                ? attribute.icons.slice(0, MAX_DIAGNOSTIC_ICONS).map(normalizeIcon)
                : [],
              name: attribute?.name === 'titlealt' ? 'titlealt' : 'title',
              present: attribute?.present === true,
            }))
          : [],
        outcome: typeof tooltip?.outcome === 'string' ? tooltip.outcome.slice(0, 40) : 'unknown',
      }))
    : [],
})

export const isAllowedMasterShipMaterialTooltipSender = (event, extensionId) => {
  if (!extensionId) return false
  try {
    const url = new URL(event.senderFrame?.url || event.sender.getURL())
    return (
      url.protocol === 'chrome-extension:' &&
      url.hostname === extensionId &&
      url.pathname === STRATEGY_ROOM_PATH
    )
  } catch {
    return false
  }
}

export const registerMasterShipMaterialTooltipDiagnostics = ({
  getKc3ExtensionId,
  ipcMain,
  logger = () => {},
}) => {
  ipcMain.on(MASTER_SHIP_MATERIAL_TOOLTIP_DIAGNOSTIC_CHANNEL, (event, diagnostic) => {
    if (!isAllowedMasterShipMaterialTooltipSender(event, getKc3ExtensionId())) {
      logger('master-ship-material-tooltip.diagnostic-rejected', {
        outcome: 'rejected',
        reasonCode: 'UNSUPPORTED_SENDER',
      })
      return
    }

    const normalizedDiagnostic = {
      outcome: 'observed',
      ...normalizeDiagnostic(diagnostic),
    }
    logger('master-ship-material-tooltip.diagnostic', normalizedDiagnostic)
    logger('master-ship-material-tooltip.diagnostic-detail', JSON.stringify(normalizedDiagnostic))
  })
}
