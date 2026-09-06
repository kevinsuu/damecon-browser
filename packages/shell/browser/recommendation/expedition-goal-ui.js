import { EXPEDITION_PLAN_CHANNEL, EXPEDITION_SUMMARY_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'
import {
  installOptimizerDebugConsoleHelper,
  isOptimizerDebugEnabled,
  logOptimizationDebugReport,
} from './expedition-optimizer-debug'
import { EXPEDITION_RESOURCES } from './resource-metadata'
import { escapeHtml, formatLocalizedDate, formatLocalizedNumber } from './strategy-room-format'
import { movePriorityResourceOrder, plannerMarkup, styles } from './views/expedition-goal-view'

let { locale, t, translateMessage } = createStrategyRoomI18n()

const resources = EXPEDITION_RESOURCES
const PRIORITY_RESOURCE_KEYS = ['bucket', 'fuel', 'bauxite', 'ammo', 'steel']
const PRIORITY_RANKS = [1, 2, 3, 4, 5]
const RESOURCE_PREFERENCE_MODES = ['optimize', 'constraint', 'ignore']
const DEFAULT_MINIMUM_NET_YIELD_PER_HOUR = 0
const EXPEDITION_PLANNER_SETTINGS_VERSION = 1
export const EXPEDITION_PLANNER_SETTINGS_STORAGE_KEY =
  'damecon.strategyRoom.expeditionPlannerSettings.v1'
const SETTINGS_LOG_PREFIX = '[KancolleExpeditionSettings]'

const priorityResource = (key) =>
  key === 'bucket' ? { key, color: '#3b9d91' } : resources.find((resource) => resource.key === key)

const weightResources = PRIORITY_RESOURCE_KEYS.map(priorityResource)

const isPriorityPreferenceValid = (preferences) => {
  if (!preferences || typeof preferences !== 'object') return false
  const activeRanks = PRIORITY_RESOURCE_KEYS.map((key) => preferences[key])
    .filter((preference) => preference?.mode === 'optimize')
    .map((preference) => preference.rank)
    .sort((left, right) => left - right)
  return (
    PRIORITY_RESOURCE_KEYS.every((key) =>
      RESOURCE_PREFERENCE_MODES.includes(preferences[key]?.mode),
    ) &&
    activeRanks.every((rank) => PRIORITY_RANKS.includes(rank)) &&
    new Set(activeRanks).size === activeRanks.length &&
    activeRanks.every((rank, index) => rank === index + 1) &&
    PRIORITY_RESOURCE_KEYS.every((key) => {
      const preference = preferences[key]
      return preference.mode !== 'constraint' || Number.isFinite(preference.minimumNetYieldPerHour)
    })
  )
}

const logSettingsEvent = (logger, level, details) => {
  logger?.[level]?.(SETTINGS_LOG_PREFIX, details)
}

const sanitizedErrorMessage = (error) => String(error?.message || error || 'unknown').slice(0, 200)

const normalizePlannerSettings = (value) => {
  if (!value || typeof value !== 'object') return null
  if (value.version !== EXPEDITION_PLANNER_SETTINGS_VERSION) return null
  if (!Number.isInteger(value.afkMinutes) || value.afkMinutes < 0 || value.afkMinutes > 2880) {
    return null
  }
  if (!Number.isInteger(value.fleetCount) || value.fleetCount < 1 || value.fleetCount > 3) {
    return null
  }
  if (
    value.preference?.mode !== 'priority' ||
    !isPriorityPreferenceValid(value.preference.preferences)
  ) {
    return null
  }
  if (
    typeof value.incomeModifier?.greatSuccess !== 'boolean' ||
    !Number.isInteger(value.incomeModifier.daihatsuCount) ||
    value.incomeModifier.daihatsuCount < 0 ||
    value.incomeModifier.daihatsuCount > 4
  ) {
    return null
  }
  return {
    version: EXPEDITION_PLANNER_SETTINGS_VERSION,
    afkMinutes: value.afkMinutes,
    fleetCount: value.fleetCount,
    preference: {
      mode: 'priority',
      preferences: Object.fromEntries(
        PRIORITY_RESOURCE_KEYS.map((key) => [key, { ...value.preference.preferences[key] }]),
      ),
    },
    incomeModifier: {
      greatSuccess: value.incomeModifier.greatSuccess,
      daihatsuCount: value.incomeModifier.daihatsuCount,
    },
  }
}

const settingsLogDetails = (settings) => ({
  afkMinutes: settings.afkMinutes,
  fleetCount: settings.fleetCount,
  optimizedResourceCount: PRIORITY_RESOURCE_KEYS.filter(
    (key) => settings.preference.preferences[key].mode === 'optimize',
  ).length,
  greatSuccess: settings.incomeModifier.greatSuccess,
  daihatsuCount: settings.incomeModifier.daihatsuCount,
})

export const readExpeditionPlannerSettings = (storage = undefined, logger = globalThis.console) => {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage || null
    } catch (error) {
      logSettingsEvent(logger, 'warn', {
        event: 'expedition-planner-settings-read',
        outcome: 'defaults',
        reasonCode: 'STORAGE_READ_FAILED',
        error: sanitizedErrorMessage(error),
      })
      return null
    }
  }
  if (!storage) {
    logSettingsEvent(logger, 'warn', {
      event: 'expedition-planner-settings-read',
      outcome: 'defaults',
      reasonCode: 'STORAGE_UNAVAILABLE',
    })
    return null
  }
  let storedValue
  try {
    storedValue = storage.getItem(EXPEDITION_PLANNER_SETTINGS_STORAGE_KEY)
  } catch (error) {
    logSettingsEvent(logger, 'warn', {
      event: 'expedition-planner-settings-read',
      outcome: 'defaults',
      reasonCode: 'STORAGE_READ_FAILED',
      error: sanitizedErrorMessage(error),
    })
    return null
  }
  if (storedValue === null) {
    logSettingsEvent(logger, 'info', {
      event: 'expedition-planner-settings-read',
      outcome: 'defaults',
      reasonCode: 'SETTINGS_NOT_FOUND',
    })
    return null
  }
  let settings
  try {
    settings = normalizePlannerSettings(JSON.parse(storedValue))
  } catch (error) {
    logSettingsEvent(logger, 'warn', {
      event: 'expedition-planner-settings-read',
      outcome: 'defaults',
      reasonCode: 'SETTINGS_PARSE_FAILED',
      error: sanitizedErrorMessage(error),
    })
    return null
  }
  if (!settings) {
    logSettingsEvent(logger, 'warn', {
      event: 'expedition-planner-settings-read',
      outcome: 'defaults',
      reasonCode: 'SETTINGS_INVALID',
    })
    return null
  }
  logSettingsEvent(logger, 'info', {
    event: 'expedition-planner-settings-read',
    outcome: 'restored',
    ...settingsLogDetails(settings),
  })
  return settings
}

export const writeExpeditionPlannerSettings = (
  value,
  storage = undefined,
  logger = globalThis.console,
) => {
  const settings = normalizePlannerSettings(value)
  if (!settings) {
    logSettingsEvent(logger, 'warn', {
      event: 'expedition-planner-settings-write',
      outcome: 'skipped',
      reasonCode: 'SETTINGS_INVALID',
    })
    return false
  }
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage || null
    } catch (error) {
      logSettingsEvent(logger, 'warn', {
        event: 'expedition-planner-settings-write',
        outcome: 'failed',
        reasonCode: 'STORAGE_WRITE_FAILED',
        error: sanitizedErrorMessage(error),
      })
      return false
    }
  }
  if (!storage) {
    logSettingsEvent(logger, 'warn', {
      event: 'expedition-planner-settings-write',
      outcome: 'failed',
      reasonCode: 'STORAGE_UNAVAILABLE',
    })
    return false
  }
  try {
    storage.setItem(EXPEDITION_PLANNER_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    logSettingsEvent(logger, 'warn', {
      event: 'expedition-planner-settings-write',
      outcome: 'failed',
      reasonCode: 'STORAGE_WRITE_FAILED',
      error: sanitizedErrorMessage(error),
    })
    return false
  }
  logSettingsEvent(logger, 'info', {
    event: 'expedition-planner-settings-write',
    outcome: 'saved',
    ...settingsLogDetails(settings),
  })
  return true
}

const expeditionGroups = [
  [
    [1, '01', '00:15'],
    [2, '02', '00:30'],
    [3, '03', '00:20'],
    [4, '04', '00:50'],
    [5, '05', '01:30'],
    [6, '06', '00:40'],
    [7, '07', '01:00'],
    [8, '08', '03:00'],
    [100, 'A1', '00:25'],
    [101, 'A2', '00:55'],
    [102, 'A3', '02:15'],
  ],
  [
    [9, '09', '04:00'],
    [10, '10', '01:30'],
    [11, '11', '05:00'],
    [12, '12', '08:00'],
    [13, '13', '04:00'],
    [14, '14', '06:00'],
    [15, '15', '12:00'],
    [16, '16', '15:00'],
    [110, 'B1', '00:35'],
  ],
  [
    [17, '17', '00:45'],
    [18, '18', '05:00'],
    [19, '19', '06:00'],
    [20, '20', '02:00'],
    [21, '21', '02:20'],
    [22, '22', '03:00'],
    [23, '23', '04:00'],
    [24, '24', '08:20'],
  ],
  [
    [25, '25', '40:00'],
    [26, '26', '80:00'],
    [27, '27', '20:00'],
    [28, '28', '25:00'],
    [29, '29', '24:00'],
    [30, '30', '48:00'],
    [31, '31', '02:00'],
    [32, '32', '24:00'],
  ],
  [
    [33, '33', '00:15'],
    [34, '34', '00:30'],
    [35, '35', '07:00'],
    [36, '36', '09:00'],
    [37, '37', '02:45'],
    [38, '38', '02:55'],
    [39, '39', '30:00'],
    [40, '40', '06:50'],
  ],
]

const recommendedBlacklist = new Set([22, 29, 30, 31, 33, 34])
const bucketExpeditions = new Set([2, 4, 9, 10, 11, 13, 14, 18, 24, 26, 36, 39, 40, 101, 102, 110])

const resourceLabel = (resource) => t(`common.${resource.key}`)

const formatNumber = (value, digits = 0) =>
  formatLocalizedNumber(value, locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

const formatSigned = (value, digits = 0) => {
  const numericValue = Number(value || 0)
  return `${numericValue > 0 ? '+' : ''}${formatNumber(numericValue, digits)}`
}

const formatDuration = (minutes) => {
  const value = Math.max(0, Math.round(Number(minutes || 0)))
  const hours = Math.floor(value / 60)
  const remainder = value % 60
  if (hours === 0) return t('common.minutes', { value: remainder })
  return remainder === 0
    ? t('common.hours', { value: hours })
    : `${t('common.hours', { value: hours })} ${t('common.minutes', { value: remainder })}`
}

const formatDate = (value) => formatLocalizedDate(value, locale, { hour12: false }, '—')

const formatShortDate = (value) => {
  return formatLocalizedDate(
    value,
    locale,
    {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    t('expedition.returned'),
  )
}

const waitForNextPaint = () =>
  new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    window.setTimeout(finish, 100)
    if (typeof window.requestAnimationFrame !== 'function') return
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish))
  })

const updateResources = (root, current) => {
  resources.forEach(({ key }) => {
    root.querySelector(`#dep-current-${key}`).textContent = formatNumber(current[key])
  })
}

const selectedCandidateIds = (root) =>
  [...root.querySelectorAll('[data-expedition-id]:checked')].map((input) =>
    Number(input.dataset.expeditionId),
  )

const priorityRows = (root) => [...root.querySelectorAll('[data-priority-resource]')]

const priorityRowKey = (row) => row.dataset.priorityResource

const optimizePriorityKeys = (root) =>
  priorityRows(root)
    .filter((row) => row.querySelector('[data-resource-mode]')?.value === 'optimize')
    .map(priorityRowKey)

const nonOptimizePriorityKeys = (root) =>
  priorityRows(root)
    .filter((row) => row.querySelector('[data-resource-mode]')?.value !== 'optimize')
    .map(priorityRowKey)

const setPriorityOrder = (root, activeKeys, inactiveKeys) => {
  const list = root.querySelector('[data-priority-list]')
  if (!list) return
  const rowsByKey = new Map(priorityRows(root).map((row) => [priorityRowKey(row), row]))
  ;[...activeKeys, ...inactiveKeys].forEach((key) => {
    const row = rowsByKey.get(key)
    if (row) list.append(row)
  })
  priorityRows(root).forEach((row) => {
    const key = priorityRowKey(row)
    const activeIndex = activeKeys.indexOf(key)
    const rank = activeIndex >= 0 ? activeIndex + 1 : null
    const mode = row.querySelector('[data-resource-mode]')?.value
    const select = row.querySelector('[data-resource-priority]')
    const rankText = row.querySelector('[data-priority-rank]')
    const upButton = row.querySelector('[data-priority-move="up"]')
    const downButton = row.querySelector('[data-priority-move="down"]')
    if (select) {
      select.value = rank === null ? '1' : String(rank)
      select.disabled = mode !== 'optimize'
    }
    if (rankText)
      rankText.textContent = rank === null ? (mode === 'constraint' ? '>=0' : '-') : String(rank)
    if (upButton) upButton.disabled = mode !== 'optimize' || rank === null || rank === 1
    if (downButton)
      downButton.disabled = mode !== 'optimize' || rank === null || rank === activeKeys.length
  })
}

const handlePriorityChange = (root, select) => {
  const key = select.dataset.resourcePriority
  const row = select.closest('[data-priority-resource]')
  if (row?.querySelector('[data-resource-mode]')?.value !== 'optimize') return
  const otherActiveKeys = priorityRows(root)
    .filter((row) => priorityRowKey(row) !== key)
    .filter((row) => row.querySelector('[data-resource-mode]')?.value === 'optimize')
    .map(priorityRowKey)
  const otherInactiveKeys = priorityRows(root)
    .filter((row) => priorityRowKey(row) !== key)
    .filter((row) => row.querySelector('[data-resource-mode]')?.value !== 'optimize')
    .map(priorityRowKey)
  const selectedRank = Number(select.value)
  const nextActiveKeys = movePriorityResourceOrder([...otherActiveKeys, key], key, selectedRank - 1)
  setPriorityOrder(root, nextActiveKeys, otherInactiveKeys)
}

const handleModeChange = (root, select) => {
  const key = select.dataset.resourceMode
  const otherActiveKeys = priorityRows(root)
    .filter((row) => priorityRowKey(row) !== key)
    .filter((row) => row.querySelector('[data-resource-mode]')?.value === 'optimize')
    .map(priorityRowKey)
  const otherInactiveKeys = priorityRows(root)
    .filter((row) => priorityRowKey(row) !== key)
    .filter((row) => row.querySelector('[data-resource-mode]')?.value !== 'optimize')
    .map(priorityRowKey)
  if (select.value === 'optimize') {
    setPriorityOrder(root, [...otherActiveKeys, key], otherInactiveKeys)
    return
  }
  setPriorityOrder(root, otherActiveKeys, [...otherInactiveKeys, key])
}

const priorityPreference = (root) => {
  const optimizeKeys = optimizePriorityKeys(root)
  const preferences = Object.fromEntries(
    PRIORITY_RESOURCE_KEYS.map((key) => {
      const mode = root.querySelector(`[data-resource-mode="${key}"]`)?.value
      if (mode === 'constraint') {
        return [
          key,
          { mode: 'constraint', minimumNetYieldPerHour: DEFAULT_MINIMUM_NET_YIELD_PER_HOUR },
        ]
      }
      if (mode === 'optimize') {
        return [key, { mode: 'optimize', rank: optimizeKeys.indexOf(key) + 1 }]
      }
      return [key, { mode: 'ignore' }]
    }),
  )
  return {
    mode: 'priority',
    preferences,
  }
}

const scorerSettings = (root) => {
  const hours = Number(root.querySelector('#dep-afk-hours')?.value || 0)
  const minutes = Number(root.querySelector('#dep-afk-minutes')?.value || 0)
  const fleetCount = Number(root.querySelector('input[name="dep-fleet-count"]:checked')?.value || 3)
  const preference = priorityPreference(root)
  return {
    afkMinutes: Math.max(0, Math.round(hours * 60 + minutes)),
    fleetCount,
    candidateIds: selectedCandidateIds(root),
    preference,
  }
}

const incomeAssumption = (root) => ({
  greatSuccess: root.querySelector('input[name="dep-success-mode"]:checked')?.value === 'great',
  daihatsuCount: Number(root.querySelector('#dep-daihatsu-count')?.value || 0),
})

const plannerSettings = (root) => {
  const settings = scorerSettings(root)
  return {
    version: EXPEDITION_PLANNER_SETTINGS_VERSION,
    afkMinutes: settings.afkMinutes,
    fleetCount: settings.fleetCount,
    preference: settings.preference,
    incomeModifier: incomeAssumption(root),
  }
}

const applyPlannerSettings = (root, settings) => {
  const preferences = settings.preference.preferences
  PRIORITY_RESOURCE_KEYS.forEach((key) => {
    const select = root.querySelector(`[data-resource-mode="${key}"]`)
    if (select) select.value = preferences[key].mode
  })
  const activeKeys = PRIORITY_RESOURCE_KEYS.filter(
    (key) => preferences[key].mode === 'optimize',
  ).sort((left, right) => preferences[left].rank - preferences[right].rank)
  const inactiveKeys = PRIORITY_RESOURCE_KEYS.filter((key) => preferences[key].mode !== 'optimize')
  setPriorityOrder(root, activeKeys, inactiveKeys)

  const hours = root.querySelector('#dep-afk-hours')
  const minutes = root.querySelector('#dep-afk-minutes')
  if (hours) hours.value = String(Math.floor(settings.afkMinutes / 60))
  if (minutes) minutes.value = String(settings.afkMinutes % 60)

  const fleetCount = root.querySelector(
    `input[name="dep-fleet-count"][value="${settings.fleetCount}"]`,
  )
  if (fleetCount) fleetCount.checked = true
  const successValue = settings.incomeModifier.greatSuccess ? 'great' : 'normal'
  const successMode = root.querySelector(`input[name="dep-success-mode"][value="${successValue}"]`)
  if (successMode) successMode.checked = true
  const daihatsuCount = root.querySelector('#dep-daihatsu-count')
  if (daihatsuCount) daihatsuCount.value = String(settings.incomeModifier.daihatsuCount)
}

const updateIncomeAssumption = (root) => {
  const assumption = incomeAssumption(root)
  const successFactor = assumption.greatSuccess ? 1.5 : 1
  const daihatsuFactor = 1 + assumption.daihatsuCount * 0.05
  root.querySelector('#dep-factor-total').textContent = `×${formatNumber(
    successFactor * daihatsuFactor,
    3,
  )}`
  root.querySelector('#dep-factor-formula').textContent = `${formatNumber(
    successFactor,
    2,
  )} × ${formatNumber(daihatsuFactor, 2)}`
}

const typeLabel = (value) => {
  const translated = t(`expedition.shipType.${value}`)
  return translated === `expedition.shipType.${value}` ? value : translated
}

const conditionRows = (requirements, fleet) => {
  const result = fleet.result
  const actual = fleet.actual
  const rows = [
    {
      label: t('expedition.require.flagshipLevel', { value: requirements.flagShipLevel }),
      actual: t('expedition.actual.level', { value: actual.flagShipLevel }),
      passed: result.flagShipLevel,
    },
    {
      label: t('expedition.require.shipCount', { value: requirements.shipCount }),
      actual: t('expedition.actual.ships', { value: actual.shipCount }),
      passed: result.shipCount,
    },
  ]
  const optional = [
    [
      'flagShipTypeOf',
      requirements.flagShipTypeOf,
      () => ({
        label: t('expedition.require.flagshipType', {
          value: requirements.flagShipTypeOf.map(typeLabel).join(' / '),
        }),
        actual: t('expedition.actual.value', { value: typeLabel(actual.flagShipType) }),
      }),
    ],
    [
      'levelCount',
      requirements.levelCount,
      () => ({
        label: t('expedition.require.totalLevel', { value: requirements.levelCount }),
        actual: t('expedition.actual.value', { value: actual.levelCount }),
      }),
    ],
    [
      'totalAsw',
      requirements.totalAsw,
      () => ({
        label: t('expedition.require.totalAsw', { value: requirements.totalAsw }),
        actual: t('expedition.actual.value', { value: actual.totalAsw }),
      }),
    ],
    [
      'totalLos',
      requirements.totalLos,
      () => ({
        label: t('expedition.require.totalLos', { value: requirements.totalLos }),
        actual: t('expedition.actual.value', { value: actual.totalLos }),
      }),
    ],
    [
      'totalAa',
      requirements.totalAa,
      () => ({
        label: t('expedition.require.totalAa', { value: requirements.totalAa }),
        actual: t('expedition.actual.value', { value: actual.totalAa }),
      }),
    ],
    [
      'totalFp',
      requirements.totalFp,
      () => ({
        label: t('expedition.require.totalFp', { value: requirements.totalFp }),
        actual: t('expedition.actual.value', { value: actual.totalFp }),
      }),
    ],
    [
      'totalTorp',
      requirements.totalTorp,
      () => ({
        label: t('expedition.require.totalTorp', { value: requirements.totalTorp }),
        actual: t('expedition.actual.value', { value: actual.totalTorp }),
      }),
    ],
    [
      'drumCount',
      requirements.drumCount,
      () => ({
        label: t('expedition.require.drumCount', { value: requirements.drumCount }),
        actual: t('expedition.actual.value', { value: actual.drumCount }),
      }),
    ],
    [
      'drumCarrierCount',
      requirements.drumCarrierCount,
      () => ({
        label: t('expedition.require.drumCarriers', {
          value: requirements.drumCarrierCount,
        }),
        actual: t('expedition.actual.ships', { value: actual.drumCarrierCount }),
      }),
    ],
  ]
  optional.forEach(([key, requirement, describe]) => {
    if (requirement !== null) rows.push({ ...describe(), passed: result[key] })
  })
  requirements.fleetSType.forEach((requirement, index) => {
    const actualCount = actual.types.filter((type) => requirement.oneOf.includes(type)).length
    rows.push({
      label: t('expedition.require.shipTypes', {
        types: requirement.oneOf.map(typeLabel).join(' / '),
        value: requirement.count,
      }),
      actual: t('expedition.actual.ships', { value: actualCount }),
      passed: result.fleetSType[index],
    })
  })
  return rows
}

const greatSuccessText = (condition, fleet) => {
  if (condition.type === 'drums') {
    return t('expedition.greatSuccess.drums', {
      required: condition.count,
      actual: fleet.actual.drumCount,
    })
  }
  if (condition.type === 'flagship-level') {
    return t('expedition.greatSuccess.flagship', {
      level: fleet.actual.flagShipLevel,
      sparkled: fleet.actual.sparkledCount,
      ships: fleet.actual.shipCount,
    })
  }
  if (condition.type === 'all-sparkle') {
    return t('expedition.greatSuccess.allSparkle', {
      sparkled: fleet.actual.sparkledCount,
      ships: fleet.actual.shipCount,
    })
  }
  return t('expedition.greatSuccess.unknown', {
    sparkled: fleet.actual.sparkledCount,
    ships: fleet.actual.shipCount,
  })
}

const modifierText = (modifier) => {
  if (modifier.type === 'custom') {
    return t('expedition.modifier.custom', { factor: formatNumber(modifier.factor, 2) })
  }
  return t('expedition.modifier.estimate', {
    mode: t(`expedition.modifier.${modifier.greatSuccess ? 'great' : 'normal'}`),
    count: modifier.daihatsuCount,
    factor: formatNumber(modifier.factor, 3),
    cost: modifier.type === 'kancepts-account' ? t('expedition.modifier.cost') : '',
  })
}

const pairingState = (fleet) => {
  if (fleet.busy) {
    const afterReturn = [
      !fleet.meetsRequirements ? t('expedition.recompose') : '',
      t('expedition.resupply'),
    ].filter(Boolean)
    const returned = fleet.currentMission.completesAt <= Date.now()
    return {
      key: 'waiting',
      label: t(returned ? 'expedition.state.returned' : 'expedition.state.waiting'),
      action: t(returned ? 'expedition.state.returnedAction' : 'expedition.state.waitingAction', {
        time: formatShortDate(fleet.currentMission.completesAt),
        actions: `${afterReturn.join(t('common.listSeparator'))} `,
      }),
    }
  }
  if (!fleet.meetsRequirements) {
    return {
      key: 'composition',
      label: t('expedition.state.composition'),
      action: t('expedition.state.compositionAction'),
    }
  }
  if (!fleet.isSupplied) {
    return {
      key: 'supply',
      label: t('expedition.state.supply'),
      action: t('expedition.state.supplyAction'),
    }
  }
  return {
    key: 'ready',
    label: t('expedition.state.ready'),
    action: t('expedition.state.readyAction'),
  }
}

const renderDispatchStep = ({ expedition, fleet }, index) => {
  const state = pairingState(fleet)
  return `
    <article class="dep-dispatch-step dep-state-${state.key} bscolor3 fcolor2">
      <span class="dep-step-number">${index + 1}</span>
      <div class="dep-step-route">
        <span>${t('expedition.dispatchFleet', { number: fleet.fleetNumber })}</span>
        <strong><b>${escapeHtml(expedition.displayNo)}</b> ${escapeHtml(expedition.name)}</strong>
        <span>${formatDuration(expedition.durationMinutes)}</span>
        <span class="dep-step-action">${escapeHtml(state.action)}</span>
      </div>
    </article>
  `
}

export const expeditionPlanHourlyTotalsMarkup = (plan) => {
  const totalRows = [
    ...resources.map((resource) => ({
      ...resource,
      digits: 1,
      value: plan.hourlyIncome[resource.key],
    })),
    {
      key: 'bucket',
      color: '#3b9d91',
      digits: 2,
      value: plan.bucketPotentialHourly,
    },
  ]
  const labelKey = plan.pairings.some(({ fleet }) => fleet.busy)
    ? 'expedition.planHourlyTotalAfterDispatch'
    : 'expedition.planHourlyTotal'
  return `
    <div class="dep-plan-totals" aria-label="${t(labelKey)}">
      <strong class="dep-plan-total-label">${t(labelKey)}</strong>
      ${totalRows
        .map(
          (row) => `
            <span class="dep-plan-total" style="--dep-resource:${row.color}">
              <b>${t(`common.${row.key}`)}</b>
              <em>${formatSigned(row.value, row.digits)}${t('common.perHour')}</em>
            </span>
          `,
        )
        .join('')}
    </div>
  `
}

const renderPairing = ({ expedition, fleet }) => {
  const state = pairingState(fleet)
  const perHourLabel = fleet.busy ? t('expedition.perHourAfterDispatch') : t('common.perHour')
  const conditionItems = conditionRows(expedition.requirements, fleet)
  const failedConditions = conditionItems.filter((condition) => !condition.passed)
  const conditions = conditionItems
    .map(
      (condition) => `
        <li class="${condition.passed ? 'pass' : 'fail'}">
          ${escapeHtml(condition.label)} <small>(${escapeHtml(condition.actual)})</small>
        </li>
      `,
    )
    .join('')
  const busyText = fleet.currentMission
    ? t('expedition.busy', {
        number: fleet.currentMission.displayNo,
        name: fleet.currentMission.name,
        time: formatDate(fleet.currentMission.completesAt),
        recommendedNumber: expedition.displayNo,
        recommendedName: expedition.name,
      })
    : ''
  const sampleFleet =
    expedition.requirements.sampleFleet.length > 0
      ? t('expedition.sampleFleet', {
          ships: expedition.requirements.sampleFleet.join(t('common.listSeparator')),
        })
      : ''
  const compositionSummary =
    failedConditions.length === 0
      ? t('expedition.compositionPassed', { count: conditionItems.length })
      : t('expedition.compositionFailed', { count: failedConditions.length })
  return `
    <article class="dep-pairing dep-state-${state.key} bscolor3 fcolor2">
      <header class="dep-pairing-head">
        <h3>${t('expedition.pairingTitle', { number: fleet.fleetNumber, expedition: `${escapeHtml(expedition.displayNo)} ${escapeHtml(expedition.name)}` })} <span>· ${formatDuration(expedition.durationMinutes)}</span></h3>
        <span class="dep-readiness">${state.label}</span>
      </header>
      <p class="dep-next-action">${t('expedition.nextAction', { action: escapeHtml(state.action) })}</p>
      <div class="dep-income">
        ${resources
          .map(
            (resource) =>
              `<span style="--dep-resource:${resource.color}"><strong>${resourceLabel(resource)}</strong>${formatSigned(expedition.netIncome[resource.key])}${t('expedition.perTrip')} · ${formatSigned(expedition.hourlyIncome[resource.key], 1)}${perHourLabel}</span>`,
          )
          .join('')}
        ${
          expedition.bucketPotential.maxPerTrip > 0
            ? `<span style="--dep-resource:#3b9d91"><strong>${t('common.bucket')}</strong>${t('expedition.bucketPerTrip', { count: formatNumber(expedition.bucketPotential.maxPerTrip) })} · ${formatNumber(expedition.bucketPotential.hourly, 2)}${perHourLabel}</span>`
            : ''
        }
      </div>
      <details class="dep-fold page_panel bscolor4 fcolor2" ${failedConditions.length > 0 ? 'open' : ''}>
        <summary class="${failedConditions.length === 0 ? 'dep-fold-summary-ok' : 'dep-fold-summary-warn'}">${t('expedition.compositionCheck', { summary: compositionSummary })}</summary>
        <div class="dep-fold-body">
          <ul class="dep-conditions">${conditions}</ul>
        </div>
      </details>
      <details class="dep-fold page_panel bscolor4 fcolor2">
        <summary>${t('expedition.calculationDetails')}</summary>
        <div class="dep-fold-body">
          <ul class="dep-notes">
            ${busyText ? `<li class="dep-busy">${escapeHtml(busyText)}</li>` : ''}
            <li>${fleet.busy ? t('expedition.supplyAfterReturn') : fleet.isSupplied ? t('expedition.supplyReady') : t('expedition.supplyNeeded')}</li>
            <li>${escapeHtml(modifierText(expedition.modifier))}</li>
            <li>${escapeHtml(greatSuccessText(expedition.greatSuccessCondition, fleet))}</li>
            <li>${t('expedition.daihatsuWarning')}</li>
            <li>${t('expedition.resupplyEstimate', { fuel: formatNumber(expedition.estimatedResupplyCost.fuel), ammo: formatNumber(expedition.estimatedResupplyCost.ammo) })}</li>
            ${sampleFleet ? `<li>${escapeHtml(sampleFleet)}</li>` : ''}
          </ul>
        </div>
      </details>
    </article>
  `
}

const renderPlan = (plan) => {
  return `
    <section class="dep-plan">
      <section class="dep-dispatch-board page_panel bscolor4 fcolor2">
        <div class="dep-dispatch-title">
          <h3>${t('expedition.bestPlan')}</h3>
          <span>${escapeHtml(modifierText(plan.pairings[0].expedition.modifier))}</span>
        </div>
        ${expeditionPlanHourlyTotalsMarkup(plan)}
        <div class="dep-dispatch-steps">${plan.pairings.map(renderDispatchStep).join('')}</div>
      </section>
      <div class="dep-pairing-list">${plan.pairings.map(renderPairing).join('')}</div>
    </section>
  `
}

const renderPlans = (root, result) => {
  const output = root.querySelector('#dep-output')
  if (result?.status !== 'success' || !Array.isArray(result.plans) || result.plans.length === 0) {
    const message = result?.reasonCode
      ? t(`expedition.reason.${result.reasonCode}`, result.reasonValues)
      : translateMessage(result?.error, 'expedition.noPlanFallback')
    output.innerHTML = `<div class="dep-error bscolor3 fcolor2"><strong>${t('expedition.noPlan')}</strong><span>${escapeHtml(message)}</span></div>`
    return
  }
  output.innerHTML = `<div class="dep-plan-slot">${renderPlan(result.plans[0])}</div>`
}

const updateCandidateSummary = (root) => {
  const candidates = [...root.querySelectorAll('[data-expedition-id]')]
  const selectedCount = candidates.filter((input) => input.checked).length
  root.querySelector('#dep-candidate-count').textContent =
    selectedCount === candidates.length
      ? t('common.allSelectedCount', { total: candidates.length })
      : t('common.selectedCount', { selected: selectedCount, total: candidates.length })
}

const applyCandidatePreset = (root, preset) => {
  root.querySelectorAll('[data-expedition-id]').forEach((input) => {
    const id = Number(input.dataset.expeditionId)
    input.checked =
      preset === 'all' ||
      (preset === 'recommended' && !recommendedBlacklist.has(id)) ||
      (preset === 'buckets' && bucketExpeditions.has(id))
  })
  updateCandidateSummary(root)
}

const mountPanel = (invoke) => {
  const content = document.querySelector('#content')
  const contentHtml = document.querySelector('#contentHtml')
  if (!content || !contentHtml) return
  installOptimizerDebugConsoleHelper()

  content.style.display = 'block'
  contentHtml.innerHTML = plannerMarkup(t, resources, weightResources, expeditionGroups)
  contentHtml.style.display = 'block'
  window.scrollTo(0, 0)

  const root = contentHtml.querySelector('.dep-root')
  const syncButton = root.querySelector('#dep-sync')
  const generateButton = root.querySelector('#dep-generate')
  const storedSettings = readExpeditionPlannerSettings()
  let current = null
  let syncResetTimer = null

  if (storedSettings) applyPlannerSettings(root, storedSettings)

  const sync = async () => {
    if (syncButton.disabled) return
    if (syncResetTimer !== null) window.clearTimeout(syncResetTimer)
    syncButton.disabled = true
    syncButton.textContent = t('common.syncing')
    syncButton.title = t('expedition.syncingTitle')
    syncButton.setAttribute('aria-busy', 'true')
    await waitForNextPaint()
    let result
    try {
      result = await invoke(EXPEDITION_SUMMARY_CHANNEL)
    } catch {
      result = { status: 'error', error: { code: 'EXPEDITION_SYNC_CONNECTION_FAILED' } }
    } finally {
      syncButton.disabled = false
      syncButton.removeAttribute('aria-busy')
    }
    if (result?.status !== 'success') {
      syncButton.textContent = t('expedition.syncFailed')
      syncButton.title = translateMessage(result?.error, 'expedition.syncUnavailable')
      generateButton.disabled = true
      return
    }
    current = result.current
    updateResources(root, current)
    generateButton.disabled = false
    syncButton.textContent = t('expedition.syncComplete')
    syncButton.title = t('expedition.syncStatus', {
      time: formatDate(result.generatedAt),
      maximum: formatNumber(result.maxResource),
    })
    syncResetTimer = window.setTimeout(() => {
      syncButton.textContent = t('expedition.syncResources')
      syncResetTimer = null
    }, 1200)
  }

  root.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyCandidatePreset(root, button.dataset.preset))
  })
  root.querySelectorAll('[data-expedition-id]').forEach((input) => {
    input.addEventListener('change', () => updateCandidateSummary(root))
  })
  updateCandidateSummary(root)
  setPriorityOrder(root, optimizePriorityKeys(root), nonOptimizePriorityKeys(root))
  root.querySelectorAll('[data-resource-mode]').forEach((select) => {
    select.addEventListener('change', () => handleModeChange(root, select))
  })
  root.querySelectorAll('[data-resource-priority]').forEach((select) => {
    select.addEventListener('change', () => handlePriorityChange(root, select))
  })
  root.querySelectorAll('[data-priority-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const activeKeys = optimizePriorityKeys(root)
      const currentIndex = activeKeys.indexOf(button.dataset.priorityKey)
      if (currentIndex < 0) return
      const targetIndex = currentIndex + (button.dataset.priorityMove === 'up' ? -1 : 1)
      setPriorityOrder(
        root,
        movePriorityResourceOrder(activeKeys, button.dataset.priorityKey, targetIndex),
        nonOptimizePriorityKeys(root),
      )
      writeExpeditionPlannerSettings(plannerSettings(root))
    })
  })
  root
    .querySelectorAll('input[name="dep-success-mode"], #dep-daihatsu-count')
    .forEach((control) => control.addEventListener('change', () => updateIncomeAssumption(root)))
  const persistedControlSelector = [
    '[data-resource-mode]',
    '[data-resource-priority]',
    '#dep-afk-hours',
    '#dep-afk-minutes',
    'input[name="dep-fleet-count"]',
    'input[name="dep-success-mode"]',
    '#dep-daihatsu-count',
  ].join(', ')
  root.addEventListener('change', (event) => {
    if (event.target.matches(persistedControlSelector)) {
      writeExpeditionPlannerSettings(plannerSettings(root))
    }
  })
  updateIncomeAssumption(root)
  syncButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    sync()
  })
  generateButton.addEventListener('click', async () => {
    const settings = scorerSettings(root)
    const incomeModifier = incomeAssumption(root)
    const debug = isOptimizerDebugEnabled()
    if (!Number.isInteger(settings.afkMinutes) || settings.afkMinutes > 2880) {
      renderPlans(root, { status: 'error', error: { code: 'EXPEDITION_AFK_INVALID' } })
      return
    }
    if (
      !settings.preference ||
      settings.preference.mode !== 'priority' ||
      !isPriorityPreferenceValid(settings.preference.preferences)
    ) {
      renderPlans(root, {
        status: 'error',
        error: { code: 'EXPEDITION_WEIGHTS_INVALID' },
      })
      return
    }
    if (settings.candidateIds.length < settings.fleetCount) {
      renderPlans(root, {
        status: 'error',
        error: { code: 'EXPEDITION_CANDIDATES_INVALID' },
      })
      return
    }
    generateButton.disabled = true
    generateButton.textContent = t('expedition.generating')
    generateButton.classList.add('is-loading')
    generateButton.setAttribute('aria-busy', 'true')
    try {
      let result
      try {
        result = await invoke(EXPEDITION_PLAN_CHANNEL, { ...settings, incomeModifier, debug })
      } catch {
        result = { status: 'error', error: { code: 'EXPEDITION_PLAN_CONNECTION_FAILED' } }
      }
      if (result?.current && result.generatedAt) {
        current = result.current
        updateResources(root, current)
        syncButton.title = t('expedition.syncStatus', {
          time: formatDate(result.generatedAt),
          maximum: formatNumber(result.maxResource),
        })
      }
      renderPlans(root, result)
      logOptimizationDebugReport(result)
    } finally {
      generateButton.disabled = false
      generateButton.textContent = t('expedition.generate')
      generateButton.classList.remove('is-loading')
      generateButton.removeAttribute('aria-busy')
    }
  })
  sync()
}

export const injectExpeditionGoalPlanner = (invoke) => {
  ;({ locale, t, translateMessage } = createStrategyRoomI18n())
  if (!document.querySelector('#damecon-expedition-goal-styles')) {
    const style = document.createElement('style')
    style.id = 'damecon-expedition-goal-styles'
    style.textContent = styles
    document.head.appendChild(style)
  }

  const scorerMenuItem = document.querySelector('#menu [data-id="expedscorer"]')
  const menuList = scorerMenuItem?.closest('ul.menulist')
  if (!menuList || document.querySelector('[data-id="damecon-expedition-recommendation"]')) return

  const menuItem = document.createElement('li')
  menuItem.dataset.id = 'damecon-expedition-recommendation'
  menuItem.textContent = t('expedition.menu')
  menuItem.title = t('expedition.menuTitle')
  menuItem.addEventListener(
    'click',
    (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      document.querySelectorAll('#menu .menulist li.active').forEach((item) => {
        item.classList.remove('active')
      })
      menuItem.classList.add('active')
      mountPanel(invoke)
    },
    true,
  )
  scorerMenuItem.insertAdjacentElement('afterend', menuItem)
}
