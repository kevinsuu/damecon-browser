import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { installExtensionWindowResolver } from '../browser/services/extension-window-routing'
import { createWebUiBridge } from '../browser/ui/webui-bridge'

test('extension window routing resolves tracked BrowserView tabs before the upstream fallback', () => {
  const fallbackWindow = { id: 2 }
  const browserWindow = { id: 1, isDestroyed: () => false }
  const browserViewContents = { id: 10 }
  const extensionStore = {
    getWindowFromWebContents: () => fallbackWindow,
    tabToWindow: new WeakMap([[browserViewContents, browserWindow]]),
    windows: new Set([browserWindow]),
  }
  const diagnostics = []

  const dispose = installExtensionWindowResolver({
    extensionStore,
    logger: (event, data) => diagnostics.push({ event, data }),
  })

  assert.equal(extensionStore.getWindowFromWebContents(browserViewContents), browserWindow)
  assert.equal(extensionStore.getWindowFromWebContents(browserViewContents), browserWindow)
  assert.equal(extensionStore.getWindowFromWebContents({ id: 11 }), fallbackWindow)
  assert.deepEqual(diagnostics, [
    {
      event: 'extension.browser-view-window-resolved',
      data: { webContentsId: 10, windowId: 1 },
    },
  ])

  dispose()
  assert.equal(extensionStore.getWindowFromWebContents(browserViewContents), fallbackWindow)
})

test('WebUI bridge restricts commands, strips Electron events and owns subscriptions', async () => {
  const ipc = new EventEmitter(),
    calls = []
  ipc.invoke = (...args) => {
    calls.push(args)
    return Promise.resolve('ok')
  }
  const { api, dispose } = createWebUiBridge(ipc, 'linux')
  assert.equal(api.send, undefined)
  await assert.rejects(api.sendWebUiCommand({ type: 'unknown' }), /Invalid/)
  await assert.rejects(
    api.sendWebUiCommand({ type: 'set-config-item' }, { key: '__proto__.a', value: true }),
    /Invalid/,
  )
  assert.equal(calls.length, 0)
  assert.equal(await api.sendWebUiCommand({ type: 'get-config' }), 'ok')
  const received = [],
    unsubscribe = api.onWebUiMessage((...args) => received.push(args))
  ipc.emit('webui-message', { secret: 'electron' }, { type: 'ready' })
  assert.deepEqual(received, [[{ type: 'ready' }]])
  unsubscribe()
  unsubscribe()
  api.onLogUpdate(() => {})
  dispose()
  dispose()
  assert.equal(ipc.listenerCount('webui-message'), 0)
  assert.equal(ipc.listenerCount('update'), 0)
})
