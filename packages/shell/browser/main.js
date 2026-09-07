import { registerAppShutdown } from './services/app-shutdown'
import { installExtensionWindowResolver } from './services/extension-window-routing'
import { applyProxySettings, readProxyDestination } from './services/proxy-settings'
import path from 'path'
import fsSync, { utimesSync } from 'fs'
const https = require('https')
const { Readable } = require('stream')
import {
  app,
  session,
  net,
  BrowserWindow,
  Notification,
  globalShortcut,
  ipcMain,
  nativeTheme,
  screen,
  dialog,
  autoUpdater,
  webFrameMain,
  protocol,
  shell,
  safeStorage,
} from 'electron'
import { EventEmitter } from 'events'

if (require('electron-squirrel-startup')) app.quit()
app.setName('KanColle Assistant')
app.setAppUserModelId('io.github.kevinsuu.kancolle-assistant')

import { updateElectronApp, UpdateSourceType } from 'update-electron-app'

// Application config
import ConfigStore from 'configstore'
import { configSchema, updateConfigDefaults, populateConfigDefaults } from './ui/config-utils.js'
import { createRuntimeConfigStore } from './config/runtime-config'

// These two break if using import syntax...?
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const { installChromeWebStore, loadAllExtensions } = require('electron-chrome-web-store')

import { buildChromeContextMenu } from 'electron-chrome-context-menu'
import setupMenu from './menu'
import Tabs from './tabs'
import {
  captureStartupDisplayMetrics,
  calculateGameAndSidebarWindowLayout,
  constrainWindowSizeToDisplay,
  fitGameTabOnce,
  fitGameTabToCurrentViewport,
  fitWindowForGameAndSidebar,
} from './display/game-auto-fit'
import {
  DEVTOOLS_LOCALE_INFOBAR_DEFAULTS_VERSION,
  estimateKc3SidebarWidth,
  initializeDevToolsPreferences,
  showKc3DevToolsPanel,
} from './devtools/kc3-devtools'
import { createMainBootstrap } from './main-bootstrap'
import { createKC3QuestLiveSync } from './recommendation/kc3-quest-live-sync'
import { registerMasterShipMaterialTooltipDiagnostics } from './recommendation/master-ship-material-tooltip-ipc'

import { setTimeout as delay } from 'timers/promises'
import { debug, error } from 'console'

// for wildcard matching URLs to hide address bar for
import { isMatch } from 'matcher'

// Updaters
import { createNodeWorker } from './workers/worker-shim'
import updateWorker from 'worker-loader?filename=updater.worker.js!./workers/updater-worker.js'

const mainBootstrap = createMainBootstrap()
const kccpService = mainBootstrap.kccpService
const kccp = { logger: kccpService.logger, kccpLogSource: kccpService.logSource }

const logSource = 'kancolle-assistant'
const legacyAppName = 'Damecon'
const legacyConfigId = 'damecon-browser'

const homePath = app.getPath('home')
const hideHome = function (filePath) {
  return filePath.replace(homePath, process.platform == 'win32' ? '%USERPROFILE%' : '~')
}

const devtoolsDebug = true
const shellDebug = process.env.SHELL_DEBUG

// folder the app was launched from
// for installed versions, this is the squirrel folder, not the folder containing resource.
let appDir = app.getAppPath()
kccp.logger.log(logSource, 'Base appPath:', hideHome(appDir))
let isSquirrel = false
//added case insentivity flag
const appDirCheck =
  /^(?<base>.+?)[\\/](?<path>(?<squirrelpath>app-\d+\.\d+\.\d+[\\/])?resources[\\/]app\.asar)$/i.exec(
    appDir,
  )
if (!!appDirCheck) {
  appDir = appDirCheck.groups.base
  isSquirrel = !!appDirCheck.groups.squirrelpath
}
kccp.logger.log(logSource, `${isSquirrel ? 'Running' : 'Not running'} via Squirrel.`)

// Preserve Damecon's storage locations so the rebrand does not hide existing user data.
const appDataDir = path.join(app.getPath('appData'), legacyAppName)

// store config.json in the app folder when running packaged.
const cfgOpts = {}
if (app.commandLine.hasSwitch('config-path')) {
  let cfgPath = app.commandLine.getSwitchValue('config-path')
  console.log('User-provided config path:', cfgPath)
  if (!path.isAbsolute(cfgPath)) cfgPath = path.join(appDir, cfgPath)
  if (!path.extname(cfgPath)) cfgPath = path.join(cfgPath, 'config.json')
  cfgOpts.configPath = cfgPath
} else if (app.isPackaged) {
  cfgOpts.configPath = path.join(appDir, 'config.json')
  console.log('Config path: ', hideHome(cfgOpts.configPath))
} else {
  cfgOpts.globalConfigPath = true
  console.log('Using global config path.')
}
console.log('Using config path:', cfgOpts.configPath)

const preexisting = fsSync.existsSync(path.join(appDir, 'userdata'))
if (preexisting) console.log('Detected preexisting userdata at current app location.')

updateConfigDefaults({ isSquirrel, preexisting })

const persistentConfigStore = new ConfigStore(legacyConfigId, {}, cfgOpts)

const cfg = persistentConfigStore.all
kccp.logger.log(logSource, 'Populating defaults for config')
const configModified = populateConfigDefaults(cfg, configSchema, (...input) =>
  kccp.logger.log(logSource, ...input),
)

// config fixes
if (cfg.proxy.client.enable === 'false') cfg.proxy.client.enable = false // i'm stupid
if (typeof cfg.proxy.client.enable !== 'undefined') {
  cfg.proxy.enable = cfg.proxy.client.enable
  delete cfg.proxy.client.enable
}
persistentConfigStore.all = cfg // save with updated defaults
const configStore = createRuntimeConfigStore(persistentConfigStore, cfg)

if (!configStore.get('window.behavior.occlusion'))
  app.commandLine.appendSwitch('disable-renderer-backgrounding')

//app.commandLine.appendSwitch('host-resolver-rules', 'MAP localhost 127.0.0.1') // wants to prefer IPv6 otherwise
app.commandLine.appendSwitch('allow-insecure-localhost')

const gpuConfig = configStore.get('window.gpu')
app.commandLine.appendSwitch(
  'force-gpu-mem-available-mb',
  Math.max(256, gpuConfig.availableMemoryMb),
)
if (gpuConfig.rasterization) app.commandLine.appendSwitch('force-gpu-rasterization')
if (gpuConfig.nativeBuffers) app.commandLine.appendSwitch('enable-native-gpu-memory-buffers')
if (gpuConfig.compositorResources)
  app.commandLine.appendSwitch('enable-gpu-memory-buffer-compositor-resources')
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

//app.userAgentFallback = app.userAgentFallback.replace(' Electron/' + process.versions.electron, '');
// Shorten 'Electron' so we can bypass Google's "Unsecure" browser block without losing version information
app.userAgentFallback = app.userAgentFallback.replace(' Electron/', ' Elec/')
console.log('User-Agent:', app.userAgentFallback)

// determine where the userdata/extensions folders should be stored
const homeDataLocation = path.join(homePath, legacyAppName)
const dataLocation = cfg.app.data.location
let dataPath = appDir
switch (dataLocation) {
  case 'home':
    dataPath = homeDataLocation
    break
  case 'appdata':
    dataPath = appDataDir
    break
  case 'custom':
    if (fsSync.existsSync(cfg.app.data.customPath)) dataPath = cfg.app.data.customPath
}
const userDataPath = path.join(dataPath, 'userdata')
app.setPath('userData', userDataPath)

if (process.execPath.match(/(kancolle-assistant|damecon(-browser)?|chrome)/)) {
  const currentPath = path.dirname(process.execPath)
  console.log('process.execPath', process.execPath)
  console.log('currentPath', currentPath)
} else {
  // app.commandLine.appendSwitch('proxy-server', '192.168.0.123:1235')
}

// https://www.electronforge.io/config/plugins/webpack#main-process-code
const SHELL_ROOT_DIR = path.join(__dirname, '../../')
const ROOT_DIR = path.join(__dirname, '../../../../')
const PATHS = {
  USERDATA: userDataPath,
  APPDATA: appDataDir,
  APPDIR: appDir,
  HOME: app.getPath('home'),
  WEBUI: app.isPackaged
    ? path.resolve(process.resourcesPath, 'ui')
    : path.resolve(SHELL_ROOT_DIR, 'browser', 'ui'),
  WORKERS: app.isPackaged
    ? path.resolve(process.resourcesPath, 'workers')
    : path.resolve(SHELL_ROOT_DIR, 'browser', 'workers'),
  PRELOAD: path.join(__dirname, '../renderer/browser/preload.js'),
  APP_ICON: app.isPackaged
    ? path.resolve(process.resourcesPath, 'ui', 'assets', 'icons', 'logo.png')
    : path.resolve(ROOT_DIR, 'logo.png'),
  LOCAL_EXTENSIONS: path.join(dataPath, 'extensions'),
  KC3_EXTENSIONS: path.join(dataPath, 'extensions'),
  //KC3_EXTENSIONS: path.join(ROOT_DIR, 'ext_kc3kai'),
}

const recommendationWorkerPath = app.isPackaged
  ? 'recommendation.worker.js'
  : path.join(PATHS.WORKERS, 'recommendation-worker.js')

const initializeKc3DevToolsDefaults = () => {
  const localeInfobarDefaultsVersion =
    configStore.get('kc3kai.startup.devtoolsLocaleInfobarDefaultsVersion') || 0

  try {
    const result = initializeDevToolsPreferences({
      hideLocaleInfobar: localeInfobarDefaultsVersion < DEVTOOLS_LOCALE_INFOBAR_DEFAULTS_VERSION,
      preferencesPath: path.join(PATHS.USERDATA, 'Preferences'),
    })
    if (result.changed) {
      kccp.logger.log(logSource, 'Configured KC3 DevTools defaults.')
    }
    configStore.set(
      'kc3kai.startup.devtoolsLocaleInfobarDefaultsVersion',
      DEVTOOLS_LOCALE_INFOBAR_DEFAULTS_VERSION,
    )
  } catch (error) {
    kccp.logger.error(logSource, 'Unable to configure KC3 DevTools defaults.', error)
  }
}

kccp.logger.log(logSource, `Is packaged: ${app.isPackaged}`)
console.log(`SHELL_ROOT_DIR: ${SHELL_ROOT_DIR}`)
console.log(`ROOT_DIR: ${ROOT_DIR}`)
console.log(`PATHS:`, PATHS)

// only allow one instance to run for now
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
  console.log("!! shouldn't see me !!")
} else {
  initializeKc3DevToolsDefaults()
}

let webuiExtensionId
let webuiUrl

let kc3ExtensionId
let kc3StartPageUrl
let DMMPageUrl
const DMM_REGION_BLOCK_URL = 'https://special.dmm.com/not-available-in-your-region/'
let newTabUrl
let searchUrl
let settingsUrl
let confirmCloseUrls = []
const isDmmRegionBlockUrl = (value) => {
  try {
    return new URL(value).href.startsWith(DMM_REGION_BLOCK_URL)
  } catch {
    return false
  }
}
const isDmmGamePageUrl = (value) =>
  value === DMMPageUrl || value.startsWith(`${DMMPageUrl}?`) || value.startsWith(`${DMMPageUrl}/`)
const isKc3GamePageUrl = (value) => value === kc3StartPageUrl || isDmmGamePageUrl(value)
const manifestExists = async (dirPath) => {
  if (!dirPath) return false
  const manifestPath = path.join(dirPath, 'manifest.json')
  try {
    return (await fs.stat(manifestPath)).isFile()
  } catch {
    return false
  }
}

let appUpdateCheckInFlight = false
const appUpdaterInitialized = isSquirrel && configStore.get('app.update.auto')

const checkForAppUpdates = async (trigger) => {
  if (!appUpdaterInitialized || appUpdateCheckInFlight) return

  appUpdateCheckInFlight = true
  kccp.logger.log(logSource, `Checking for app updates (${trigger}).`)
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    kccp.logger.error(logSource, 'Unable to check for app updates.', error)
  } finally {
    appUpdateCheckInFlight = false
  }
}

if (isSquirrel) {
  // clear old versions
  if (configStore.get('app.update.removeOld')) {
    kccp.logger.log(logSource, 'Removing previous versions.')
    const entries = fsSync.readdirSync(appDir)
    entries.forEach((entry) => {
      const match = entry.match(/^app-(?<version>\d+\.\d+\.\d+)$/)
      if (!match) return
      const version = match.groups.version
      if (version == app.getVersion()) return
      const entryPath = path.join(appDir, entry)
      const info = fsSync.statSync(entryPath)
      if (info.isFile()) return
      kccp.logger.log(logSource, 'Removing', entry)
      try {
        fsSync.rmdirSync(entryPath, { recursive: true })
      } catch (error) {
        kccp.logger.log(logSource, `Couldn't remove old version ${version}:`, error)
      }
    })
  }

  // auto update
  if (appUpdaterInitialized) {
    kccp.logger.log(logSource, 'Checking for updates.')
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: 'kevinsuu/kancolle-assistant',
      },
      updateInterval: '6 hours',
      logger: { log: (msg) => kccp.logger.log('update-electron-app', msg) },
    })
  }
}

const getParentWindowOfTab = (tab) => {
  switch (tab.getType()) {
    case 'window':
      return BrowserWindow.fromWebContents(tab)
    case 'browserView':
    case 'webview':
      return tab.getOwnerBrowserWindow()
    case 'backgroundPage':
      return BrowserWindow.getFocusedWindow()
    default:
      throw new Error(`Unable to find parent window of '${tab.getType()}'`)
  }
}

class TabbedBrowserWindow {
  constructor(options) {
    const self = this

    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })

    this.session = options.session || session.defaultSession
    this.extensions = options.extensions

    // Can't inheret BrowserWindow
    // https://github.com/electron/electron/issues/23#issuecomment-19613241
    this.window = new BrowserWindow(options.window)
    this.id = this.window.id

    self.initTabs(options)

    // load window chrome
    this.webContents = this.window.webContents
    this.webContents.on('did-finish-load', async () => {
      this.webContents.send('webui-message', {
        type: 'webui-init',
        meta: { windowId: this.id, allTabs: true },
        data: { windowId: this.window.id },
      })

      await this.ready

      if (!this.tabs.tabList.length) {
        queueMicrotask(async () => {
          for (const url of options.initialUrls) {
            const tab = this.tabs.create({ initialUrl: url })
            this.tabs.select(tab.id)
          }
        })
      }
    })
    this.webContents.loadURL(webuiUrl)
  }

  initTabs(options) {
    const self = this
    const tabsOpts = { newTabPageUrl: newTabUrl, searchPageUrl: searchUrl }
    this.tabs = new Tabs(this.window, tabsOpts)

    this.tabs.on('tab-created', function onTabCreated(tab) {
      //tab.loadURL(options.urls.newtab)

      // Track tab that may have been created outside of the extensions API.
      self.extensions.addTab(tab.webContents, tab.window)
    })

    this.tabs.on('tab-navigated', function onTabNavigated(tab, tabUrl) {
      //console.log(">> main.tabs.on('tab-navigated', tabsOpts)")
      if (isDmmRegionBlockUrl(tabUrl)) {
        tab.gameResponsiveFitEnabled = false
        self.showDmmRegionBlockDialog(tab).catch((error) => {
          kccp.logger.error(logSource, 'Unable to show the DMM regional access warning.', error)
        })
        return
      }
      tab.dmmRegionBlockDialogShown = false

      const isKc3StartPage = tabUrl === kc3StartPageUrl
      const isDmmGamePage = isDmmGamePageUrl(tabUrl)
      const canOpenGameDevtools = isKc3StartPage || isDmmGamePage
      if (!isDmmGamePage) {
        tab.appUpdateCheckedForGameSession = false
        tab.gameResponsiveFitEnabled = false
      } else if (!tab.appUpdateCheckedForGameSession) {
        tab.appUpdateCheckedForGameSession = true
        void checkForAppUpdates('game opened')
      }

      if (
        isDmmGamePage &&
        configStore.get('window.view.autoFitGameOnStartup') &&
        configStore.get('kc3kai.startup.openDevtools')
      ) {
        const plannedLayout = calculateGameAndSidebarWindowLayout({
          displayMetrics: options.startupDisplayMetrics,
          sidebarWidth: estimateKc3SidebarWidth(options.startupDisplayMetrics.workAreaSize.width),
          topBarHeight: tab.view.getBounds().y || undefined,
        })
        if (plannedLayout.applied) {
          tab.webContents.setZoomFactor(plannedLayout.zoomFactor)
          tab.gamePlannedZoomFactor = plannedLayout.zoomFactor
        }
      }

      if (
        canOpenGameDevtools &&
        configStore.get('kc3kai.startup.openDevtools') &&
        !tab.gameDevtoolsPrepared
      ) {
        tab.gameDevtoolsPrepared = true
        tab.gameDevtoolsReady = (async () => {
          // delaying opening of devtools on initial tab load
          const delaySeconds = configStore.get('kc3kai.startup.openDevtoolsDelay') || 0
          await delay(delaySeconds * 1000)
          if (!tab.webContents.isDevToolsOpened()) {
            tab.webContents.openDevTools({ activate: true })
          }
          await delay(300)
          if (tab.gameDevtoolsLayoutReady) await tab.gameDevtoolsLayoutReady
        })().catch((error) => {
          kccp.logger.error(logSource, 'Unable to open game DevTools.', error)
        })
      }

      if (
        isDmmGamePage &&
        configStore.get('window.view.autoFitGameOnStartup') &&
        !tab.gameAutoFitScheduled
      ) {
        tab.gameAutoFitScheduled = true
        kccp.logger.log(logSource, 'display.game-auto-fit-scheduled', {
          source: 'main-frame-navigation',
          tabUrl,
          webContentsId: tab.webContents.id,
        })
        const autoFitFromMainProcess = async () => {
          if (tab.gameDevtoolsReady) await tab.gameDevtoolsReady
          const devtoolsResult = tab.gameDevtoolsLayoutReady
            ? await tab.gameDevtoolsLayoutReady
            : null
          if (devtoolsResult?.layout?.applied) {
            const windowFit = fitWindowForGameAndSidebar({
              tab,
              displayMetrics: options.startupDisplayMetrics,
              sidebarWidth: devtoolsResult.layout.sidebarWidth,
            })
            kccp.logger.log(logSource, 'display.game-window-layout', windowFit)
            if (windowFit.applied) tab.webContents.setZoomFactor(windowFit.zoomFactor)
          }
          const result = await fitGameTabOnce({
            tab,
            displayMetrics: options.startupDisplayMetrics,
            logger: (eventName, data) => kccp.logger.log(logSource, eventName, data),
          })
          tab.gameResponsiveFitEnabled =
            result.applied &&
            !tab.webContents.isDestroyed() &&
            isDmmGamePageUrl(tab.webContents.getURL())
          if (!result.applied) tab.gameAutoFitScheduled = false
        }
        autoFitFromMainProcess().catch((error) => {
          tab.gameAutoFitScheduled = false
          tab.gameResponsiveFitEnabled = false
          kccp.logger.error(logSource, 'Unable to auto-fit game tab.', error)
        })
      }
    })

    this.tabs.on('tab-selected', function onTabSelected(tab) {
      //console.log(">> main.tabs.on('tab-selected', tabsOpts)")
      self.extensions.selectTab(tab.webContents)
    })

    this.tabs.on('tabs-hidden', function onTabsHidden(hidden) {
      //console.log(">> main.tabs.on('tabs-hidden', tabsOpts)")
      self.webContents.send('webui-message', {
        windowId: this.id,
        allTabs: true,
        message: 'tabs-hidden',
        value: hidden,
      })
    })
  }

  async showDmmRegionBlockDialog(tab) {
    if (tab.dmmRegionBlockDialogShown || this.window.isDestroyed()) return
    tab.dmmRegionBlockDialogShown = true

    kccp.logger.error(logSource, 'DMM blocked access based on the current network region.', {
      url: tab.webContents.getURL(),
      webContentsId: tab.webContents.id,
    })

    const result = await dialog.showMessageBox(this.window, {
      type: 'warning',
      buttons: ['Open Settings', 'Retry', 'Dismiss'],
      defaultId: 0,
      cancelId: 2,
      title: 'DMM regional access blocked',
      message: 'DMM determined that the current connection is outside its supported region.',
      detail:
        'If you are on a supported network, disable an unintended VPN or proxy. Otherwise, open the Proxy settings and configure All external with an authorized Japan HTTP/HTTPS proxy. KCCacheProxy alone does not change your public IP.',
    })

    if (this.window.isDestroyed() || tab.destroyed) return
    if (result.response === 0) {
      const existingSettingsTab = this.tabs.tabList.find(
        (candidate) => candidate.webContents.getURL() === settingsUrl,
      )
      const settingsTab = existingSettingsTab || this.tabs.create({ initialUrl: settingsUrl })
      this.tabs.select(settingsTab.id)
    } else if (result.response === 1) {
      tab.dmmRegionBlockDialogShown = false
      await tab.loadURL(DMMPageUrl || 'https://play.games.dmm.com/game/kancolle')
    }
  }

  destroy() {
    this.tabs?.destroy()
    this.window?.destroy()
  }

  getFocusedTab() {
    return this.tabs.selected
  }
}

function logBytes(x, showAll = false) {
  if (!showAll && x[0] != 'rss') return
  console.log(x[0], x[1] / (1000.0 * 1000), 'MB')
}

function getMemory() {
  Object.entries(process.memoryUsage()).map((e) => logBytes(e))
}

class Browser extends EventEmitter {
  windows = []
  kccpMainWindow = null
  currentWindowId = null
  currentKc3ExtensionId = null
  kc3IsUpdating = false
  kccpModderIsUpdating = false
  isProxyEnabled = false
  questLiveSync = null
  session = null
  startupDisplayMetrics = null

  urls = {
    newtab: 'about:blank',
  }

  constructor() {
    super()
    //setInterval(getMemory, 1000)

    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })

    /*
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'kancolle',
        privileges: {
          secure: true,
          standard: true,
          supportFetchAPI: true,
          corsEnabled: true
        }
      }
    ]);*/

    app.whenReady().then(this.init.bind(this))

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.destroy()
      }
    })
    app.on('second-instance', () => {
      console.log(
        'Tried to open a second instance. Opening a new window in existing instance instead.',
      )
      this.createTabbedWindow({ initialUrls: [settingsUrl, newTabUrl] })
      /*
      const mainWindow = this.windows[0].window
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      */
    })

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) this.createInitialWindow()
    })

    app.on('web-contents-created', this.onWebContentsCreated.bind(this))
  }

  destroy() {
    app.quit()
  }

  async applyProxy() {
    this.isProxyEnabled = await applyProxySettings({
      configStore,
      kccpService,
      session: this.session,
      logger: (event, data) => kccp.logger.log(logSource, event, data),
    })
    await this.retryDmmRegionBlockedTabs()
  }

  async retryDmmRegionBlockedTabs() {
    const retryUrl = DMMPageUrl || 'https://play.games.dmm.com/game/kancolle'
    const blockedTabs = this.windows.flatMap((window) =>
      window.tabs.tabList.filter((tab) => isDmmRegionBlockUrl(tab.webContents.getURL())),
    )

    await Promise.all(
      blockedTabs.map((tab) => {
        tab.dmmRegionBlockDialogShown = false
        return tab.loadURL(retryUrl)
      }),
    )
  }

  getFocusedWindow() {
    return this.windows.find((w) => w.window.isFocused()) || this.windows[0]
  }

  getWindowFromBrowserWindow(window) {
    return !window.isDestroyed() ? this.windows.find((w) => w.id === window.id) : null
  }

  getWindowFromWebContents(webContents) {
    let window

    if (this.popup && webContents === this.popup.browserWindow?.webContents) {
      window = this.popup.parent
    } else {
      window = getParentWindowOfTab(webContents)
    }

    return window ? this.getWindowFromBrowserWindow(window) : null
  }

  async synchronizeQuestList(event) {
    let senderWindow = null
    try {
      senderWindow = this.getWindowFromWebContents(event.sender)
    } catch {
      senderWindow = null
    }
    const focusedWindow = this.getFocusedWindow()
    const candidateWindows = [senderWindow, focusedWindow, ...this.windows].filter(
      (window, index, windows) => window && windows.indexOf(window) === index,
    )
    const gameTabs = candidateWindows.flatMap((window) => {
      const tabs = window.tabs.tabList.filter(
        (tab) => tab.webContents && isKc3GamePageUrl(tab.webContents.getURL()),
      )
      return window.tabs.selected && tabs.includes(window.tabs.selected)
        ? [window.tabs.selected, ...tabs.filter((tab) => tab !== window.tabs.selected)]
        : tabs
    })
    const gameTab =
      gameTabs.find((tab) => this.questLiveSync?.hasContext(tab.webContents.id)) || gameTabs[0]
    if (!gameTab || gameTab.webContents.isDestroyed()) {
      throw Object.assign(new Error('No active KanColle game tab is available.'), {
        code: 'KC3_QUEST_SYNC_GAME_TAB_UNAVAILABLE',
      })
    }
    return this.questLiveSync.synchronize(gameTab.webContents.id)
  }

  async init() {
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock.setIcon(PATHS.APP_ICON)
    }

    this.startupDisplayMetrics = captureStartupDisplayMetrics(screen)
    kccp.logger.log(logSource, 'display.startup-detected', this.startupDisplayMetrics)
    this.initSession()
    this.questLiveSync = createKC3QuestLiveSync({ requestSession: this.session })
    setupMenu(this)
    mainBootstrap.registerCoreServices({
      app,
      createRecommendationWorker: () => createNodeWorker(recommendationWorkerPath),
      dialog,
      getKc3ExtensionId: () => this.currentKc3ExtensionId,
      ipcMain,
      logger: (eventName, data) => kccp.logger.log(logSource, eventName, data),
      safeStorage,
      syncQuestList: (event) => this.synchronizeQuestList(event),
    })
    registerMasterShipMaterialTooltipDiagnostics({
      getKc3ExtensionId: () => this.currentKc3ExtensionId,
      ipcMain,
      logger: (event, data) => kccp.logger.log(logSource, event, data),
    })
    registerAppShutdown({
      app,
      dispose: () => mainBootstrap.dispose(),
      logger: (event, data) => kccp.logger.error(logSource, event, data),
    })

    app.on('browser-window-focus', () => {
      const fWin = () => this.getFocusedWindow()
      const fTab = () => fWin().getFocusedTab()
      const fWc = () => fTab().webContents

      this.currentWindowId = fWin().window.id

      globalShortcut.registerAll(['CmdOrCtrl+T'], () => fWin().tabs.create())
      globalShortcut.registerAll(['CmdOrCtrl+N'], () =>
        this.createTabbedWindow({ initialUrls: [settingsUrl, newTabUrl] }),
      )
      globalShortcut.registerAll(['CmdOrCtrl+R', 'F5'], () => fWc().reload())
      globalShortcut.registerAll(['CmdOrCtrl+Shift+R', 'CmdOrCtrl+F5'], () =>
        fWc().reloadIgnoringCache(),
      )
      globalShortcut.registerAll(['CmdOrCtrl+W', 'CmdOrCtrl+F4'], () =>
        this.confirmCloseTab(fTab().id),
      )
      globalShortcut.registerAll(['F3', 'CmdOrCtrl+F'], () =>
        this.setFindInPageVisible(fTab().id, true),
      )
      globalShortcut.registerAll(['Escape'], () => this.setFindInPageVisible(fTab().id, false))
      globalShortcut.registerAll(['Alt+A'], () => this.toggleAddressBar(fTab().id))
      globalShortcut.registerAll(['Alt+D'], () => this.focusAddressBar(fTab().id))
      globalShortcut.registerAll(['CmdOrCtrl+Tab'], () => this.nextTab(fTab().id))
      globalShortcut.registerAll(['CmdOrCtrl+Shift+Tab'], () => this.prevTab(fTab().id))
    })
    app.on('browser-window-blur', () => globalShortcut.unregisterAll())

    this.session.setCertificateVerifyProc((request, callback) => {
      if (request.hostname.endsWith('.kancolle-server.com')) {
        // Bypass certificate errors for KCCP HTTPS MITM connections
        kccp.logger.log(logSource, 'Bypassing certificate error for', request.hostname)
        return callback(0)
      }
      return callback(-3)
    })

    if ('registerPreloadScript' in this.session) {
      this.session.registerPreloadScript({
        id: 'shell-preload',
        type: 'frame',
        filePath: PATHS.PRELOAD,
      })
    } else {
      // TODO(mv3): remove
      this.session.setPreloads([PATHS.PRELOAD])
    }

    this.extensions = new ElectronChromeExtensions({
      license: 'internal-license-do-not-use',
      session: this.session,

      createTab: async (details) => {
        //console.log('>> main.extensions.createTab()')
        await this.ready

        const parentWin =
          typeof details.windowId === 'number' &&
          this.windows.find((w) => w.id === details.windowId)

        if (!parentWin) {
          throw new Error(`Unable to find windowId=${details.windowId}`)
        }

        const tab = parentWin.tabs.create()

        if (details.url) tab.loadURL(details.url)
        if (typeof details.active === 'boolean' ? details.active : true)
          parentWin.tabs.select(tab.id)

        return [tab.webContents, tab.window]
      },
      selectTab: (tab, browserWindow) => {
        //console.log('>> main.extensions.selectTab()')
        const parentWin = this.getWindowFromBrowserWindow(browserWindow)
        parentWin?.tabs.select(tab.id)
      },
      beforeRemoveTab: (tab) => {
        if (!confirmCloseUrls.includes(tab.mainFrame.url)) return true
        return this.checkConfirmClose()
      },
      removeTab: (tab, browserWindow) => {
        //console.log('>> main.extensions.removeTab()')
        const parentWin = this.getWindowFromBrowserWindow(browserWindow)
        parentWin?.tabs.remove(tab.id)
        if (parentWin?.tabs.tabList.length === 0) {
          this.removeWindow(parentWin)
        }
      },

      createWindow: async (details) => {
        //console.log('>> main.extensions.createWindow()')
        await this.ready

        const newWin = this.createTabbedWindow({
          initialUrls: [settingsUrl, details.url],
        })
        // if (details.active) tabs.select(tab.id)
        return newWin.window
      },
      beforeRemoveWindow: (browserWindow) => {
        const tabWin = this.getWindowFromBrowserWindow(browserWindow)
        const confirmTab = tabWin.tabs.tabList.find((t) =>
          confirmCloseUrls.includes(t.webContents.mainFrame.url),
        )
        if (!confirmTab) return true
        return this.checkConfirmClose()
      },
      removeWindow: (browserWindow) => {
        this.removeWindow(browserWindow)
      },
    })

    installExtensionWindowResolver({
      extensionStore: this.extensions.ctx.store,
      logger: (event, data) => kccp.logger.log(logSource, event, data),
    })

    // Display <browser-action-list> extension icons.
    ElectronChromeExtensions.handleCRXProtocol(this.session)

    this.extensions.on('browser-action-popup-created', (popup) => {
      // parent isn't set correctly, let's patch it
      //const focused = this.extensions.api.windows.getLastFocused()
      //const tabbedWin = this.windows.find((w) => w.window.id === focused.id)
      //popup.parent = tabbedWin.window
      this.popup = popup
    })

    // Allow extensions to override new tab page
    this.extensions.on('url-overrides-updated', (urlOverrides) => {
      if (urlOverrides.newtab) {
        this.urls.newtab = urlOverrides.newtab
      }
    })

    // extension containing window chrome UI
    const webuiExtension = await this.session.loadExtension(PATHS.WEBUI)
    webuiExtensionId = webuiExtension.id
    webuiUrl = `chrome-extension://${webuiExtensionId}/webui.html`

    // Wait for web store extensions to finish loading as they may change the
    // newtab URL.
    kccp.logger.log(logSource, 'Initializing webstore system.')
    await installChromeWebStore({
      session: this.session,
      async beforeInstall(details) {
        if (!details.browserWindow || details.browserWindow.isDestroyed()) return

        const title = `Add “${details.localizedName}”?`

        let message = `${title}`
        if (details.manifest.permissions) {
          const permissions = (details.manifest.permissions || []).join(', ')
          message += `\n\nPermissions: ${permissions}`
        }

        const returnValue = await dialog.showMessageBox(details.browserWindow, {
          title,
          message,
          icon: details.icon,
          buttons: ['Cancel', 'Add Extension'],
        })

        return { action: returnValue.response === 0 ? 'deny' : 'allow' }
      },
    })

    //if (!app.isPackaged) {
    if (fsSync.existsSync(PATHS.LOCAL_EXTENSIONS)) {
      kccp.logger.log(logSource, 'Loading extensions')
      await loadAllExtensions(this.session, PATHS.LOCAL_EXTENSIONS, {
        allowUnpacked: true,
        filterRegex: /^(?!kc3kai).*(?:[/\\]src)?$/,
        filterCallback: (ext) => {
          kccp.logger.log(logSource, `Checking extension ${ext.manifest.name}`)
          if (ext.manifest.name === 'uBlock Origin') {
            const version = ext.manifest.version.split('.').map((i) => parseInt(i))
            const v = [1, 47, 4]
            if ([0, 1].some((i) => version[i] > v[i])) {
              const notice = `${ext.manifest.name} versions above ${v.join('.')} may cause a severe memory leak and are currently unsupported.`
              kccp.logger.error(logSource, notice)
              kccp.logger.log(
                logSource,
                `${ext.manifest.name} version ${ext.manifest.version} will not be loaded.`,
              )
              return false
            }
          }
          return true
        },
      })
    }

    kccp.logger.log(logSource, 'Starting extension workers.')
    await Promise.all(
      this.session.getAllExtensions().map(async (extension) => {
        const manifest = extension.manifest
        if (manifest.manifest_version === 3 && manifest?.background?.service_worker) {
          kccp.logger.error(
            logSource,
            `Extension ${extension.name} is a Manifest V3 extension that uses service workers, which are not yet supported. Some functionality may be missing.`,
          )
          /*
          await this.session.serviceWorkers.startWorkerForScope(extension.url).catch((error) => {
            kccp.logger.error(logSource, error)
          })
          //*/
        }
      }),
    )

    // theme handling
    const bright = configStore.get('window.style.brightness') || 'system'
    nativeTheme.themeSource = bright
    nativeTheme.on('updated', (ev) => {
      //kccp.logger.log(logSource, 'nativeTheme.updated', ev)
    })

    // initial window creation
    const webuiBase = 'chrome-extension://' + webuiExtensionId
    newTabUrl = webuiBase + '/new-tab.html'
    settingsUrl = webuiBase + '/settings.html'
    searchUrl = webuiBase + '/search.html'

    const initialWindow = this.createTabbedWindow({
      initialUrls: [settingsUrl],
      hideAddressBarFor: [settingsUrl],
    })

    mainBootstrap.registerWebUi({
      ipcMain,
      getWebUiExtensionId: () => webuiExtensionId,
      routerDependencies: {
        app,
        appDataDir,
        appDir,
        browser: this,
        configStore,
        dialog,
        fs: fsSync,
        getKc3ExtensionId: () => kc3ExtensionId,
        hideHome,
        homeDataLocation,
        isMatch,
        logger: kccp.logger,
        logSource,
        nativeTheme,
        path,
        rootDir: ROOT_DIR,
        settingsUrl,
        shell,
      },
    })

    await initialWindow.ready
    this.resolveReady()

    // set up kc3 update worker thread
    kccp.logger.log(logSource, 'Starting KC3 update service')

    this.updateWorker = new updateWorker()
    this.updateWorker.on('message', this.handleWorkerMessage.bind(this))

    await this.updateKc3IfScheduled()

    // Init KCCP
    this.setProxyHandler()
    if (
      configStore.get('proxy.enable') &&
      (await kccpService.getConfig(configStore))?.config?.autoUpdateGitMods
    ) {
      await this.updateKccpMods()
    } else {
      await kccpService.startStop(configStore)
      await this.applyProxy()
    }
    // check to see if we need to retry kccp startup periodically
    kccpService.checkRestart(configStore)
    void kccpService.checkModUpdates().catch((error) =>
      kccp.logger.error(logSource, 'proxy.mod-check-failed', {
        message: String(error.message).slice(0, 240),
      }),
    )
  }

  async getProxyDestination() {
    return readProxyDestination(configStore, kccpService)
  }

  getModPath(config) {
    return config.mods.length > 0
      ? path.join(config.mods[config.mods.length - 1].path, '..')
      : undefined
  }

  serverHost = ''
  //requestIgnoreIds = []
  setProxyHandler() {
    //const proxyHeader = 'X-Proxied'
    this.session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
      if (details.url.startsWith('ws')) return
      const proxyCfg = configStore.get('proxy')
      if (!proxyCfg.enable || proxyCfg.mode.endsWith('-internal') || proxyCfg.method !== 'header') {
        callback({ requestHeaders: details.requestHeaders })
        return
      }

      const url = new URL(details.url)
      if (['/gadget_html5/', '/kcscontents/'].some((x) => url.pathname?.includes(x)))
        details.requestHeaders['x-host'] = 'w00g.kancolle-server.com'
      else if (this.serverHost) details.requestHeaders['x-host'] = this.serverHost

      /*const wasProxied = details.requestHeaders[proxyHeader]
      if (wasProxied)
      {
        console.log(`proxied id ${details.id}`)
        delete details.requestHeaders[proxyHeader]
        this.requestIgnoreIds.push(details.id)
      }//*/
      callback({ requestHeaders: details.requestHeaders })
    })

    this.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, async (details, callback) => {
      if (details.url.startsWith('ws')) return
      void this.questLiveSync?.observeRequest(details).catch((error) => {
        kccp.logger.log(logSource, 'quest-recommendation.live-sync-context-capture-failed', {
          operation: 'capture-game-api-context',
          gameWebContentsId: Number(details.webContentsId || 0) || null,
          outcome: 'failed',
          reasonCodes: ['KC3_QUEST_SYNC_CONTEXT_CAPTURE_FAILED'],
          message: String(error?.message || error)
            .replace(/\s+/g, ' ')
            .slice(0, 160),
        })
      })
      const url = new URL(details.url)
      const cfg = configStore.get('proxy')

      if (
        cfg.enable &&
        !cfg.mode.endsWith('-internal') &&
        cfg.method !== 'https-mitm' &&
        details.method === 'GET' &&
        !url.pathname.includes('/kcscontents/news')
      ) {
        if (url.protocol === 'https:' && url.hostname.endsWith('.kancolle-server.com')) {
          if (!url.hostname.startsWith('w00')) this.serverHost = url.hostname

          const { host, port } = await this.getProxyDestination()
          let redirectURL = `http://${host}:${port}` //.replace(/^https:/, 'kancolle:')
          if (cfg.method === 'path')
            redirectURL += `/${url.protocol.slice(0, -1)}/${(url.host.match(/^([^.]+\.kancolle-server\.com)$/) || ['', url.hostname])[1]}`
          // shortform pathing not yet in public KCCP
          //redirectURL += `/${url.protocol.slice(0, -1)}/${(url.host.match(/^([^.]+)\.kancolle-server\.com$/) || ['', url.hostname])[1]}`;
          redirectURL += `${url.pathname}${url.search}`

          callback({ redirectURL })
          return
        } else if (this.serverHost && url.protocol === 'http:') {
          const match = url.pathname?.match(/\/kcs2\/resources\/world\/(.*)_([lst])\.png$/)
          const worldStr = this.serverHost.split('.')[0].substring(1) + '_ver_com'
          if (match && match[1] != worldStr) {
            url.pathname = url.pathname.replace(match[1], worldStr)
            // careful! potential for an infinite redirect if this is botched
            callback({ redirectURL: url.href })
            return
          }
        }
      }

      callback({ cancel: false })
    })

    /*
    protocol.registerStreamProtocol('kancolle', (request, callback) => {
      const { method, headers } = request
      const url = new URL(request.url)
        
      const cfg = configStore.all
      const host = cfg.proxy.client.host
      const port = cfg.proxy.client.port
      const proxyUrl = `http://${host}:${port}/https/${url.hostname}${url.pathname}${url.search}`
      const destUrl = request.url.replace(/^kancolle:/,'https:')
      const isKancolle = url.hostname.endsWith('.kancolle-server.com')
      const proxyAll = cfg.proxy.mode.startsWith('all-')

      if (this.isProxyEnabled && (isKancolle || proxyAll)) {
        if (cfg.proxy.mode == 'kccp-internal') {
          const newHeaders = { ...headers }
          newHeaders['X-Proxied'] = '1'
          kccpService.proxyRequest(
            {
              method,
              headers: newHeaders,
              url: destUrl,
              bodyStream: request.uploadData?.length
                ? Readable.from(request.uploadData.map((part) => part.bytes))
                : null,
            },
            callback,
          )
        } else if (cfg.proxy.mode.endsWith('-external')) {
          this.proxyHTTPSRequest(request, destUrl, method, headers, callback, 'External proxy')
        }
        return
      }

      // direct handling
      this.proxyHTTPSRequest(request, url.href, method, headers, callback)
    })
    //*/
  }

  proxyHTTPSRequest(request, url, method, headers, callback, type = 'HTTPS request') {
    const proxyReq = net.request({ url, method, headers }, (res) => {
      callback({
        statusCode: res.statusCode,
        headers: res.headers,
        data: res,
      })
    })

    proxyReq.on('error', (err) => {
      kccp.logger.error(kccp.kccpLogSource, `${type} failed: ${err}`)
      callback({ statusCode: 502, data: null })
    })

    if (request.uploadData) {
      for (const part of request.uploadData) {
        if (part.bytes) proxyReq.write(Buffer.from(part.bytes))
      }
    }

    proxyReq.end()
  }

  async handleWorkerMessage(msg) {
    //console.log('main.js received message from KC3 update worker', msg)
    // msg: { type, data }
    if (!msg?.type)
      throw new Error('Messages sent from worker must be in the format { type, data }')
    switch (msg.type) {
      case 'status-kc3-is-updating':
        this.kc3IsUpdating = msg.data.isUpdating
        this.kc3UpdatingChannel = msg.data.channel
        this.sendToAllWindows(msg.type, msg.data)
        break
      case 'status-kccp-modder-is-updating':
        this.kccpModderIsUpdating = msg.data.isUpdating
        this.sendToAllWindows(msg.type, msg.data)
        break
      case 'error-do-kc3-update':
      case 'error-do-kccp-modder-update':
      case 'update-process-started':
      case 'update-process-progress':
        this.sendToAllWindows(msg.type, msg.data)
        break
      case 'update-process-completed':
        this.sendToAllWindows(msg.type, msg.data)

        if (msg.data.name === 'KC3 Update') {
          const kc3Path = this.getKc3Path()
          if (!kc3Path) {
            //console.log('No kc3 path provided.')
            return
          }
          const channel = this.kc3UpdatingChannel
          if (!channel.startsWith('custom'))
            configStore.set('kc3kai.update.time.' + channel, Date.now())
          await this.checkStartKc3(kc3Path)
        } else if (msg.data.name === 'KCCP Mod Update') {
          kccp.logger.log(kccp.kccpLogSource, 'Finished updating KCCP mods.')
          await kccpService.startStop(configStore)
          await this.applyProxy()
        }
        break
      default:
        throw new Error(`Unknown message type ${msg.type}`)
    }
  }

  removeWindow(browserWindow) {
    const removingWin = this.windows.find((w) => w.id == browserWindow.id)

    const idx = this.windows.indexOf(removingWin)
    if (idx >= 0) this.windows.splice(idx, 1)

    if (
      this.windows.length == 1 ||
      (this.windows.length > 0 && this.kccpMainWindowId == removingWin.window.id)
    ) {
      const newMainWindow = this.windows[0].window
      this.kccpMainWindowId = newMainWindow.id
      kccp.logger.setMainWindow(newMainWindow)
    }

    if (removingWin?.window.isDestroyed() === false) removingWin.destroy()
  }

  sendToAllWindows(type, data) {
    if (!(this.windows?.length > 0)) return

    // windows seem to have trouble keeping themselves separated logically...
    this.windows.forEach((w) =>
      w.window.webContents.send('webui-message', {
        type,
        meta: { windowId: w.id, allTabs: true },
        data,
      }),
    )
  }

  sendToWindow(windowId, type, data) {
    if (!(this.windows?.length > 0)) return
    const window = this.windows.find((w) => w.id === windowId)
    if (!window) throw new Error(`No window present with ID ${windowId}`)
    window.window.webContents.send('webui-message', {
      type,
      meta: { windowId, allTabs: true },
      data,
    })
  }

  sendToTab(tabId, type, data) {
    if (!(this.windows?.length > 0)) return
    const window = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    if (!window) throw new Error(`No window present containing tab ID ${tabId}`)
    const tab = window.tabs.tabList.find((t) => t.id == tabId)
    tab.webContents.send('webui-message', { type, meta: { windowId: window.id, tabId }, data })
  }

  initSession() {
    //console.log('>> main.initSession()')
    this.session = session.defaultSession

    if (configStore.get('kancolle.forceCookieHack')) {
      this.applyCookieHack()
    }

    this.session.cookies.on('changed', (event, cookie, cause, removed) => {
      if (!configStore.get('kancolle.forceCookieHack')) return
      if (removed) return
      if (
        cookie.domain != '.dmm.com' ||
        (cause != 'explicit' && cause != 'expired-overwrite') ||
        !cookie.name.startsWith('ck')
      )
        return
      //kccp.logger.log(logSource, `Cookie ${removed ? 'removed' : 'changed'}: ${cookie.name}=${cookie.value} ; Cause: ${cause}`)
      this.interceptCookieUpdate({ cookie, cause, removed })
    })

    this.session.serviceWorkers.on('running-status-changed', (event) => {
      console.info(`service worker ${event.versionId} ${event.runningStatus}`)
    })

    if (shellDebug) {
      this.session.serviceWorkers.once('running-status-changed', () => {
        const tab = this.windows[0]?.getFocusedTab()
        if (tab) {
          tab.webContents.inspectServiceWorker()
        }
      })
    }
  }

  createTabbedWindow(options) {
    //console.log('>> main.createWindow()')
    const windowConfig = configStore.get('window')
    const savedWindowSize = constrainWindowSizeToDisplay(
      {
        width: windowConfig.state?.width || configSchema.window.state.width.default,
        height: windowConfig.state?.height || configSchema.window.state.height.default,
      },
      this.startupDisplayMetrics,
    )
    const adaptiveWindowLayout =
      windowConfig.view.autoFitGameOnStartup && configStore.get('kc3kai.startup.openDevtools')
        ? calculateGameAndSidebarWindowLayout({
            displayMetrics: this.startupDisplayMetrics,
            sidebarWidth: estimateKc3SidebarWidth(this.startupDisplayMetrics.workAreaSize.width),
          })
        : null
    const initialWindowSize = adaptiveWindowLayout?.applied
      ? adaptiveWindowLayout.targetSize
      : savedWindowSize

    const newTabbedWindow = new TabbedBrowserWindow({
      ...options,
      //urls: this.urls,
      extensions: this.extensions,
      startupDisplayMetrics: this.startupDisplayMetrics,
      window: {
        width: initialWindowSize.width,
        height: initialWindowSize.height,
        frame: false,
        titleBarStyle: 'hidden',
        // remove the min/max/close buttons so we can theme them
        /*titleBarOverlay: {
          height: 31,
          color: '#39375b',
          symbolColor: '#ffffff',
        },//*/
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: true,
          enableRemoteModule: false,
          contextIsolation: true,
          worldSafeExecuteJavaScript: true,
          backgroundThrottling: windowConfig.behavior.occlusion,
        },
        icon: PATHS.APP_ICON,
      },
    })

    const resizeFitDelayMs = 50
    const windowStateSaveDelayMs = 400
    let resizeFitTimer = null
    let resizeFitRunning = false
    let resizeFitPending = false
    let windowStateSaveTimer = null
    let pendingWindowSize = null
    const refitSelectedGameTab = async () => {
      if (resizeFitRunning) {
        resizeFitPending = true
        return
      }

      resizeFitRunning = true
      try {
        do {
          resizeFitPending = false
          const tab = newTabbedWindow.tabs.selected
          if (
            newTabbedWindow.window.isDestroyed() ||
            !configStore.get('window.view.autoFitGameOnStartup') ||
            !tab?.gameResponsiveFitEnabled
          ) {
            break
          }
          await fitGameTabToCurrentViewport({
            tab,
            logger: (eventName, data) => kccp.logger.log(logSource, eventName, data),
          })
        } while (resizeFitPending)
      } catch (error) {
        kccp.logger.error(logSource, 'Unable to fit game tab after window resize.', error)
      } finally {
        resizeFitRunning = false
      }
    }
    const scheduleSelectedGameTabRefit = () => {
      resizeFitPending = true
      if (resizeFitTimer) return
      resizeFitTimer = setTimeout(() => {
        resizeFitTimer = null
        void refitSelectedGameTab()
      }, resizeFitDelayMs)
    }
    const persistWindowSize = () => {
      if (!pendingWindowSize) return
      configStore.set({
        'window.state.width': pendingWindowSize[0],
        'window.state.height': pendingWindowSize[1],
      })
      pendingWindowSize = null
    }
    const scheduleWindowSizePersistence = (size) => {
      pendingWindowSize = size
      if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer)
      windowStateSaveTimer = setTimeout(() => {
        windowStateSaveTimer = null
        persistWindowSize()
      }, windowStateSaveDelayMs)
    }

    newTabbedWindow.window.on('close', (ev) => {
      ev.preventDefault()
      const idx = this.windows.indexOf(newTabbedWindow)

      const confirmTab = newTabbedWindow.tabs.tabList.find((t) =>
        confirmCloseUrls.includes(t.webContents.mainFrame.url),
      )
      if (confirmTab) {
        const leave = this.checkConfirmClose()
        if (!leave) return
      }

      if (resizeFitTimer) clearTimeout(resizeFitTimer)
      if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer)
      persistWindowSize()
      this.windows.splice(idx, 1)
      newTabbedWindow.destroy()
    })
    newTabbedWindow.window.on('resize', () => {
      this.sendToWindow(newTabbedWindow.id, 'webui-display-mode', {
        mode: newTabbedWindow.window.isMaximized() ? 'maximized' : 'normal',
      })
      scheduleSelectedGameTabRefit()
      if (newTabbedWindow.window.isMaximized()) return
      try {
        scheduleWindowSizePersistence(newTabbedWindow.window.getSize())
      } catch (error) {
        kccp.logger.error(logSource, 'Failed to set window.state values during resize.')
      }
    })
    this.windows.push(newTabbedWindow)
    if (this.windows.length == 1) {
      const newMainWindow = this.windows[0].window
      this.kccpMainWindowId = newMainWindow.id
      kccp.logger.setMainWindow(newMainWindow)
      kccpService.init()
    }

    //* webui.html
    if (devtoolsDebug && shellDebug) {
      newTabbedWindow.webContents.openDevTools({ mode: 'detach' })
    } //*/

    return newTabbedWindow
  }

  createInitialWindow() {
    //console.log('>> main.createInitialWindow()')
    this.createTabbedWindow()
  }

  windowOpenHandler(webContents, details) {
    switch (details.disposition) {
      case 'foreground-tab':
      case 'background-tab':
      case 'new-window': {
        queueMicrotask(() => {
          const sourceWin = this.getWindowFromWebContents(webContents)
          if (!sourceWin) return
          const opts = {}
          const tab = sourceWin.tabs.create(opts)
          if (
            shellDebug ||
            ((details.url == kc3StartPageUrl || details.url === DMMPageUrl) &&
              configStore.get('kc3kai.startup.openDevtools'))
          ) {
            //delaying opening of devtools on tab open
            const startDevTools = async () => {
              const delaySeconds = configStore.get('kc3kai.startup.openDevtoolsDelay') || 0
              await delay(delaySeconds * 1000)
              tab.webContents.openDevTools({ activate: true })
            }
            startDevTools()
            //tab.webContents.openDevTools({ activate: true })
          }

          // POST submission
          const loadOpts = {}
          if (details.referrer) loadOpts.httpReferrer = details.referrer
          if (details.postBody) {
            loadOpts.postData = details.postBody.data
            if (details.postBody.contentType)
              loadOpts.extraHeaders = `Content-Type: ${details.postBody.contentType}`
          }

          tab.loadURL(details.url, loadOpts)

          // extension popups don't auto-close when using window.open for whatever reason
          if (this.popup) {
            this.popup.destroy()
          }
        })

        return { action: 'deny' }
      }
      default:
        return { action: 'allow' }
    }
  }

  getNumericVersion() {
    // for version M.m.r
    // give a simple numeric version MMmmrr
    const version = app.getVersion().split('.').reverse()
    let numeric = 0
    for (let i = 0; i < version.length; i++) {
      numeric += version[i] * Math.pow(10, i * 2)
    }
    return numeric
  }

  devtoolsPolyfillJs = `
    (function() {
      window.open = function (url, name, features) {
        if (RMsg) {
          (new RMsg("service", "windowOpen", {url})).execute();
        }
        else console.error("Attempted to execute window.open, but the API is broken")
      }
    }());`

  alwaysActiveUpdateJs = `
    (function() {
      console.log("Running always-active injection.", document?.URL)

      Object.defineProperty(document, 'hidden', {
        value: false,
        configurable: false
      });
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: false
      });
    }());`

  canvasUpdateJs = `
    (function() {
      console.log("Running canvas preserveDrawingBuffer injection.", document?.URL)

      // Set preserveDrawingBuffer to true, so we can save canvas as image :)
      // Source from https://github.com/greggman/webgl-helpers/blob/master/webgl-force-preservedrawingbuffer.js
      if (typeof HTMLCanvasElement !== "undefined") {
        wrapGetContext(HTMLCanvasElement);
      }
      if (typeof OffscreenCanvas !== "undefined") {
        wrapGetContext(OffscreenCanvas);
      }

      function wrapGetContext(ContextClass) {
        const isWebGL = /webgl/i;

        ContextClass.prototype.getContext = function(origFn) {
          return function(type, attributes) {
            if (isWebGL.test(type)) {
              attributes = Object.assign({}, attributes || {}, {preserveDrawingBuffer: true});
            }
            return origFn.call(this, type, attributes);
          };
        }(ContextClass.prototype.getContext);
      }
    }());`

  applyCookieHack() {
    const playUrl = 'https://games.dmm.com'
    const kcUrl = 'https://play.games.dmm.com' // /game/kancolle
    const cookies = [
      [kcUrl, 'cklg', 'welcome', '.dmm.com', '/'],
      [kcUrl, 'cklg', 'welcome', '.dmm.com', '/netgame/'],
      [kcUrl, 'cklg', 'welcome', '.dmm.com', '/netgame_s/'],
      [kcUrl, 'cklg', 'welcome', '.dmm.com', '/play/'],
      [kcUrl, 'ckcy', '1', '.dmm.com', '/'],
      [kcUrl, 'ckcy', '1', '.dmm.com', '/netgame/'],
      [kcUrl, 'ckcy', '1', '.dmm.com', '/netgame_s/'],
      [kcUrl, 'ckcy', '1', '.dmm.com', '/play/'],
      //['ckcy', '1', 'www.dmm.com', '/'],
      //['ckcy', '1', 'osapi.dmm.com', '/'],
      //['ckcy', '1', 'log-netgame.dmm.com', '/'],
      [kcUrl, 'ckcy_remedied_check', 'ec_mrnhbtk', '.dmm.com', '/'],
    ]
    const expires = new Date(+new Date() + 31536e6) * 60 * 60 * 24 * 7

    cookies.forEach((c) => {
      const cookie = {
        url: c[0],
        name: c[1],
        value: c[2],
        domain: c[3],
        path: c[4],
        expirationDate: expires,
      }
      this.session.cookies.set(cookie)
    })

    kccp.logger.log(logSource, 'DMM cookie hack applied.')
  }

  interceptCookieUpdate(changeInfo) {
    var nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)

    // CKCY force 1
    if (changeInfo.cookie.name == 'ckcy' && changeInfo.cookie.value != '1') {
      kccp.logger.log(logSource, 'ckcy cookie changed, re-hacking it.')
      // console.log("CKCY=", changeInfo.cookie.value, changeInfo);
      this.session.cookies.set(
        {
          url: 'https://play.games.dmm.com',
          name: 'ckcy',
          value: '1',
          domain: '.dmm.com',
          expirationDate: Math.ceil(nextYear.getTime() / 1000),
          path: changeInfo.cookie.path,
        },
        function (cookie) {
          // console.log("ckcy cookie re-hacked", cookie);
        },
      )
    }

    // CKLG force welcome
    if (changeInfo.cookie.name == 'cklg' && changeInfo.cookie.value != 'welcome') {
      kccp.logger.log(logSource, 'cklg cookie changed, re-hacking it.')
      // console.log("CKLG=", changeInfo.cookie.value, changeInfo);
      this.session.cookies.set(
        {
          url: 'https://play.games.dmm.com',
          name: 'cklg',
          value: 'welcome',
          domain: '.dmm.com',
          expirationDate: Math.ceil(nextYear.getTime() / 1000),
          path: changeInfo.cookie.path,
        },
        function (cookie) {
          // console.log("cklg cookie re-hacked", cookie);
        },
      )
    }

    // ckcy_remedied_check force?
    if (
      changeInfo.cookie.name == 'ckcy_remedied_check' &&
      changeInfo.cookie.value != 'ec_mrnhbtk'
    ) {
      kccp.logger.log(logSource, 'ckcy_remedied_check cookie changed, re-hacking it.')
      // console.log("ckcy_remedied_check=", changeInfo.cookie.value, changeInfo);
      this.session.cookies.set(
        {
          url: 'https://play.games.dmm.com',
          name: 'ckcy_remedied_check',
          value: 'ec_mrnhbtk',
          domain: '.dmm.com',
          expirationDate: Math.ceil(nextYear.getTime() / 1000),
          path: changeInfo.cookie.path,
        },
        function (cookie) {
          // console.log("ckcy_remedied_check cookie re-hacked", cookie);
        },
      )
    }
  }

  async onWebContentsCreated(event, webContents) {
    const browser = this
    const type = webContents.getType()
    const url = webContents.getURL()
    const webContentsId = webContents.id

    webContents.once('destroyed', () => browser.questLiveSync?.forget(webContentsId))

    webContents.setBackgroundThrottling(configStore.get('window.behavior.occlusion'))

    webContents.on('devtools-opened', (e) => {
      const devtools = webContents.devToolsWebContents
      kccp.logger.log(logSource, 'DevTools opened')
      if (!devtools) return

      devtools.on('did-create-window', (window, details) => {
        kccp.logger.log(logSource, 'Window created', details)
      })

      const inspectedUrl = webContents.getURL()
      const isKc3GamePage =
        inspectedUrl === kc3StartPageUrl ||
        inspectedUrl === DMMPageUrl ||
        inspectedUrl.startsWith(`${DMMPageUrl}?`) ||
        inspectedUrl.startsWith(`${DMMPageUrl}/`)
      if (!isKc3GamePage || !browser.currentKc3ExtensionId) return

      const panelReady = showKc3DevToolsPanel({
        devToolsWebContents: devtools,
        extensionId: browser.currentKc3ExtensionId,
      })
      const tab = browser.windows
        .flatMap((window) => window.tabs.tabList)
        .find((candidate) => candidate.webContents === webContents)
      if (tab) tab.gameDevtoolsLayoutReady = panelReady

      void panelReady
        .then((result) => {
          if (result.found) {
            kccp.logger.log(logSource, 'KanColle DevTools panel moved first and selected.')
            kccp.logger.log(logSource, 'display.game-kc3-layout', result.layout)
          } else {
            kccp.logger.error(
              logSource,
              `Unable to find the KanColle DevTools panel: ${result.reason}.`,
            )
          }
        })
        .catch((error) => {
          kccp.logger.error(logSource, 'Unable to activate the KanColle DevTools panel.', error)
        })
    })

    //*
    const devToolsTypes = ['backgroundPage', 'remote']
    if (devtoolsDebug && shellDebug && devToolsTypes.includes(webContents.getType())) {
      webContents.openDevTools({ mode: 'detach', activate: true })
    } //*/

    webContents.setWindowOpenHandler((details) =>
      this.windowOpenHandler.bind(this)(webContents, details),
    )

    webContents.on('context-menu', (event, params) => {
      const menu = buildChromeContextMenu({
        params,
        webContents,
        extensionMenuItems: this.extensions.getContextMenuItems(webContents, params),
        openLink: (url, disposition) => {
          const activeWin = this.getFocusedWindow()

          switch (disposition) {
            case 'new-window':
              this.createTabbedWindow({ initialUrls: [settingsUrl, url] })
              break
            default:
              const tab = activeWin.tabs.create()
              tab.loadURL(url)
          }
        },
      })

      menu.popup()
    })

    webContents.on('zoom-changed', (event, zoomDirection) => {
      //console.log(">> webContents.on('zoom-changed')", zoomDirection)
      var currentZoom = webContents.getZoomFactor()
      const isWebui = webContents.mainFrame.url == webuiUrl
      let increment = isWebui ? 0.1 : 0.2
      let min = isWebui ? 0.5 : 0.2
      let max = isWebui ? 1.5 : 2.0

      if (zoomDirection === 'in') {
        webContents.zoomFactor = Math.min(max, currentZoom + increment)
      }
      if (zoomDirection === 'out') {
        webContents.zoomFactor = Math.max(min, currentZoom - increment)
      }
    })

    webContents.on('will-prevent-unload', (event) => {
      if (this.checkConfirmClose()) event.preventDefault()
    })

    // Inject canvas getContext interception so we can copy/save canvas contents as an image
    webContents.on(
      'did-frame-navigate',
      (
        event,
        url,
        httpResponseCode,
        httpStatusText,
        isMainFrame,
        frameProcessId,
        frameRoutingId,
      ) => {
        const frame = webFrameMain.fromId(frameProcessId, frameRoutingId)
        const isDevTools = url.startsWith('devtools:')
        const isDevToolsPanel = frame.parent?.url.startsWith('devtools:')
        const isCustomDevtoolsPanel = url.startsWith('chrome-extension:') && isDevToolsPanel
        frame.executeJavaScript(this.alwaysActiveUpdateJs)
        // {preserveDrawingBuffer: true} for canvas getContext
        const skip = ['devtools:', 'about:']
        if (!skip.some((s) => url.startsWith(s))) frame.executeJavaScript(this.canvasUpdateJs)
        if (isCustomDevtoolsPanel) frame.executeJavaScript(this.devtoolsPolyfillJs)
      },
    )
  }

  checkConfirmClose() {
    if (!configStore.get('window.behavior.confirmCloseGamePage')) return true
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Leave', 'Stay'],
      title: 'Do you want to leave this site?',
      message: 'Changes you made may not be saved.',
      defaultId: 0,
      cancelId: 1,
    })
    return choice === 0
  }

  confirmCloseTab(tabId) {
    const parentWin = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    const tab = parentWin.tabs.tabList.find((t) => t.id == tabId)
    if (parentWin.tabs.tabList.length > 1 && tab.webContents.mainFrame.url === settingsUrl) {
      return
    }
    let leave = true
    // add other URLs requiring confirmation here
    if (confirmCloseUrls.includes(tab.webContents.mainFrame.url)) {
      leave = this.checkConfirmClose()
    }
    if (leave) parentWin.tabs.remove(tab.id)
    //if (!parentWin.tabs.tabList.length)
    //this.removeWindow(parentWin.window)
  }

  toggleAddressBar(tabId) {
    const parentWin = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    this.sendToWindow(parentWin.id, 'webui-toggle-addressbar')
  }

  focusAddressBar(tabId) {
    const parentWin = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    const tab = parentWin.tabs.tabList.find((t) => t.id == tabId)
    const url = tab?.url || tab?.webContents.mainFrame.url
    if (url == settingsUrl) return

    parentWin.webContents.focus()
    this.sendToWindow(parentWin.id, 'webui-focus-addressbar')
  }

  prevTab(tabId) {
    const parentWin = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    if (parentWin.tabs.tabList.length <= 1) return
    let tabIdx = parentWin.tabs.tabList.findIndex((t) => t.id == tabId) - 1
    if (tabIdx < 1) tabIdx = parentWin.tabs.tabList.length - 1
    parentWin.tabs.select(parentWin.tabs.tabList[tabIdx].id)
  }
  nextTab(tabId) {
    const parentWin = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    if (parentWin.tabs.tabList.length <= 1) return
    let tabIdx = parentWin.tabs.tabList.findIndex((t) => t.id == tabId) + 1
    if (tabIdx >= parentWin.tabs.tabList.length) tabIdx = 1
    parentWin.tabs.select(parentWin.tabs.tabList[tabIdx].id)
  }

  setFindInPageVisible(tabId, visible) {
    const parentWin = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    const tab = parentWin.tabs.tabList.find((t) => t.id == tabId)

    void tab.setFindInPageVisible(visible).catch((error) => {
      kccp.logger.error(logSource, 'Unable to update find-in-page visibility.', error)
    })
  }
  startFindInPage(tabId, searchInput) {
    const parentWin = this.windows.find((w) => w.tabs.tabList.some((t) => t.id == tabId))
    const tab = parentWin.tabs.tabList.find((t) => t.id == tabId)

    tab.findInPage(searchInput)
  }

  getKc3Path() {
    const currentChannel = configStore.get('kc3kai.update.channel')
    let kc3Path
    if (currentChannel.startsWith('custom'))
      kc3Path = configStore.get(`kc3kai.${currentChannel}Location`)
    else kc3Path = path.join(PATHS.KC3_EXTENSIONS, 'kc3kai-' + currentChannel)
    return kc3Path
  }

  async updateKc3IfScheduled() {
    // update if configured schedule warrants it
    const currentChannel = configStore.get('kc3kai.update.channel')
    const canUpdate = !currentChannel.startsWith('custom')
    const lastUpdated = configStore.get('kc3kai.update.time.' + currentChannel)
    const schedule = configStore.get('kc3kai.update.schedule')
    const autoUpdate = configStore.get('kc3kai.update.auto')
    const scheduleMap = {
      startup: 0,
      daily: 1,
      weekly: 7,
      manual: 999999,
    }
    let doUpdate = false
    if (canUpdate && autoUpdate && (!lastUpdated || scheduleMap[schedule] >= 0)) {
      if (!lastUpdated) doUpdate = true
      else {
        let date = new Date(lastUpdated)
        date.setDate(date.getDate() + scheduleMap[schedule])
        doUpdate = date < new Date()
        kccp.logger.log(logSource, 'Next KC3 update scheduled for ', date)
      }
    }

    if (doUpdate) {
      await delay(1000)
      await this.updateKc3(currentChannel)
    } else {
      const kc3Path = this.getKc3Path()
      await this.checkStartKc3(kc3Path)
    }
  }

  async updateKccpMods() {
    const config = (await kccpService.getConfig(configStore))?.config
    kccp.logger.log(kccp.kccpLogSource, 'Checking for asset mod updates...')
    this.updateWorker.postMessage({
      type: 'do-kccp-modder-update',
      data: { config },
    })
  }

  async updateKc3(channel) {
    this.updateWorker.postMessage({
      type: 'do-kc3-update',
      data: { path: PATHS.KC3_EXTENSIONS, channel },
    })
  }

  async checkStartKc3(kc3Path) {
    if (!!this.currentKc3ExtensionId) {
      this.windows.forEach((w) => w.tabs.removeExtensionTabs(this.currentKc3ExtensionId))
    }

    if (!kc3Path) {
      kccp.logger.log(logSource, 'No kc3 path defined.')
      return
    }

    kccp.logger.log(logSource, 'Searching for KC3Kai in', hideHome(kc3Path))

    // once we're updated and kc3 is loaded, remove the default new tab page
    // and open the kc3 start page + strat room

    if (!fsSync.existsSync(kc3Path)) {
      kccp.logger.error(logSource, `Unable to find KC3 in ${hideHome(kc3Path)}.`)
      kccp.logger.log(
        logSource,
        "Please open the KC3Kai section and click 'Check for updates & reload'.",
      )
      return
    }

    const kc3SrcPath = path.join(kc3Path, 'src')
    if (fsSync.existsSync(kc3SrcPath)) kc3Path = kc3SrcPath

    let kc3
    try {
      kc3 = await this.session.loadExtension(kc3Path)
    } catch (error) {
      kccp.logger.error(
        logSource,
        `Unable to load KC3 from ${hideHome(kc3Path)}. It may need to be installed/updated.`,
      )
      kccp.logger.error(logSource, error)
      return
    }
    kccp.logger.log(logSource, 'KC3Kai loaded! ID: ', kc3.id)

    // open KC3 start page
    kc3ExtensionId = kc3.id
    this.currentKc3ExtensionId = kc3ExtensionId

    kc3StartPageUrl = 'chrome-extension://' + kc3ExtensionId + '/pages/game/direct.html'
    //DMMPageUrl = 'https://www.dmm.com/netgame/social/-/gadgets/=/app_id=854854/'
    DMMPageUrl = 'https://play.games.dmm.com/game/kancolle'
    confirmCloseUrls = [DMMPageUrl]
    let startTab

    // TODO: remove cases for old config keys
    if (configStore.get('kc3kai.startup.openStartPage')) {
      configStore.delete('kc3kai.startup.openStartPage')
      configStore.set('kc3kai.startup.gamePage', 'kc3')
    }
    if (configStore.get('kc3kai.startup.openDMMPage')) {
      configStore.delete('kc3kai.startup.openDMMPage')
      configStore.set('kc3kai.startup.gamePage', 'dmm')
    }

    const currentWin = this.getFocusedWindow()

    switch (configStore.get('kc3kai.startup.gamePage')) {
      case 'kc3':
        startTab = currentWin.tabs.create({ initialUrl: kc3StartPageUrl })
        break
      case 'dmm':
        startTab = currentWin.tabs.create({ initialUrl: DMMPageUrl })
        break
    }

    const kc3StratRoomUrl = 'chrome-extension://' + kc3ExtensionId + '/pages/strategy/strategy.html'
    if (configStore.get('kc3kai.startup.openStratRoom')) {
      const stratRoomTab = currentWin.tabs.create({ initialUrl: kc3StratRoomUrl })
      startTab = startTab || stratRoomTab
    }

    if (startTab) currentWin.tabs.select(startTab.id)
  }
}

//module.exports = Browser
export default Browser
