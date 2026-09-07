const EXTENSION_WINDOW_RESOLVER = Symbol('extensionWindowResolver')

/**
 * Makes electron-chrome-extensions resolve a BrowserView tab through its own
 * tab-to-window mapping. BrowserWindow.fromWebContents() returns null for a
 * BrowserView, even though the extension store already tracks its owner.
 */
export const installExtensionWindowResolver = ({ extensionStore, logger = () => {} }) => {
  if (extensionStore[EXTENSION_WINDOW_RESOLVER]) {
    return extensionStore[EXTENSION_WINDOW_RESOLVER]
  }

  const upstreamResolver = extensionStore.getWindowFromWebContents.bind(extensionStore)
  const resolvedBrowserViewContents = new WeakSet()
  const resolver = (webContents) => {
    const browserWindow = extensionStore.tabToWindow.get(webContents)
    if (
      browserWindow &&
      !browserWindow.isDestroyed() &&
      extensionStore.windows.has(browserWindow)
    ) {
      if (!resolvedBrowserViewContents.has(webContents)) {
        resolvedBrowserViewContents.add(webContents)
        logger('extension.browser-view-window-resolved', {
          webContentsId: webContents.id,
          windowId: browserWindow.id,
        })
      }
      return browserWindow
    }

    return upstreamResolver(webContents)
  }

  extensionStore.getWindowFromWebContents = resolver
  const dispose = () => {
    if (extensionStore.getWindowFromWebContents === resolver) {
      extensionStore.getWindowFromWebContents = upstreamResolver
    }
    delete extensionStore[EXTENSION_WINDOW_RESOLVER]
  }
  extensionStore[EXTENSION_WINDOW_RESOLVER] = dispose
  return dispose
}
