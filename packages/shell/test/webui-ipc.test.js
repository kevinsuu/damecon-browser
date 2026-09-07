import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeConfigStore } from '../browser/config/runtime-config.js'
import {
  isAllowedMasterShipMaterialTooltipSender,
  registerMasterShipMaterialTooltipDiagnostics,
} from '../browser/recommendation/master-ship-material-tooltip-ipc.js'
import { createWebUiCommandRouter } from '../browser/ui/webui-command-router.js'
import {
  isAllowedWebUiSender,
  registerWebUiIpc,
  WEBUI_ALLOWED_PATHS,
} from '../browser/ui/webui-ipc.js'

const extensionId = 'fixture-webui-extension'
const eventFor = (url) => ({ senderFrame: { url }, sender: { getURL: () => url } })

test('master ship tooltip diagnostics accept only the current KC3 Strategy Room and bound output', () => {
  const logs = []
  let listener
  registerMasterShipMaterialTooltipDiagnostics({
    getKc3ExtensionId: () => extensionId,
    ipcMain: { on: (_channel, callback) => (listener = callback) },
    logger: (event, data) => logs.push({ event, data }),
  })
  const strategyEvent = eventFor(`chrome-extension://${extensionId}/pages/strategy/strategy.html`)
  listener(strategyEvent, {
    contentFound: true,
    enrichedCount: 1,
    outcome: 'targets-observed',
    phase: 'refresh',
    targetCount: 1,
    tooltips: [
      {
        attributes: [
          {
            iconCount: 1,
            icons: [
              {
                identifier: { type: 'useitem', id: 58 },
                source: `chrome-extension://${extensionId}/assets/img/useitems/58.png`,
              },
            ],
            name: 'titlealt',
            present: true,
          },
        ],
        outcome: 'enriched',
      },
    ],
  })

  assert.equal(
    isAllowedMasterShipMaterialTooltipSender(
      eventFor(`chrome-extension://${extensionId}/pages/strategy/strategy.html`),
      extensionId,
    ),
    true,
  )
  assert.equal(
    isAllowedMasterShipMaterialTooltipSender(
      eventFor(`chrome-extension://${extensionId}/pages/game/direct.html`),
      extensionId,
    ),
    false,
  )
  assert.deepEqual(logs[0], {
    event: 'master-ship-material-tooltip.diagnostic',
    data: {
      contentFound: true,
      enrichedCount: 1,
      outcome: 'targets-observed',
      phase: 'refresh',
      targetCount: 1,
      tooltips: [
        {
          attributes: [
            {
              iconCount: 1,
              icons: [
                {
                  identifier: 'useitem:58',
                  source: 'chrome-extension://<extension>/assets/img/useitems/58.png',
                },
              ],
              name: 'titlealt',
              present: true,
            },
          ],
          outcome: 'enriched',
        },
      ],
    },
  })
  assert.equal(logs[1].event, 'master-ship-material-tooltip.diagnostic-detail')
  assert.match(logs[1].data, /"identifier":"useitem:58"/)
  assert.match(logs[1].data, /"name":"titlealt"/)

  listener(eventFor('https://example.com/'), {})
  assert.equal(logs[2].data.reasonCode, 'UNSUPPORTED_SENDER')
})

test('runtime config store serves reads from memory and persists batched updates once', () => {
  const persisted = []
  let diskReads = 0
  const persistentStore = {
    get all() {
      diskReads += 1
      return { proxy: { enable: true }, window: { state: { width: 800 } } }
    },
    set: (updates) => persisted.push(updates),
    delete: () => {},
    clear: () => {},
    path: '/fixture/config.json',
  }
  const configStore = createRuntimeConfigStore(persistentStore)

  assert.equal(configStore.get('proxy.enable'), true)
  assert.equal(configStore.get('window.state.width'), 800)
  assert.equal(diskReads, 1)

  configStore.set({
    'window.state.width': 1280,
    'window.state.height': 720,
  })

  assert.deepEqual(persisted, [
    {
      'window.state.width': 1280,
      'window.state.height': 720,
    },
  ])
  assert.equal(configStore.get('window.state.width'), 1280)
  assert.equal(configStore.get('window.state.height'), 720)
  assert.equal(diskReads, 1)
})

test('webui IPC accepts only the current extension and five local pages', () => {
  for (const pagePath of WEBUI_ALLOWED_PATHS) {
    assert.equal(
      isAllowedWebUiSender(
        eventFor(`chrome-extension://${extensionId}${pagePath}?fixture=1`),
        extensionId,
      ),
      true,
    )
  }
  assert.equal(
    isAllowedWebUiSender(eventFor(`chrome-extension://another/settings.html`), extensionId),
    false,
  )
  assert.equal(
    isAllowedWebUiSender(eventFor(`chrome-extension://${extensionId}/other.html`), extensionId),
    false,
  )
  assert.equal(
    isAllowedWebUiSender(eventFor('https://example.com/settings.html'), extensionId),
    false,
  )
})

test('registerWebUiIpc preserves the meta/data call shape and rejects unsupported senders', async () => {
  let handler
  const calls = []
  registerWebUiIpc({
    ipcMain: { handle: (channel, callback) => ((handler = callback), calls.push(channel)) },
    getWebUiExtensionId: () => extensionId,
    route: (...args) => args,
  })
  const event = eventFor(`chrome-extension://${extensionId}/webui.html`)
  const meta = { type: 'get-config', windowId: 2 }
  const data = { untouched: true }
  assert.deepEqual(await handler(event, meta, data), [event, meta, data])
  assert.deepEqual(calls, ['webui-message'])

  await assert.rejects(
    handler(eventFor('chrome-extension://another/webui.html'), meta, data),
    /unsupported sender/,
  )
})

const createRouterFixture = () => {
  const order = []
  const values = new Map([
    ['proxy.mode', 'kccp-internal'],
    ['proxy.enable', true],
    ['window.view.hideAddressBarSites', []],
  ])
  const configStore = {
    get: (key) => values.get(key),
    set: (key, value) => {
      order.push(`config:${key}`)
      values.set(key, value)
      return 'saved'
    },
    all: { fixture: true },
  }
  const browser = {
    session: { clearCache: async () => order.push('clear-cache') },
    windows: [],
    sendToAllWindows: () => order.push('broadcast'),
    updateKccpMods: async () => order.push('update-mods'),
    startFindInPage: () => {},
    setFindInPageVisible: () => {},
    updateKc3: async () => {},
    applyProxy: async () => order.push('apply-proxy'),
  }
  const kccpService = {
    getStatus: () => ({ started: false }),
    getConfig: async () => ({ config: { autoUpdateGitMods: false } }),
    startStop: async () => order.push('start-stop'),
  }
  const nativeTheme = { themeSource: 'system' }
  const route = createWebUiCommandRouter({
    app: { getName: () => 'KanColle Assistant', getVersion: () => '1.0.0' },
    appDataDir: '/fixture/app-data',
    appDir: '/fixture/app',
    browser,
    configStore,
    dialog: {},
    fs: {},
    getKc3ExtensionId: () => 'kc3',
    hideHome: (value) => value,
    homeDataLocation: '/fixture/home',
    isMatch: () => false,
    kccpService,
    logger: { log: () => {}, error: () => {}, sendRecent: () => {} },
    logSource: 'fixture',
    nativeTheme,
    path: {},
    rootDir: '/fixture/root',
    settingsUrl: `chrome-extension://${extensionId}/settings.html`,
    shell: {},
  })
  return { browser, configStore, kccpService, nativeTheme, order, route }
}

test('webui command router preserves return values and proxy handler order', async () => {
  const fixture = createRouterFixture()
  assert.equal(
    await fixture.route(null, { type: 'get-damecon-version' }),
    'KanColle Assistant v1.0.0',
  )
  assert.deepEqual(await fixture.route(null, { type: 'get-config' }), { fixture: true })
  assert.equal(
    await fixture.route(null, { type: 'set-config-item' }, { key: 'proxy.enable', value: true }),
    'saved',
  )
  assert.deepEqual(fixture.order, ['config:proxy.enable', 'start-stop', 'apply-proxy', 'broadcast'])

  await fixture.route(
    null,
    { type: 'set-config-item' },
    { key: 'window.style.brightness', value: 'dark' },
  )
  assert.equal(fixture.nativeTheme.themeSource, 'dark')
})

test('WebUI command diagnostics report success, invalid input and service failures', async () => {
  const logs = []
  let handle
  registerWebUiIpc({
    ipcMain: {
      handle: (_channel, fn) => {
        handle = fn
      },
    },
    getWebUiExtensionId: () => extensionId,
    logger: (event, data) => logs.push({ event, data }),
    route: async (_event, meta) => {
      if (meta.type === 'get-config') return {}
      throw new Error('fixture')
    },
  })
  const event = eventFor(`chrome-extension://${extensionId}/webui.html`)
  await handle(event, { type: 'get-config' })
  await assert.rejects(handle(event, { type: 'unknown' }), /invalid command/)
  await assert.rejects(handle(event, { type: 'get-damecon-info' }), /fixture/)
  assert.ok(
    logs.some(
      (log) => log.event === 'webui.command-completed' && log.data.operation === 'get-config',
    ),
  )
  assert.ok(logs.some((log) => log.data.reasonCode === 'INVALID_COMMAND'))
  assert.ok(logs.some((log) => log.data.reasonCode === 'COMMAND_FAILED'))
})
