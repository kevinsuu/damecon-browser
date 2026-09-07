import {
  MASTER_SHIP_MATERIAL_TOOLTIP_DIAGNOSTIC_CHANNEL,
  SNAPSHOT_CHANGED_CHANNEL,
} from './browser/recommendation/channels'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import { injectIpc } from './preload-ipc.js'
import { ipcRenderer } from 'electron'
import { injectDefaultDailyImprovementFilter } from './browser/recommendation/daily-improvement-ui.js'
import { injectExpeditionGoalPlanner } from './browser/recommendation/expedition-goal-ui.js'
import { injectMasterShipMaterialTooltips } from './browser/recommendation/master-ship-material-tooltip-ui.js'
import { injectFleetRecommender } from './browser/recommendation/strategy-room-ui.js'
import { injectStrategyRoomRecentTabs } from './browser/recommendation/strategy-room-recent-ui.js'
import { injectQuestRecommendations } from './browser/recommendation/quest-recommendation-ui.js'
import { injectResourceLedgerSummary } from './browser/recommendation/resource-ledger-ui.js'
import { injectResourceCenter } from './browser/recommendation/resource-center-ui.js'
import { initializeDmmCredentialAutofill } from './browser/security/dmm-credential-autofill.js'

console.log('Trying to inject into', location.pathname)
const invoke = (channel, data) => ipcRenderer.invoke(channel, data)
const masterShipTooltipDiagnosticFingerprints = new Set()
const reportMasterShipTooltipDiagnostic = (diagnostic) => {
  const fingerprint = JSON.stringify(diagnostic)
  if (masterShipTooltipDiagnosticFingerprints.has(fingerprint)) return
  if (masterShipTooltipDiagnosticFingerprints.size >= 20) {
    masterShipTooltipDiagnosticFingerprints.clear()
  }
  masterShipTooltipDiagnosticFingerprints.add(fingerprint)
  ipcRenderer.send(MASTER_SHIP_MATERIAL_TOOLTIP_DIAGNOSTIC_CHANNEL, diagnostic)
}

// Inject <browser-action-list> element into WebUI
const localPages = [
  '/new-tab.html',
  '/settings.html',
  '/_generated_background_page.html',
  '/webui.html',
  '/search.html',
]
if (location.protocol === 'chrome-extension:' && localPages.includes(location.pathname)) {
  console.log('Successfully injected into', location.pathname)
  injectBrowserAction()
  injectIpc()
}

if (
  location.protocol === 'chrome-extension:' &&
  location.pathname === '/pages/strategy/strategy.html'
) {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const onSnapshotChanged = (callback) => {
        const listener = (_event, message) => callback(message)
        ipcRenderer.on(SNAPSHOT_CHANGED_CHANNEL, listener)
        return () => ipcRenderer.removeListener(SNAPSHOT_CHANGED_CHANNEL, listener)
      }
      injectFleetRecommender(invoke, onSnapshotChanged)
      injectExpeditionGoalPlanner(invoke)
      injectResourceCenter(invoke)
      injectResourceLedgerSummary(invoke)
      injectQuestRecommendations(invoke)
      injectStrategyRoomRecentTabs()
      injectDefaultDailyImprovementFilter()
      injectMasterShipMaterialTooltips({ reportDiagnostic: reportMasterShipTooltipDiagnostic })
    }, 0)
  })
}

if (location.protocol === 'https:' && location.hostname === 'accounts.dmm.com') {
  window.addEventListener('DOMContentLoaded', () => {
    void initializeDmmCredentialAutofill(invoke)
  })
}
