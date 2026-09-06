import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { en } from '../browser/recommendation/i18n/en.js'
import { jp } from '../browser/recommendation/i18n/jp.js'
import { scn } from '../browser/recommendation/i18n/scn.js'
import { tcn } from '../browser/recommendation/i18n/tcn.js'
import {
  applyDailyImprovementCategoryFilter,
  applyDefaultDailyImprovementFilter,
  collectDailyImprovementCategories,
  getDailyImprovementEquipmentType,
  isDailyImprovementEquipmentAvailable,
} from '../browser/recommendation/daily-improvement-ui.js'
import {
  createStrategyRoomI18n,
  getStrategyRoomLanguage,
  getStrategyRoomLocale,
} from '../browser/recommendation/i18n.js'
import {
  EXPEDITION_PLANNER_SETTINGS_STORAGE_KEY,
  expeditionPlanHourlyTotalsMarkup,
  readExpeditionPlannerSettings,
  writeExpeditionPlannerSettings,
} from '../browser/recommendation/expedition-goal-ui.js'
import { EXPEDITION_RESOURCES } from '../browser/recommendation/resource-metadata.js'
import {
  classifyQuestRewards,
  extractNormalMapIds,
  rankQuestRecommendations,
} from '../browser/recommendation/quest-recommendation.js'
import {
  downloadQuestRecommendationMarkdown,
  filterAndSortQuestRecommendationGroups,
  logQuestTypeFilterChange,
  QUEST_MAP_CHAPTER_KEYS,
  QUEST_RECOMMENDATION_SETTINGS_STORAGE_KEY,
  QUEST_TYPE_FILTERS,
  questTypeFor,
  questRecommendationMarkdown,
  questRecommendationListMarkup,
  readQuestRecommendationSettings,
  writeQuestRecommendationSettings,
} from '../browser/recommendation/quest-recommendation-ui.js'
import {
  movePriorityResourceOrder,
  plannerMarkup,
  styles as expeditionStyles,
} from '../browser/recommendation/views/expedition-goal-view.js'
import {
  panelMarkup as fleetMarkup,
  styles as fleetStyles,
} from '../browser/recommendation/views/fleet-recommender-view.js'
import {
  localizedRouteDescription,
  routeOptionLabel,
} from '../browser/recommendation/strategy-room-ui.js'
import {
  recentSectionMarkup,
  styles as recentStyles,
} from '../browser/recommendation/views/recent-tabs-view.js'
import {
  panelMarkup as questMarkup,
  styles as questStyles,
} from '../browser/recommendation/views/quest-recommendation-view.js'
import {
  panelMarkup as resourceCenterMarkup,
  styles as resourceCenterStyles,
} from '../browser/recommendation/views/resource-center-view.js'
import {
  markup as resourceLedgerMarkup,
  styles as resourceLedgerStyles,
} from '../browser/recommendation/views/resource-ledger-view.js'

const interpolate = (message, values) =>
  String(message).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  )

const catalogs = {
  en,
  jp: { ...en, ...jp },
  scn: { ...en, ...scn },
  tcn: { ...en, ...tcn },
}

const translator =
  (language) =>
  (key, values = {}) =>
    interpolate(catalogs[language][key] ?? en[key] ?? key, values)

const viewSnapshot = (language) => {
  const t = translator(language)
  const weightResources = [
    { key: 'bucket', color: '#3b9d91' },
    ...['fuel', 'bauxite', 'ammo', 'steel'].map((key) =>
      EXPEDITION_RESOURCES.find((resource) => resource.key === key),
    ),
  ]
  const output = [
    fleetMarkup(t),
    plannerMarkup(t, EXPEDITION_RESOURCES, weightResources, [[[1, '01', '00:15']]]),
    resourceCenterMarkup(t),
    resourceLedgerMarkup(t),
    recentSectionMarkup(t),
    questMarkup(t),
  ].join('\n---view---\n')
  return createHash('sha256').update(output).digest('hex')
}

test('strategy room pure views preserve four-language output snapshots', () => {
  assert.deepEqual(
    Object.fromEntries(Object.keys(catalogs).map((language) => [language, viewSnapshot(language)])),
    {
      en: 'c8a0ad55fd74fd5917c8e9ac7165fb65c1bbf19705cc8746db327b07a928c776',
      jp: '2596fb96e97a8fbe8cfc81d669af3446bd48fa4c10a53d20c6ec499b11672287',
      scn: '344578f97a1d42053c22c3b0b5da63bb6318b10dead93534584528b2ac07ef39',
      tcn: 'e91a21db2dc725678d3298735f5f5a7524e40a5a7f666d6e3dc929c757a4d43f',
    },
  )
})

test('fleet route options show the guide name before source sites', () => {
  assert.equal(
    routeOptionLabel({
      name: 'CoNye・長陸最矢流',
      sources: [
        'https://conye.hatenablog.com/entry/2021/08/13/180323',
        'https://kamigame.jp/kancolle/fixture',
      ],
    }),
    'CoNye・長陸最矢流｜conye.hatenablog.com + kamigame.jp',
  )
})

test('expedition preference view uses unique priority controls', () => {
  const weightResources = [
    { key: 'bucket', color: '#3b9d91' },
    ...['fuel', 'bauxite', 'ammo', 'steel'].map((key) =>
      EXPEDITION_RESOURCES.find((resource) => resource.key === key),
    ),
  ]
  const markup = plannerMarkup(translator('tcn'), EXPEDITION_RESOURCES, weightResources, [
    [[1, '01', '00:15']],
  ])

  assert.match(markup, /data-resource-mode="fuel"/)
  assert.match(markup, /data-resource-priority="fuel"/)
  assert.match(markup, /<option value="constraint">至少不虧<\/option>/)
  assert.match(markup, /<option value="ignore">不考慮<\/option>/)
  assert.doesNotMatch(markup, /data-resource-weight/)
})

test('priority order movement keeps ranks unique and continuous', () => {
  const moved = movePriorityResourceOrder(
    ['bucket', 'fuel', 'bauxite', 'ammo', 'steel'],
    'steel',
    0,
  )

  assert.deepEqual(moved, ['steel', 'bucket', 'fuel', 'bauxite', 'ammo'])
})

test('expedition best plan shows aggregate hourly resources and bucket expectation', () => {
  const plan = {
    hourlyIncome: { fuel: 120.5, ammo: -8, steel: 60, bauxite: 42.25 },
    bucketPotentialHourly: 1.125,
    pairings: [{ fleet: { busy: true } }, { fleet: { busy: false } }],
  }
  const markup = expeditionPlanHourlyTotalsMarkup(plan)

  assert.match(markup, /dep-plan-total-label/)
  assert.match(markup, /excluding the current wait/)
  assert.match(markup, /<b>Fuel<\/b>\s*<em>\+120\.5\/h<\/em>/)
  assert.match(markup, /<b>Ammo<\/b>\s*<em>-8\.0\/h<\/em>/)
  assert.match(markup, /<b>Buckets<\/b>\s*<em>\+1\.13\/h<\/em>/)
  assert.doesNotMatch(
    expeditionPlanHourlyTotalsMarkup({
      ...plan,
      pairings: plan.pairings.map(() => ({ fleet: { busy: false } })),
    }),
    /excluding the current wait/,
  )
})

test('quest recommendations order by guidance, defer daily ties, then use deadline', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const result = rankQuestRecommendations(
    [
      {
        id: 1,
        period: 'monthly',
        status: 1,
        resetAt: now + 23 * 60 * 60 * 1000,
        memo: 'Rewards other materials.',
      },
      {
        id: 2,
        period: 'quarterly',
        status: 2,
        resetAt: now + 2 * 24 * 60 * 60 * 1000,
        memo: 'Rewards a Medal.',
      },
      {
        id: 3,
        period: 'monthly',
        status: 1,
        resetAt: now + 3 * 24 * 60 * 60 * 1000,
        memo: 'Rewards a Medal.',
      },
      {
        id: 4,
        period: 'daily',
        status: 1,
        resetAt: now + 4 * 60 * 60 * 1000,
        memo: 'Rewards a Medal.',
      },
      {
        id: 5,
        period: 'weekly',
        status: 1,
        resetAt: now + 12 * 60 * 60 * 1000,
        rewardConsumables: [0, 0, 0, 1],
      },
    ],
    { now },
  )

  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    [2, 3, 4, 5, 1],
  )
})

test('quest recommendations use repeatability and effective reward as the primary value bands', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 7 * 24 * 60 * 60 * 1000
  const result = rankQuestRecommendations(
    [
      {
        id: 1,
        period: 'weekly',
        status: 1,
        resetAt,
        memo: 'Rewards 2 Screws.',
      },
      {
        id: 2,
        period: 'oneTime',
        status: 1,
        memo: 'Rewards a Medal.',
      },
      { id: 3, period: 'monthly', status: 1, resetAt, memo: 'Rewards furniture.' },
      { id: 4, period: 'oneTime', status: 1, memo: 'Rewards furniture.' },
    ],
    { now },
  )

  assert.deepEqual(
    result.recommendations.map(({ id, valueBand }) => ({ id, valueBand })),
    [
      { id: 1, valueBand: 4 },
      { id: 2, valueBand: 3 },
      { id: 3, valueBand: 2 },
      { id: 4, valueBand: 1 },
    ],
  )
  assert.equal(result.oneTimeCount, 2)
})

test('quest recommendations inherit valuable rewards through locked successor chains', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 7 * 24 * 60 * 60 * 1000
  const result = rankQuestRecommendations(
    [
      {
        id: 10,
        code: 'A10',
        name: 'Small prerequisite',
        period: 'oneTime',
        status: 1,
        memo: 'Rewards furniture.',
        unlockIds: [11],
      },
      {
        id: 11,
        code: 'A11',
        name: 'Middle prerequisite',
        period: 'oneTime',
        status: 0,
        locked: true,
        unlockIds: [12],
      },
      {
        id: 12,
        code: 'Bq6',
        name: 'Action Report successor',
        period: 'quarterly',
        status: 0,
        locked: true,
        resetAt,
        memo: 'Selectable Reward: Action Report x1.',
      },
      {
        id: 20,
        period: 'oneTime',
        status: 1,
        memo: 'Rewards 2 Screws.',
      },
      { id: 30, period: 'weekly', status: 1, resetAt, memo: 'Rewards furniture.' },
      {
        id: 40,
        period: 'oneTime',
        status: 1,
        unlockIds: [41],
        memo: 'Rewards furniture.',
      },
      {
        id: 41,
        period: 'oneTime',
        status: 1,
        memo: 'Rewards a Medal.',
      },
    ],
    { now },
  )

  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    [41, 10, 20, 30, 40],
  )
  const prerequisite = result.recommendations.find(({ id }) => id === 10)
  assert.equal(prerequisite.effectiveReward.source, 'downstream')
  assert.equal(prerequisite.effectiveReward.sourceQuestId, 12)
  assert.equal(prerequisite.guidance.reasonKeys.includes('downstreamValue'), true)
  assert.deepEqual(
    prerequisite.downstreamTargets.map(({ id, depth, pathIds }) => ({ id, depth, pathIds })),
    [{ id: 12, depth: 2, pathIds: [11, 12] }],
  )
  assert.equal(result.downstreamValueQuestCount, 1)
  assert.equal(result.recommendations.find(({ id }) => id === 40).downstreamTargets.length, 0)
})

test('quest rewards preserve medal, action report, screws, and other priority', () => {
  const rewards = [
    classifyQuestRewards({ memo: '獎勵：改裝設計圖x1' }),
    classifyQuestRewards({ memo: '獎勵：戰鬥詳報x1' }),
    classifyQuestRewards({ rewardConsumables: [0, 0, 0, 20] }),
    classifyQuestRewards({ memo: '獎勵：高速修復材x5' }),
  ]

  assert.deepEqual(
    rewards.map(({ category, priority }) => ({ category, priority })),
    [
      { category: 'medalBlueprint', priority: 4 },
      { category: 'actionReport', priority: 3 },
      { category: 'screws', priority: 2 },
      { category: 'other', priority: 1 },
    ],
  )
  assert.equal(classifyQuestRewards({ memo: 'Rewards a Screw.' }).priority, 2)
})

test('one-time valuable quests keep reward guidance while repeatable equivalents sort first', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const result = rankQuestRecommendations(
    [
      {
        id: 1,
        code: 'BwActionReport',
        period: 'weekly',
        status: 1,
        resetAt: now + 7 * 24 * 60 * 60 * 1000,
        memo: '獎勵：戰鬥詳報x1',
      },
      {
        id: 2,
        code: 'B204',
        period: 'oneTime',
        status: 1,
        memo: '獎勵：戰鬥詳報x1、選擇獎勵',
      },
      {
        id: 3,
        code: 'BBlueprint',
        period: 'oneTime',
        status: 1,
        memo: '獎勵：改裝設計圖x1',
      },
    ],
    { now },
  )

  assert.equal(result.rankingVersion, 15)
  assert.deepEqual(
    result.recommendations.map(({ id, valueBand, guidance }) => ({
      id,
      valueBand,
      tier: guidance.tier,
    })),
    [
      { id: 1, valueBand: 4, tier: 'priority' },
      { id: 3, valueBand: 3, tier: 'highest' },
      { id: 2, valueBand: 3, tier: 'priority' },
    ],
  )

  const b204 = result.recommendations.find(({ code }) => code === 'B204')
  const markup = questRecommendationListMarkup({
    recommendations: [b204],
    groups: [{ id: 'quest:2', kind: 'single', quests: [b204], synergy: null }],
  })
  assert.match(markup, /B204/)
  assert.match(markup, />Priority</)
})

test('quest recommendations return every current fixed-reset quest', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 7 * 24 * 60 * 60 * 1000
  const result = rankQuestRecommendations(
    [
      { id: 1, period: 'monthly', status: 1, resetAt },
      { id: 2, period: 'quarterly', status: 2, resetAt },
      { id: 3, period: 'weekly', status: 2, resetAt },
      { id: 4, period: 'monthly', status: 3, resetAt },
      { id: 5, period: 'quarterly', status: 1, resetAt: now - 1 },
      { id: 6, period: 'monthly', status: 1, resetAt },
      { id: 7, period: 'quarterly', status: 1, resetAt },
      { id: 8, period: 'monthly', status: 1, resetAt },
      { id: 9, period: 'quarterly', status: 1, resetAt },
      { id: 10, period: 'monthly', status: 1, resetAt },
      { id: 11, period: 'daily', status: 1, resetAt },
      { id: 12, period: 'yearly', resetPeriod: 'yearlySep', status: 1, resetAt },
      { id: 13, period: 'other', status: 1, resetAt },
    ],
    { now },
  )

  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    [2, 3, 1, 6, 7, 8, 9, 10, 12, 11],
  )
  assert.equal(result.recommendations.length, result.candidateCount)
  assert.equal(result.groupCount, result.candidateCount)
  assert.deepEqual(
    result.groups.flatMap(({ quests }) => quests.map(({ id }) => id)),
    result.recommendations.map(({ id }) => id),
  )
  assert.equal(result.monthlyCount, 4)
  assert.equal(result.quarterlyCount, 3)
  assert.equal(result.dailyCount, 1)
  assert.equal(result.weeklyCount, 1)
  assert.equal(result.yearlyCount, 1)
  assert.deepEqual(result.periodCounts, {
    daily: 1,
    weekly: 1,
    monthly: 4,
    quarterly: 3,
    yearly: 1,
    oneTime: 0,
  })
})

test('current time-limited quests appear under Other with an unknown final deadline', () => {
  const now = Date.UTC(2026, 8, 4, 0, 0, 0)
  const result = rankQuestRecommendations(
    [
      {
        id: 1_031,
        code: '2605B5',
        name: 'Early-summer limited northern patrol',
        description: 'Sortie to 3-2, 3-5, and 3-3.',
        period: 'oneTime',
        status: 2,
        limited: true,
      },
      {
        id: 500,
        code: 'B100',
        name: 'Normal one-time sortie',
        description: 'Sortie to 3-2.',
        period: 'oneTime',
        status: 1,
      },
    ],
    { now },
  )

  assert.equal(result.candidateCount, 2)
  assert.equal(result.oneTimeCount, 1)
  assert.equal(result.limitedCount, 1)
  const limited = result.recommendations.find(({ id }) => id === 1_031)
  assert.equal(questTypeFor(limited), 'other')

  const filtered = filterAndSortQuestRecommendationGroups(result, {
    chapterFilters: QUEST_MAP_CHAPTER_KEYS,
    typeFilters: ['other'],
    rewardFilters: [],
    sortMode: 'priorityDesc',
  })
  assert.deepEqual(
    filtered.groups.flatMap(({ quests }) => quests.map(({ id }) => id)),
    [1_031],
  )

  const markup = questRecommendationListMarkup(filtered)
  assert.match(markup, />Time-limited</)
  assert.match(markup, /Final availability deadline is not provided by KC3/)

  const markdown = questRecommendationMarkdown({
    result,
    viewState: {
      chapterFilters: QUEST_MAP_CHAPTER_KEYS,
      typeFilters: ['other'],
      rewardFilters: [],
      sortMode: 'priorityDesc',
    },
    exportedAt: '2026-09-04T00:00:00.000Z',
  })
  assert.match(markdown, /Time-limited/)
  assert.match(markdown, /Final availability deadline is not provided by KC3/)
})

test('quest chapter filters default on while non-sortie quests stay visible at the top', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const result = rankQuestRecommendations(
    [
      {
        id: 1_301,
        code: 'B201',
        name: 'Chapter one fixture',
        description: '在 １－１、1-5 與 1—6 完成指定出擊。',
        period: 'oneTime',
        status: 1,
      },
      {
        id: 1_302,
        code: 'B202',
        name: 'Chapter two fixture',
        description: 'S-rank [W2-2] and [W2-5].',
        period: 'oneTime',
        status: 1,
      },
      {
        id: 1_303,
        code: 'B203',
        name: 'Cross chapter fixture',
        description: 'Complete 1-4, 2-3, and 7-5.',
        period: 'oneTime',
        status: 1,
      },
      {
        id: 1_304,
        code: 'C201',
        name: 'Exercise fixture',
        description: 'Win three exercises.',
        period: 'oneTime',
        status: 1,
      },
    ],
    { now },
  )

  assert.deepEqual(extractNormalMapIds('１－１ / 1–6 / W2-5 / 7-6'), ['1-1', '1-6', '2-5'])
  assert.deepEqual(
    result.recommendations.map(({ id, mapIds, chapterKey }) => ({ id, mapIds, chapterKey })),
    [
      { id: 1301, mapIds: ['1-1', '1-5', '1-6'], chapterKey: 'world1' },
      { id: 1302, mapIds: ['2-2', '2-5'], chapterKey: 'world2' },
      { id: 1303, mapIds: ['1-4', '2-3', '7-5'], chapterKey: 'crossWorld' },
      { id: 1304, mapIds: [], chapterKey: 'other' },
    ],
  )
  assert.deepEqual(result.chapterCounts, {
    world1: 1,
    world2: 1,
    world3: 0,
    world4: 0,
    world5: 0,
    world6: 0,
    world7: 0,
    crossWorld: 1,
    other: 1,
  })

  const idsFor = (view) =>
    view.groups.flatMap(({ quests: groupQuests }) => groupQuests.map(({ id }) => id))
  assert.deepEqual(idsFor(filterAndSortQuestRecommendationGroups(result)), [1304, 1301, 1302, 1303])
  assert.deepEqual(
    idsFor(filterAndSortQuestRecommendationGroups(result, { chapterFilters: ['world1'] })),
    [1304, 1301, 1303],
  )
  assert.deepEqual(
    idsFor(filterAndSortQuestRecommendationGroups(result, { chapterFilters: ['world3'] })),
    [1304],
  )
  assert.deepEqual(idsFor(filterAndSortQuestRecommendationGroups(result, { chapterFilters: [] })), [
    1304,
  ])

  const mixedGroupView = filterAndSortQuestRecommendationGroups(
    {
      recommendations: result.recommendations,
      groups: [
        {
          id: 'mixed-scope-fixture',
          kind: 'combined',
          synergy: { id: 'mixed-scope-fixture' },
          quests: [
            result.recommendations.find(({ id }) => id === 1301),
            result.recommendations.find(({ id }) => id === 1304),
          ],
        },
      ],
    },
    { chapterFilters: [] },
  )
  assert.equal(mixedGroupView.groups.length, 1)
  assert.equal(mixedGroupView.groups[0].kind, 'single')
  assert.equal(mixedGroupView.groups[0].synergy, null)
  assert.deepEqual(idsFor(mixedGroupView), [1304])

  assert.deepEqual(QUEST_MAP_CHAPTER_KEYS, [
    'world1',
    'world2',
    'world3',
    'world4',
    'world5',
    'world6',
    'world7',
  ])

  const markup = questRecommendationListMarkup(result)
  assert.equal(markup.indexOf('Exercise fixture') < markup.indexOf('Chapter one fixture'), true)
  assert.doesNotMatch(markup, /dqr-chapter-heading/)
  assert.doesNotMatch(markup, /Chapter 1 · 1-1–1-6/)
  assert.equal((markup.match(/class="dqr-quest-node"/g) || []).length, 4)

  const controls = questMarkup(translator('en'))
  assert.equal((controls.match(/data-quest-chapter="world[1-7]"/g) || []).length, 7)
  assert.equal((controls.match(/dqr-chapter-filter is-active/g) || []).length, 7)
  assert.match(controls, /class="dqr-toolbar-button dqr-export"[^>]*disabled/)
  assert.equal(controls.indexOf('dqr-export') < controls.indexOf('dqr-refresh'), true)
})

test('broad sortie quests use catalog maps and do not bypass priority or chapter sorting', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const result = rankQuestRecommendations(
    [
      {
        id: 229,
        code: 'Bw6',
        name: '敵東方艦隊を撃滅せよ！',
        description: '在第 4 海域任意關卡的王點取得 B 勝利或以上 12 次！',
        period: 'weekly',
        status: 1,
        resetAt: now + 7 * 24 * 60 * 60 * 1000,
        unlockIds: [230],
        memo: '其他素材',
      },
      {
        id: 230,
        code: 'Bw9',
        name: '南方海域珊瑚諸島沖の制空権を握れ！',
        period: 'weekly',
        status: 0,
        locked: true,
        memo: '改修資材x2',
      },
      {
        id: 204,
        code: 'B204',
        name: '「第二駆逐隊(後期編成)」、出撃せよ！',
        mapIds: ['1-2', '1-3', '1-4', '2-1'],
        period: 'oneTime',
        status: 1,
        memo: '戰鬥詳報x1',
      },
    ],
    { now },
  )
  const bw6 = result.recommendations.find(({ code }) => code === 'Bw6')
  assert.deepEqual(bw6.mapIds, ['4-1', '4-2', '4-3', '4-4', '4-5'])
  assert.equal(bw6.chapterKey, 'world4')
  assert.equal(bw6.guidance.tier, 'recommended')

  const allChapters = filterAndSortQuestRecommendationGroups(result, {
    chapterFilters: QUEST_MAP_CHAPTER_KEYS,
    typeFilters: ['sortie'],
    sortMode: 'priorityDesc',
  })
  assert.deepEqual(
    allChapters.groups.flatMap(({ quests }) => quests.map(({ code }) => code)),
    ['B204', 'Bw6'],
  )
  assert.equal(
    allChapters.groups.every(({ mapScope }) => mapScope === 'sortie'),
    true,
  )

  const worldTwo = filterAndSortQuestRecommendationGroups(result, {
    chapterFilters: ['world2'],
    typeFilters: ['sortie'],
    sortMode: 'priorityDesc',
  })
  assert.deepEqual(
    worldTwo.groups.flatMap(({ quests }) => quests.map(({ code }) => code)),
    ['B204'],
  )

  const worldFour = filterAndSortQuestRecommendationGroups(result, {
    chapterFilters: ['world4'],
    typeFilters: ['sortie'],
    sortMode: 'priorityDesc',
  })
  assert.deepEqual(
    worldFour.groups.flatMap(({ quests }) => quests.map(({ code }) => code)),
    ['Bw6'],
  )
})

test('quest type filters use KC3 quest categories and support multi-select', () => {
  const quests = [
    { id: 1, code: 'A10' },
    { id: 2, code: 'Bq1', mapIds: ['2-4'] },
    { id: 3, code: 'Cm1' },
    { id: 4, code: 'Dy5' },
    { id: 5, code: 'E1' },
    { id: 6, code: 'F90' },
    { id: 7, code: 'G7' },
    { id: 8, code: 'Z1' },
  ]
  const result = {
    recommendations: quests,
    groups: quests.map((quest) => ({ id: `quest:${quest.id}`, kind: 'single', quests: [quest] })),
  }
  const idsFor = (view) =>
    view.groups.flatMap(({ quests: groupQuests }) => groupQuests.map(({ id }) => id))

  assert.deepEqual(quests.map(questTypeFor), [
    'fleet',
    'sortie',
    'exercise',
    'expedition',
    'supplyDock',
    'arsenal',
    'modernization',
    'other',
  ])
  assert.deepEqual(
    idsFor(filterAndSortQuestRecommendationGroups(result, { typeFilters: [] })),
    [1, 3, 4, 5, 6, 7, 8, 2],
  )
  assert.deepEqual(
    idsFor(
      filterAndSortQuestRecommendationGroups(result, {
        typeFilters: ['exercise', 'expedition'],
      }),
    ),
    [3, 4],
  )
  assert.deepEqual(
    idsFor(filterAndSortQuestRecommendationGroups(result, { typeFilters: ['sortie'] })),
    [2],
  )

  const filteredCombination = filterAndSortQuestRecommendationGroups(
    {
      recommendations: quests,
      groups: [
        {
          id: 'mixed-type-combination',
          kind: 'combined',
          quests: [quests[2], quests[3]],
          synergy: { id: 'mixed-type-combination' },
        },
      ],
    },
    { typeFilters: ['exercise'] },
  )
  assert.equal(filteredCombination.groups[0].kind, 'single')
  assert.equal(filteredCombination.groups[0].synergy, null)

  const controls = questMarkup(translator('en'))
  assert.equal((controls.match(/data-quest-type=/g) || []).length, QUEST_TYPE_FILTERS.length + 1)
  assert.match(controls, /data-quest-type="all"[^>]*aria-pressed="true"/)
  assert.match(controls, /data-quest-type="exercise"[^>]*aria-pressed="false"/)
  assert.doesNotMatch(controls, /data-quest-type="supplyDock"/)
  assert.match(
    controls,
    /<select class="dqr-sort">\s*<option value="deadlineAsc">.*?<option value="deadlineDesc">.*?<option value="priorityDesc">.*?<option value="stepsAsc">/s,
  )
})

test('quest type filter diagnostics report shown and empty outcomes', () => {
  const events = []
  const logger = {
    info: (prefix, details) => events.push({ level: 'info', prefix, details }),
    warn: (prefix, details) => events.push({ level: 'warn', prefix, details }),
  }

  const shown = logQuestTypeFilterChange(
    { typeFilters: ['exercise'] },
    { visibleQuestCount: 3, groups: [{}, {}] },
    logger,
  )
  const empty = logQuestTypeFilterChange(
    { typeFilters: ['expedition'] },
    { visibleQuestCount: 0, groups: [] },
    logger,
  )

  assert.deepEqual(
    events.map(({ level, prefix }) => ({ level, prefix })),
    [
      { level: 'info', prefix: '[KancolleQuestFilter]' },
      { level: 'warn', prefix: '[KancolleQuestFilter]' },
    ],
  )
  assert.equal(shown.outcome, 'shown')
  assert.equal(shown.groupCount, 2)
  assert.equal(empty.outcome, 'empty')
  assert.equal(empty.reasonCode, 'NO_VISIBLE_QUESTS')
})

const storedQuestRecommendationSettings = {
  version: 1,
  chapterFilters: ['world2', 'world5'],
  typeFilters: ['sortie', 'expedition'],
  rewardFilters: ['medalBlueprint', 'screws'],
  sortMode: 'priorityDesc',
}

test('quest recommendation settings round-trip through local storage with diagnostics', () => {
  const entries = new Map()
  const events = []
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  }
  const logger = {
    info: (prefix, details) => events.push({ level: 'info', prefix, ...details }),
    warn: (prefix, details) => events.push({ level: 'warn', prefix, ...details }),
  }

  assert.equal(
    writeQuestRecommendationSettings(storedQuestRecommendationSettings, storage, logger),
    true,
  )
  assert.deepEqual(
    readQuestRecommendationSettings(storage, logger),
    storedQuestRecommendationSettings,
  )
  assert.equal(entries.has(QUEST_RECOMMENDATION_SETTINGS_STORAGE_KEY), true)
  assert.deepEqual(
    events.map(
      ({ event, outcome, chapterFilterCount, typeFilterCount, rewardFilterCount, sortMode }) => ({
        event,
        outcome,
        chapterFilterCount,
        typeFilterCount,
        rewardFilterCount,
        sortMode,
      }),
    ),
    [
      {
        event: 'quest-recommendation-settings-write',
        outcome: 'saved',
        chapterFilterCount: 2,
        typeFilterCount: 2,
        rewardFilterCount: 2,
        sortMode: 'priorityDesc',
      },
      {
        event: 'quest-recommendation-settings-read',
        outcome: 'restored',
        chapterFilterCount: 2,
        typeFilterCount: 2,
        rewardFilterCount: 2,
        sortMode: 'priorityDesc',
      },
    ],
  )
})

test('quest recommendation settings reject damaged data and report storage failures', () => {
  const events = []
  const logger = {
    info: () => {},
    warn: (prefix, details) => events.push({ prefix, ...details }),
  }

  assert.equal(readQuestRecommendationSettings({ getItem: () => '{damaged' }, logger), null)
  assert.equal(
    readQuestRecommendationSettings(
      {
        getItem: () =>
          JSON.stringify({ ...storedQuestRecommendationSettings, typeFilters: ['unknown'] }),
      },
      logger,
    ),
    null,
  )
  assert.equal(
    writeQuestRecommendationSettings(
      storedQuestRecommendationSettings,
      {
        setItem: () => {
          throw new Error('quota exceeded')
        },
      },
      logger,
    ),
    false,
  )
  assert.deepEqual(
    events.map(({ event, outcome, reasonCode }) => ({ event, outcome, reasonCode })),
    [
      {
        event: 'quest-recommendation-settings-read',
        outcome: 'defaults',
        reasonCode: 'SETTINGS_PARSE_FAILED',
      },
      {
        event: 'quest-recommendation-settings-read',
        outcome: 'defaults',
        reasonCode: 'SETTINGS_INVALID',
      },
      {
        event: 'quest-recommendation-settings-write',
        outcome: 'failed',
        reasonCode: 'STORAGE_WRITE_FAILED',
      },
    ],
  )
})

test('quest recommendations explain verified 1-5 quest and EO combinations', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const result = rankQuestRecommendations(
    [
      {
        id: 265,
        code: 'Bm5',
        name: 'Monthly 1-5',
        period: 'monthly',
        status: 2,
        resetAt: now + 7 * 24 * 60 * 60 * 1000,
        memo: 'Rewards 3 Screws.',
        rewardConsumables: [0, 0, 0, 3],
      },
      {
        id: 893,
        code: 'Bq8',
        name: 'Quarterly 1-5',
        period: 'quarterly',
        status: 1,
        resetAt: now + 31 * 24 * 60 * 60 * 1000,
      },
      {
        id: 261,
        code: 'Bw10',
        name: 'Weekly 1-5',
        period: 'weekly',
        status: 2,
        resetAt: now + 5 * 24 * 60 * 60 * 1000,
      },
      {
        id: 228,
        code: 'Bw5',
        name: 'Weekly submarines',
        period: 'weekly',
        status: 1,
        resetAt: now + 5 * 24 * 60 * 60 * 1000,
      },
    ],
    { now, extraOperationStatus: { '1-5': 'available' } },
  )

  const monthly = result.recommendations.find(({ id }) => id === 265)
  assert.equal(monthly.synergies[0].id, 'one-five-monthly-stack')
  assert.deepEqual(monthly.synergies[0].relationKinds, ['sameSortie'])
  assert.deepEqual(monthly.synergies[0].mapIds, ['1-5'])
  assert.deepEqual(monthly.synergies[0].extraObjectiveKeys, ['oneFiveExtraOperation'])
  assert.deepEqual(monthly.synergies[0].stages[0].instructionKeys, [
    'oneFiveThreeBosses',
    'oneFiveFourBosses',
    'oneFiveFifteenSubmarines',
    'oneFiveTenBosses',
  ])
  assert.deepEqual(
    monthly.synergies[0].companions.map(({ id }) => id),
    [893, 261, 228],
  )
  assert.equal('memo' in monthly, false)
  assert.equal('rewardConsumables' in monthly, false)
  assert.equal(result.groupCount, 1)
  assert.equal(result.combinedGroupCount, 1)
  assert.equal(result.groups[0].kind, 'combined')
  assert.deepEqual(
    result.groups.flatMap(({ quests }) => quests.map(({ id }) => id)).sort((a, b) => a - b),
    [228, 261, 265, 893],
  )

  const completedExtraOperation = rankQuestRecommendations(
    [{ id: 265, period: 'monthly', status: 2, resetAt: now + 7 * 24 * 60 * 60 * 1000 }],
    { now, extraOperationStatus: { '1-5': 'cleared' } },
  )
  assert.deepEqual(completedExtraOperation.recommendations[0].synergies, [])
})

test('quest recommendations group verified exercise, expedition, and arsenal shared actions', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 7 * 24 * 60 * 60 * 1000
  const quest = (id, code, period = 'weekly') => ({
    id,
    code,
    name: `Quest ${id}`,
    period,
    status: 1,
    resetAt,
  })

  const exercise = rankQuestRecommendations(
    [
      quest(302, 'Cw1'),
      quest(303, 'Cd1', 'daily'),
      quest(304, 'Cd2', 'daily'),
      quest(337, 'Cq2', 'quarterly'),
    ],
    { now },
  )
  assert.equal(exercise.groupCount, 1)
  assert.deepEqual(exercise.groups[0].synergy.relationKinds, ['sameExercise'])
  assert.deepEqual(
    exercise.groups[0].quests.map(({ id }) => id).sort((left, right) => left - right),
    [302, 303, 304, 337],
  )

  const expedition = rankQuestRecommendations(
    [
      quest(402, 'Dd1', 'daily'),
      quest(403, 'Dd2', 'daily'),
      quest(424, 'Dm1', 'monthly'),
      quest(426, 'Dq1', 'quarterly'),
    ],
    { now },
  )
  assert.equal(expedition.groupCount, 1)
  assert.deepEqual(expedition.groups[0].synergy.relationKinds, ['sameExpedition'])
  assert.deepEqual(
    expedition.groups[0].quests.map(({ id }) => id).sort((left, right) => left - right),
    [402, 403, 424, 426],
  )

  const arsenal = rankQuestRecommendations(
    [
      quest(638, 'Fw2'),
      quest(674, 'Fd8', 'daily'),
      quest(675, 'Fq4', 'quarterly'),
      quest(680, 'Fq6', 'quarterly'),
    ],
    { now },
  )
  assert.equal(arsenal.groupCount, 1)
  assert.deepEqual(arsenal.groups[0].synergy.relationKinds, ['sameArsenal'])
  assert.deepEqual(
    arsenal.groups[0].quests.map(({ id }) => id).sort((left, right) => left - right),
    [638, 674, 675, 680],
  )

  const markup = questRecommendationListMarkup(arsenal)
  assert.match(markup, /Same arsenal action/)
  assert.match(markup, /one action advances them together/)
})

test('quest recommendations derive unprofiled arsenal discard categories without using prepared equipment', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 90 * 24 * 60 * 60 * 1000
  const quest = (id, code, synergyDescription, period = 'oneTime') => ({
    id,
    code,
    name: `Quest ${id}`,
    synergyDescription,
    description: 'Localized quest requirement',
    period,
    status: 1,
    resetAt,
  })

  const knownQuests = rankQuestRecommendations(
    [
      quest(653, 'F90', '', 'quarterly'),
      quest(657, 'F92', '「小口径主砲」x6、「中口径主砲」x5、「魚雷」x4を廃棄する。', 'yearly'),
      quest(676, 'F68', '「中口径主砲」x3、「副砲」x3を廃棄する。', 'weekly'),
      quest(
        1114,
        'F108',
        '「小口径主砲」「中口径主砲」「副砲」各x3を廃棄、' + '「35.6cm連装砲」x3を準備せよ！',
      ),
    ],
    { now },
  )

  assert.equal(knownQuests.groupCount, 1)
  assert.equal(knownQuests.combinedGroupCount, 1)
  assert.equal(knownQuests.groups[0].synergy.id, 'shared-arsenal-item-4-653-657-676-1114')
  assert.deepEqual(
    knownQuests.groups[0].quests.map(({ id }) => id).sort((left, right) => left - right),
    [653, 657, 676, 1114],
  )
  assert.equal(knownQuests.arsenalProfiledQuestCount, 4)
  assert.equal(knownQuests.derivedArsenalProfileCount, 3)
  assert.equal(knownQuests.derivedOnlyArsenalProfileCount, 1)
  assert.equal('synergyDescription' in knownQuests.recommendations[0], false)

  const futureQuests = rankQuestRecommendations(
    [
      quest(9001, 'Ffuture1', '「小口径主砲」x3を廃棄、「中口径主砲」x3を準備せよ！'),
      quest(9002, 'Ffuture2', '「小口径主砲」x4を廃棄せよ！'),
      quest(9003, 'Ffuture3', '「中口径主砲」x4を廃棄せよ！'),
    ],
    { now },
  )

  assert.deepEqual(
    futureQuests.groups.map(({ quests }) => quests.map(({ id }) => id)),
    [[9001, 9002], [9003]],
  )
  assert.equal(futureQuests.derivedOnlyArsenalProfileCount, 3)

  const preparedBeforeDiscard = rankQuestRecommendations(
    [
      quest(9010, 'Ffuture10', '「中口径主砲」x3を廃棄せよ！'),
      quest(9011, 'Ffuture11', '「中口径主砲」x3を準備し、「12.7cm連装砲」x3を廃棄せよ！'),
    ],
    { now },
  )

  assert.equal(preparedBeforeDiscard.groupCount, 2)
  assert.equal(preparedBeforeDiscard.combinedGroupCount, 0)
  assert.equal(preparedBeforeDiscard.derivedOnlyArsenalProfileCount, 1)
})

test('quest recommendations derive shared arsenal actions when discard lists follow the verb', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const quest = (id, code, synergyDescription) => ({
    id,
    code,
    name: code,
    synergyDescription,
    description: synergyDescription,
    period: 'oneTime',
    status: 1,
    resetAt: null,
  })
  const result = rankQuestRecommendations(
    [
      quest(
        9101,
        'F119',
        '廢棄小口徑主砲×18、中口徑主砲×12、暴雷系裝備×6。' +
          '準備應急修理要員×1、彈藥2500、鋼材3000。',
      ),
      quest(
        9102,
        'F131',
        '【工廠任務】廢棄「水上偵察機」x14、「中口徑主砲」x12、' +
          '「艦上爆擊機」x10。準備開發資材x36、「零式艦戰21型」x8。',
      ),
    ],
    { now },
  )

  assert.equal(result.groupCount, 1)
  assert.equal(result.combinedGroupCount, 1)
  assert.equal(result.groups[0].synergy.id, 'shared-arsenal-type-2-9101-9102')
  assert.deepEqual(
    result.groups[0].quests.map(({ code }) => code),
    ['F119', 'F131'],
  )
  assert.equal(result.derivedOnlyArsenalProfileCount, 2)
})

test('quest recommendations derive compatible restricted exercise stacks from fleet rules', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 30 * 24 * 60 * 60 * 1000
  const quest = (id, code) => ({
    id,
    code,
    name: code,
    period: 'quarterly',
    status: 1,
    resetAt,
  })

  const result = rankQuestRecommendations(
    [
      quest(2001, 'Cq1'),
      quest(2002, 'Cy6'),
      quest(2003, 'Cw1'),
      quest(2004, 'Cd2'),
      quest(2005, 'Cm1'),
    ],
    { now },
  )

  assert.equal(result.groupCount, 1)
  assert.equal(result.objectiveDerivedGroupCount, 1)
  assert.equal(result.objectiveProfiledQuestCount, 5)
  assert.match(result.groups[0].synergy.id, /^objective-exercise-/)
  assert.deepEqual(result.groups[0].synergy.relationKinds, ['sameExercise'])
  assert.deepEqual(
    result.groups[0].quests.map(({ id }) => id).sort((left, right) => left - right),
    [2001, 2002, 2003, 2004, 2005],
  )

  const incompatible = rankQuestRecommendations([quest(2010, 'C22'), quest(2011, 'C70')], {
    now,
  })
  assert.equal(incompatible.groupCount, 2)
  assert.equal(incompatible.combinedGroupCount, 0)
})

test('quest recommendations derive five-quest sortie stacks from maps and fleet rules', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const quest = (id, code) => ({
    id,
    code,
    name: code,
    description: 'S-rank the 1-3 boss.',
    period: 'quarterly',
    status: 1,
    resetAt: now + 30 * 24 * 60 * 60 * 1000,
  })
  const result = rankQuestRecommendations(
    [
      quest(2101, 'B202'),
      quest(2102, 'Bq9'),
      quest(2103, 'By6'),
      quest(2104, 'B171'),
      quest(2105, 'B191'),
    ],
    { now },
  )

  assert.equal(result.groupCount, 1)
  assert.equal(result.objectiveDerivedGroupCount, 1)
  assert.match(result.groups[0].synergy.id, /^objective-sortie-/)
  assert.deepEqual(result.groups[0].synergy.mapIds, ['1-3'])
  assert.deepEqual(result.groups[0].synergy.relationKinds, ['sameSortie'])
  assert.deepEqual(
    result.groups[0].quests.map(({ id }) => id).sort((left, right) => left - right),
    [2101, 2102, 2103, 2104, 2105],
  )
})

test('quest recommendations show overlapping map intersections as alternative plans', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const quest = (id, code, maps) => ({
    id,
    code,
    name: code,
    description: `A-rank ${maps.join(', ')}.`,
    mapIds: maps,
    period: 'oneTime',
    status: 1,
    resetAt: null,
  })
  const result = rankQuestRecommendations(
    [
      quest(2151, 'B162', ['1-3', '2-3', '3-3']),
      quest(2152, 'Bw7', ['3-2', '3-3', '3-4']),
      quest(2153, 'Bq8', ['1-3', '1-4', '1-5']),
    ],
    { now },
  )

  assert.deepEqual(
    result.groups.map(({ quests }) => quests.map(({ code }) => code)),
    [['B162', 'Bw7'], ['Bq8']],
  )
  assert.equal(result.alternativeSynergyCount, 1)
  assert.deepEqual(result.groups[0].synergy.mapIds, ['3-3'])
  const alternative = result.recommendations
    .find(({ code }) => code === 'Bq8')
    .synergies.find(({ id }) => id !== result.groups[0].synergy.id)
  assert.deepEqual(alternative.mapIds, ['1-3'])
  assert.deepEqual(
    alternative.companions.map(({ code }) => code),
    ['B162'],
  )

  const markup = questRecommendationListMarkup(result)
  assert.equal((markup.match(/class="dqr-quest-node"/g) || []).length, 3)
  assert.equal((markup.match(/class="dqr-synergy-alternatives"/g) || []).length, 1)
  assert.match(markup, /Alternative co-completion plan/)
  assert.match(markup, /Shared maps: 1-3/)
  assert.match(markup, /Shared maps: 3-3/)

  const markdown = questRecommendationMarkdown({
    result,
    viewState: {
      chapterFilters: QUEST_MAP_CHAPTER_KEYS,
      typeFilters: [],
      rewardFilters: [],
      sortMode: 'deadlineAsc',
    },
    exportedAt: '2026-09-01T00:00:00.000Z',
  })
  assert.match(markdown, /Alternative co-completion plan/)
  assert.match(markdown, /Choose this instead/)
})

test('quest recommendations derive compatible 3-1 alternatives for the open northern quests', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const quest = (id, code, description, period = 'oneTime') => ({
    id,
    code,
    name: code,
    description,
    period,
    status: 1,
    resetAt: period === 'oneTime' ? null : now + 90 * 24 * 60 * 60 * 1000,
  })
  const result = rankQuestRecommendations(
    [
      quest(2201, 'By11', 'A-rank 3-1, 3-3, 4-3, and 7-3-2.', 'yearly'),
      quest(2202, 'B37', 'S-rank the 3-1 boss.'),
      quest(2203, 'B21', 'B-rank the 3-1 boss.'),
      quest(2204, 'Bq5', 'A-rank the 3-1, 3-2, and 3-3 bosses.', 'quarterly'),
      quest(2205, 'B162', 'A-rank the 3-1, 3-2, 3-3, 3-4, and 3-5 bosses.'),
    ],
    { now },
  )
  const objectiveCompanionCodes = (code) => {
    const recommendation = result.recommendations.find((questEntry) => questEntry.code === code)
    const synergy = recommendation.synergies.find((entry) => entry.id.startsWith('objective-'))
    return synergy.companions.map(({ code: companionCode }) => companionCode).sort()
  }

  assert.equal(result.objectiveProfiledQuestCount, 5)
  assert.deepEqual(objectiveCompanionCodes('By11'), ['B162', 'Bq5'])
  assert.deepEqual(objectiveCompanionCodes('B37'), ['B162', 'Bq5'])
  assert.deepEqual(objectiveCompanionCodes('B21'), ['B162', 'Bq5'])
  assert.deepEqual(
    result.groups.map(({ quests }) => quests.map(({ code }) => code)),
    [['By11', 'Bq5', 'B162'], ['B37'], ['B21']],
  )
})

test('quest recommendation cards balance requirements, icon rewards, and schedule', () => {
  const recommendations = [
    {
      id: 249,
      code: 'Bm1',
      name: '<Monthly fixture>',
      description: '<script>unsafe()</script>',
      status: 2,
      period: 'monthly',
      resetAt: '2026-10-01T05:00:00+09:00',
      remainingMs: 2 * 24 * 60 * 60 * 1000,
      mapIds: ['1-5'],
      reward: {
        category: 'medalBlueprint',
        hasBlueprint: false,
        hasMedal: true,
        hasActionReport: false,
        hasScrews: true,
        screwCount: 2,
      },
      synergies: [
        {
          id: 'one-five-monthly-stack',
          mapIds: ['1-5'],
          fleetKey: 'fourDe',
          extraObjectiveKeys: ['oneFiveExtraOperation'],
          instructionKeys: ['oneFiveFifteenSubmarines'],
          companions: [{ id: 228, code: 'Bw5', name: '<Weekly submarines>', status: 2 }],
        },
      ],
    },
    {
      id: 500,
      code: 'B100',
      name: 'One-time prerequisite',
      description: 'Complete once.',
      status: 1,
      period: 'oneTime',
      resetAt: null,
      remainingMs: null,
      mapIds: ['1-5'],
      reward: { category: 'other' },
      downstreamTargets: [
        {
          id: 875,
          code: 'Bq6',
          name: 'Action Report successor',
          depth: 2,
          reward: {
            category: 'actionReport',
            hasActionReport: true,
            isChoiceReward: true,
          },
        },
      ],
      synergies: [],
    },
  ]
  const markup = questRecommendationListMarkup({
    recommendations,
    groups: [
      {
        id: 'fixture-combined-group',
        kind: 'combined',
        quests: recommendations,
        synergy: recommendations[0].synergies[0],
      },
    ],
  })

  assert.match(markup, /class="dqr-list"/)
  assert.match(markup, /class="dqr-list-entry combined"/)
  assert.doesNotMatch(markup, /dqr-flow/)
  assert.match(markup, /class="dqr-card-grid"/)
  assert.match(markup, /class="dqr-card-cell requirement"/)
  assert.match(markup, /class="dqr-card-cell reward"/)
  assert.match(markup, /class="dqr-card-cell schedule"/)
  assert.match(markup, /class="dqr-rewards medalBlueprint"/)
  assert.match(markup, /class="dqr-reward medalBlueprint medal"/)
  assert.match(markup, /assets\/img\/client\/medal\.png/)
  assert.match(markup, /assets\/img\/client\/screws\.png/)
  assert.match(markup, />Medal</)
  assert.match(markup, /Suggested combination/)
  assert.match(markup, /Highest priority/)
  assert.match(markup, /4 Coastal Defense Ships/)
  assert.match(markup, /&lt;Weekly submarines&gt;/)
  assert.match(markup, /&lt;Monthly fixture&gt;/)
  assert.match(markup, />One-time</)
  assert.match(markup, /No fixed reset deadline/)
  assert.match(markup, /Valuable locked successors/)
  assert.match(markup, /Action Report successor/)
  assert.match(markup, /2 steps away/)
  assert.doesNotMatch(markup, /<script>/)
})

const questMarkdownFixture = () => {
  const monthly = {
    id: 249,
    code: 'Bm1',
    name: 'Quest *alpha*',
    description: 'Win three exercises with the required fleet.',
    status: 2,
    period: 'monthly',
    resetAt: '2026-10-01T05:00:00+09:00',
    remainingMs: 2 * 24 * 60 * 60 * 1000,
    mapIds: ['1-5'],
    reward: { category: 'medalBlueprint', hasMedal: true },
    guidance: { tier: 'highest', reasonKeys: ['downstreamValue'] },
    downstreamTargets: [
      {
        id: 875,
        code: 'Bq6',
        name: 'Locked successor',
        depth: 2,
        reward: { category: 'actionReport', hasActionReport: true },
      },
    ],
  }
  const weekly = {
    id: 228,
    code: 'Bw5',
    name: 'Weekly submarines',
    description: 'Defeat 15 submarines.',
    status: 1,
    period: 'weekly',
    resetAt: '2026-09-08T05:00:00+09:00',
    remainingMs: 24 * 60 * 60 * 1000,
    mapIds: ['1-5'],
    reward: { category: 'screws', hasScrews: true, screwCount: 2 },
  }
  const hidden = {
    id: 999,
    code: 'B2',
    name: 'World two hidden fixture',
    description: 'Clear 2-1.',
    status: 1,
    period: 'oneTime',
    resetAt: null,
    remainingMs: null,
    mapIds: ['2-1'],
    reward: { category: 'other' },
  }
  const synergy = {
    relationKinds: ['sameSortie'],
    stages: [
      {
        kind: 'sameSortie',
        mapIds: ['1-5'],
        fleetKey: 'fourDe',
        participants: [
          { id: monthly.id, code: monthly.code, name: monthly.name, locked: false },
          { id: weekly.id, code: weekly.code, name: weekly.name, locked: false },
        ],
        extraObjectiveKeys: ['oneFiveExtraOperation'],
        instructionKeys: ['oneFiveFifteenSubmarines'],
      },
    ],
  }
  return {
    result: {
      status: 'success',
      generatedAt: '2026-09-01T08:37:26.000Z',
      candidateCount: 3,
      groupCount: 2,
      dailyCount: 0,
      weeklyCount: 1,
      monthlyCount: 1,
      quarterlyCount: 0,
      yearlyCount: 0,
      oneTimeCount: 1,
      downstreamValueQuestCount: 1,
      availableExtraOperationCount: 1,
      unavailableQuestCount: 0,
      recommendations: [monthly, weekly, hidden],
      extraOperations: [{ mapId: '1-5', status: 'available' }],
      groups: [
        {
          id: 'one-five-combined',
          kind: 'combined',
          quests: [monthly, weekly],
          synergy,
        },
        { id: 'world-two', kind: 'single', quests: [hidden], synergy: null },
      ],
    },
    viewState: {
      chapterFilters: ['world1'],
      typeFilters: [],
      rewardFilters: [],
      sortMode: 'deadlineDesc',
    },
    exportedAt: '2026-09-01T09:00:00.000Z',
  }
}

test('quest Markdown exports the visible list with complete card and combination details', () => {
  const markdown = questRecommendationMarkdown(questMarkdownFixture())

  assert.match(markdown, /^# Quest Recommendations/m)
  assert.match(markdown, /## Applied filters/)
  assert.match(markdown, /Chapter 1/)
  assert.match(markdown, /Quest types:\*\* All/)
  assert.match(markdown, /Deadline far → near/)
  assert.match(markdown, /Showing 2/)
  assert.match(markdown, /Monthly EO Medal route/)
  assert.match(markdown, /Suggested combination/)
  assert.match(markdown, /Quest \\[*]alpha\\[*]/)
  assert.match(markdown, /Win three exercises with the required fleet\./)
  assert.match(markdown, /Medal/)
  assert.match(markdown, /Locked successor/)
  assert.match(markdown, /Action Report/)
  assert.match(markdown, /Weekly submarines/)
  assert.match(markdown, /Improvement Materials ×2/)
  assert.match(markdown, /Same sortie/)
  assert.match(markdown, /4 Coastal Defense Ships/)
  assert.match(markdown, /Defeat 15 submarines/)
  assert.doesNotMatch(markdown, /World two hidden fixture/)
})

test('quest Markdown download reports bounded success and failure diagnostics', () => {
  const events = []
  const links = []
  const logger = {
    info: (prefix, details) => events.push({ prefix, ...details }),
    warn: (prefix, details) => events.push({ prefix, ...details }),
  }
  const urlObject = {
    createObjectURL: () => 'blob:fixture',
    revokeObjectURL: (value) => events.push({ outcome: 'revoked', value }),
  }
  const documentObject = {
    body: { appendChild: (link) => links.push(link) },
    createElement: () => ({ click() {}, remove() {} }),
  }

  assert.equal(
    downloadQuestRecommendationMarkdown(questMarkdownFixture(), {
      documentObject,
      urlObject,
      logger,
    }),
    true,
  )
  assert.equal(links[0].download, 'kancolle-quests-2026-09-01.md')
  assert.deepEqual(
    events
      .filter(({ outcome }) => outcome !== 'revoked')
      .map(({ event, outcome, visibleQuestCount, groupCount, sortMode }) => ({
        event,
        outcome,
        visibleQuestCount,
        groupCount,
        sortMode,
      })),
    [
      {
        event: 'quest-recommendation-markdown-export',
        outcome: 'downloaded',
        visibleQuestCount: 2,
        groupCount: 1,
        sortMode: 'deadlineDesc',
      },
    ],
  )

  assert.equal(
    downloadQuestRecommendationMarkdown(questMarkdownFixture(), {
      documentObject: {
        createElement: () => {
          throw new Error('blocked')
        },
      },
      urlObject,
      logger,
    }),
    false,
  )
  assert.equal(events.at(-2).outcome, 'failed')
  assert.equal(events.at(-2).reasonCode, 'MARKDOWN_DOWNLOAD_FAILED')
  assert.equal(events.at(-2).error, 'blocked')
})

test('quest reward filters include valuable successors and keep groups sortable', () => {
  const day = 24 * 60 * 60 * 1000
  const quests = [
    {
      id: 1,
      resetAt: day,
      reward: { category: 'medalBlueprint', valuable: true },
    },
    {
      id: 2,
      resetAt: 10 * day,
      reward: { category: 'actionReport', valuable: true },
    },
    {
      id: 3,
      resetAt: 5 * day,
      reward: { category: 'screws', valuable: true },
    },
    {
      id: 4,
      resetAt: null,
      reward: { category: 'other', valuable: false },
    },
    {
      id: 5,
      resetAt: 2 * day,
      reward: { category: 'other', valuable: false },
      downstreamTargets: [
        {
          depth: 3,
          reward: { category: 'medalBlueprint', valuable: true },
        },
      ],
    },
  ]
  const result = {
    recommendations: quests,
    groups: quests.map((quest) => ({ id: `quest:${quest.id}`, kind: 'single', quests: [quest] })),
  }
  const idsFor = (view) =>
    view.groups.flatMap(({ quests: groupQuests }) => groupQuests.map(({ id }) => id))

  assert.deepEqual(idsFor(filterAndSortQuestRecommendationGroups(result)), [1, 5, 3, 2, 4])
  const medalView = filterAndSortQuestRecommendationGroups(result, {
    rewardFilters: ['medalBlueprint'],
  })
  assert.equal(medalView.visibleQuestCount, 2)
  assert.deepEqual(idsFor(medalView), [1, 5])
  assert.deepEqual(
    idsFor(
      filterAndSortQuestRecommendationGroups(result, {
        rewardFilters: ['actionReport', 'screws'],
      }),
    ),
    [3, 2],
  )
  assert.deepEqual(
    idsFor(
      filterAndSortQuestRecommendationGroups(result, {
        rewardFilters: ['equipmentMaterials'],
      }),
    ),
    [5, 4],
  )
  assert.deepEqual(
    idsFor(filterAndSortQuestRecommendationGroups(result, { sortMode: 'deadlineDesc' })),
    [2, 3, 5, 1, 4],
  )
  assert.deepEqual(
    idsFor(filterAndSortQuestRecommendationGroups(result, { sortMode: 'priorityDesc' })),
    [1, 2, 3, 5, 4],
  )
  assert.deepEqual(
    idsFor(
      filterAndSortQuestRecommendationGroups(result, {
        rewardFilters: ['medalBlueprint'],
        sortMode: 'stepsAsc',
      }),
    ),
    [1, 5],
  )
})

test('quest recommendation sorting follows displayed advice tiers and deadline ties', () => {
  const quest = (id, tier, resetAt) => ({ id, guidance: { tier }, resetAt })
  const groups = [
    {
      id: 'highest-combined',
      kind: 'combined',
      quests: [quest(2, 'unavailable', 20), quest(1, 'highest', 20)],
    },
    { id: 'priority-far', kind: 'single', quests: [quest(3, 'priority', 10)] },
    { id: 'priority-near', kind: 'single', quests: [quest(4, 'priority', 1)] },
    { id: 'recommended', kind: 'single', quests: [quest(5, 'recommended', 2)] },
    { id: 'conditional', kind: 'single', quests: [quest(6, 'conditional', 2)] },
    { id: 'optional', kind: 'single', quests: [quest(7, 'optional', 2)] },
    { id: 'unavailable', kind: 'single', quests: [quest(8, 'unavailable', 2)] },
  ]

  const sorted = filterAndSortQuestRecommendationGroups(
    { recommendations: groups.flatMap(({ quests }) => quests), groups },
    { sortMode: 'priorityDesc' },
  )

  assert.deepEqual(
    sorted.groups.map(({ id }) => id.split(':')[0]),
    [
      'highest-combined',
      'priority-near',
      'priority-far',
      'recommended',
      'conditional',
      'optional',
      'unavailable',
    ],
  )
  assert.deepEqual(
    sorted.groups[0].quests.map(({ id }) => id),
    [1, 2],
  )
})

test('quest plans distinguish same-sortie, sequence, and unlock relationships', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 90 * 24 * 60 * 60 * 1000
  const result = rankQuestRecommendations(
    [
      { id: 822, code: 'Bq1', period: 'quarterly', status: 1, resetAt },
      { id: 854, code: 'Bq2', period: 'quarterly', status: 2, resetAt },
      { id: 861, code: 'Bq3', period: 'quarterly', status: 1, resetAt },
      { id: 862, code: 'Bq4', period: 'quarterly', status: 0, resetAt, locked: true },
    ],
    { now },
  )

  const plan = result.recommendations.find(({ id }) => id === 822).synergies[0]
  assert.equal(plan.id, 'z-front-quarterly-chain')
  assert.deepEqual(plan.relationKinds, ['sameSortie', 'unlock'])
  assert.deepEqual(
    plan.stages.map(({ kind, mapIds }) => ({ kind, mapIds })),
    [
      { kind: 'sameSortie', mapIds: ['2-4'] },
      { kind: 'unlock', mapIds: ['1-6', '6-3'] },
    ],
  )
  assert.equal(plan.stages[1].participants[1].locked, true)
  const markup = questRecommendationListMarkup(result)
  assert.match(markup, /dqr-relation sameSortie/)
  assert.match(markup, /dqr-relation unlock/)
  assert.match(markup, /dqr-stage-participants/)
  assert.match(markup, /class="locked"/)

  const monthly = rankQuestRecommendations(
    [
      { id: 249, code: 'Bm1', period: 'monthly', status: 1, resetAt: now + 30_000 },
      { id: 266, code: 'Bm7', period: 'monthly', status: 2, resetAt: now + 30_000 },
    ],
    { now, extraOperationStatus: { '2-5': 'available' } },
  )
  assert.deepEqual(monthly.recommendations[0].synergies[0].relationKinds, ['sequence'])
  assert.deepEqual(monthly.recommendations[0].synergies[0].extraObjectiveKeys, [
    'twoFiveExtraOperation',
  ])

  const waitingForWestern = rankQuestRecommendations(
    [
      { id: 264, code: 'Bm6', period: 'monthly', status: 1, resetAt: now + 30_000 },
      {
        id: 845,
        code: 'Bq12',
        period: 'quarterly',
        status: 0,
        resetAt,
        locked: true,
      },
    ],
    { now },
  )
  assert.deepEqual(waitingForWestern.recommendations[0].synergies, [])

  const weeklyWestern = rankQuestRecommendations(
    [
      { id: 229, code: 'Bw6', period: 'weekly', status: 1, resetAt: now + 20_000 },
      { id: 264, code: 'Bm6', period: 'monthly', status: 1, resetAt: now + 30_000 },
      { id: 845, code: 'Bq12', period: 'quarterly', status: 0, resetAt, locked: true },
    ],
    { now },
  )
  assert.equal(weeklyWestern.groupCount, 1)
  assert.deepEqual(
    weeklyWestern.groups[0].quests.map(({ id }) => id).sort((a, b) => a - b),
    [229, 264],
  )
})

test('daily prerequisites extend into the monthly Bm8 plan', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const result = rankQuestRecommendations(
    [
      { id: 201, code: 'Bd1', period: 'daily', status: 1, resetAt: now + 20 * 60 * 60 * 1000 },
      {
        id: 216,
        code: 'Bd2',
        period: 'daily',
        status: 0,
        resetAt: now + 20 * 60 * 60 * 1000,
        locked: true,
      },
      {
        id: 311,
        code: 'Cm1',
        period: 'monthly',
        status: 0,
        resetAt: now + 30 * 24 * 60 * 60 * 1000,
        locked: true,
      },
      {
        id: 280,
        code: 'Bm8',
        period: 'monthly',
        status: 0,
        resetAt: now + 30 * 24 * 60 * 60 * 1000,
        locked: true,
      },
    ],
    { now },
  )

  const plan = result.recommendations[0].synergies[0]
  assert.equal(plan.id, 'daily-monthly-unlock-chain')
  assert.deepEqual(
    plan.stages.map(({ questIds, instructionKeys }) => ({ questIds, instructionKeys })),
    [
      { questIds: [201, 216], instructionKeys: ['unlockBdOneBdTwo'] },
      { questIds: [216, 311], instructionKeys: ['unlockBdTwoCmOne'] },
      { questIds: [311, 280], instructionKeys: ['unlockCmOneBmEight'] },
    ],
  )
  assert.deepEqual(
    plan.companions.map(({ id, locked }) => ({ id, locked })),
    [
      { id: 216, locked: true },
      { id: 311, locked: true },
      { id: 280, locked: true },
    ],
  )

  const currentMonthly = rankQuestRecommendations(
    [
      {
        id: 311,
        code: 'Cm1',
        name: 'Monthly exercises',
        period: 'monthly',
        status: 1,
        resetAt: now + 30 * 24 * 60 * 60 * 1000,
        unlockIds: [280],
      },
      {
        id: 280,
        code: 'Bm8',
        name: 'Locked successor',
        period: 'monthly',
        status: 0,
        resetAt: now + 30 * 24 * 60 * 60 * 1000,
        rewardConsumables: [0, 0, 0, 2],
      },
    ],
    { now },
  )

  assert.deepEqual(
    currentMonthly.recommendations[0].downstreamTargets.map(({ id }) => id),
    [280],
  )
  assert.equal(currentMonthly.groupCount, 1)
  assert.equal(currentMonthly.combinedGroupCount, 0)
  assert.equal(currentMonthly.groups[0].kind, 'single')
  assert.deepEqual(
    currentMonthly.groups[0].quests.map(({ id }) => id),
    [311],
  )

  const markup = questRecommendationListMarkup(currentMonthly)
  assert.match(markup, /Valuable locked successors/)
  assert.match(markup, /Locked successor/)
  assert.doesNotMatch(markup, /Suggested combination/)
  assert.doesNotMatch(markup, /dqr-synergy-detail/)
})

test('quest guidance accounts for required ships, steel cost, and selectable rewards', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const resetAt = now + 90 * 24 * 60 * 60 * 1000
  const result = rankQuestRecommendations(
    [
      {
        id: 903,
        period: 'quarterly',
        status: 1,
        resetAt,
        memo: '選択報酬：勲章x1、新型砲熕兵装資材x1',
      },
      {
        id: 663,
        period: 'quarterly',
        status: 1,
        resetAt,
        memo: '選択報酬：勲章x1、新型砲熕兵装資材x1',
      },
      {
        id: 875,
        period: 'quarterly',
        status: 1,
        resetAt,
        memo: '選択報酬：戦闘詳報x1、プレゼント箱x1',
      },
    ],
    { now, account: { status: 'available', shipMasterIds: [], steel: 10_000 } },
  )

  const yuubariQuest = result.recommendations.find(({ id }) => id === 903)
  const steelQuest = result.recommendations.find(({ id }) => id === 663)
  const desdivQuest = result.recommendations.find(({ id }) => id === 875)
  assert.equal(yuubariQuest.guidance.tier, 'unavailable')
  assert.equal(yuubariQuest.guidance.reasonKeys.includes('missingShip:yuubariKaiNi'), true)
  assert.equal(steelQuest.guidance.tier, 'unavailable')
  assert.equal(steelQuest.guidance.reasonKeys.includes('insufficientSteel'), true)
  assert.equal(steelQuest.reward.isChoiceReward, true)
  assert.deepEqual(
    desdivQuest.guidance.reasonKeys.filter((key) => key.startsWith('missingShip:')),
    ['missingShip:naganamiKaiNi', 'missingShip:desdivThirtyOnePartner'],
  )
  assert.equal(result.unavailableQuestCount, 3)
})

const storedExpeditionPlannerSettings = {
  version: 1,
  afkMinutes: 485,
  fleetCount: 2,
  preference: {
    mode: 'priority',
    preferences: {
      bucket: { mode: 'constraint', minimumNetYieldPerHour: 0 },
      fuel: { mode: 'optimize', rank: 2 },
      bauxite: { mode: 'ignore' },
      ammo: { mode: 'optimize', rank: 1 },
      steel: { mode: 'constraint', minimumNetYieldPerHour: 0 },
    },
  },
  incomeModifier: { greatSuccess: true, daihatsuCount: 4 },
}

test('expedition planner settings round-trip through local storage with diagnostics', () => {
  const entries = new Map()
  const events = []
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  }
  const logger = {
    info: (prefix, details) => events.push({ level: 'info', prefix, ...details }),
    warn: (prefix, details) => events.push({ level: 'warn', prefix, ...details }),
  }

  assert.equal(
    writeExpeditionPlannerSettings(storedExpeditionPlannerSettings, storage, logger),
    true,
  )
  assert.deepEqual(readExpeditionPlannerSettings(storage, logger), storedExpeditionPlannerSettings)
  assert.equal(entries.has(EXPEDITION_PLANNER_SETTINGS_STORAGE_KEY), true)
  assert.deepEqual(
    events.map(({ event, outcome, fleetCount, optimizedResourceCount }) => ({
      event,
      outcome,
      fleetCount,
      optimizedResourceCount,
    })),
    [
      {
        event: 'expedition-planner-settings-write',
        outcome: 'saved',
        fleetCount: 2,
        optimizedResourceCount: 2,
      },
      {
        event: 'expedition-planner-settings-read',
        outcome: 'restored',
        fleetCount: 2,
        optimizedResourceCount: 2,
      },
    ],
  )
})

test('expedition planner settings reject damaged data and report storage failures', () => {
  const events = []
  const logger = {
    info: () => {},
    warn: (prefix, details) => events.push({ prefix, ...details }),
  }

  assert.equal(readExpeditionPlannerSettings({ getItem: () => '{damaged' }, logger), null)
  assert.equal(
    writeExpeditionPlannerSettings(
      storedExpeditionPlannerSettings,
      {
        setItem: () => {
          throw new Error('quota exceeded')
        },
      },
      logger,
    ),
    false,
  )
  assert.deepEqual(
    events.map(({ event, outcome, reasonCode }) => ({ event, outcome, reasonCode })),
    [
      {
        event: 'expedition-planner-settings-read',
        outcome: 'defaults',
        reasonCode: 'SETTINGS_PARSE_FAILED',
      },
      {
        event: 'expedition-planner-settings-write',
        outcome: 'failed',
        reasonCode: 'STORAGE_WRITE_FAILED',
      },
    ],
  )
})

test('fleet recommender view uses guide selection without an objective control', () => {
  const markup = fleetMarkup(translator('tcn'))
  assert.match(markup, /id="dfr-route-select"/)
  assert.doesNotMatch(markup, /dfr-objective/)
})

test('fleet route descriptions use localized copy with source fallback', () => {
  assert.equal(
    localizedRouteDescription(
      { id: '5-5-south-dd', description: '軽巡1、雷巡1、駆逐4。' },
      translator('tcn'),
    ).startsWith('輕巡1、雷巡1、驅逐4。'),
    true,
  )
  assert.match(
    localizedRouteDescription(
      { id: '4-5-kcwiki-fast-plus-special-attack', description: 'source description' },
      translator('tcn'),
    ),
    /Nelson.*1／3／5.*H 點選複縱陣/,
  )
  assert.equal(
    localizedRouteDescription(
      { id: 'fixture-missing', description: 'source description' },
      translator('tcn'),
    ),
    'source description',
  )
})

test('strategy room styles retain light, dark, selector, and layout contracts', () => {
  const styleSheets = [
    expeditionStyles,
    fleetStyles,
    recentStyles,
    resourceCenterStyles,
    resourceLedgerStyles,
    questStyles,
  ]
  styleSheets.forEach((styles) => {
    assert.match(styles, /body\.dark/)
    assert.match(styles, /body:not\(\.dark\)/)
  })
  assert.match(fleetStyles, /\.dfr-root \{\s*width: 700px;/)
  assert.match(fleetStyles, /\.dfr-button\.is-loading:disabled/)
  assert.match(fleetStyles, /\.dfr-source-list/)
  assert.match(fleetStyles, /@keyframes dfr-route-spin/)
  assert.match(expeditionStyles, /\.dep-root \{ width: 680px;/)
  assert.match(resourceCenterStyles, /\.drc-root \{ width: 700px;/)
  assert.match(questStyles, /\.dqr-root \{[^}]*width: 700px;/)
  const questFontSizes = [
    ...[...questStyles.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1])),
    ...[...questStyles.matchAll(/font:\s*[^;\n]*?\b(\d+)px/g)].map((match) => Number(match[1])),
  ]
  assert.equal(Math.min(...questFontSizes), 12)
  assert.doesNotMatch(questStyles, /\.dqr-list::before/)
  assert.match(questStyles, /\.dqr-card-grid \{[^}]*repeat\(3,/)
  assert.match(questStyles, /\.dqr-controls \{[^}]*grid-template-columns:/)
  assert.match(questStyles, /\.dqr-filter\[data-quest-filter="medalBlueprint"\]/)
  assert.match(questStyles, /\.dqr-filter\[data-quest-chapter\]\.is-active/)
  assert.match(questStyles, /\.dqr-filter\[data-quest-type="exercise"\]/)
  assert.match(questStyles, /\.dqr-toolbar-actions \{[^}]*display: flex/)
  assert.match(questStyles, /\.dqr-toolbar-button:focus-visible/)
  assert.doesNotMatch(questStyles, /\.dqr-chapter-heading/)
  assert.match(questStyles, /\.dqr-reward\.medalBlueprint/)
  assert.match(questStyles, /\.dqr-reward\.actionReport/)
  assert.match(questStyles, /\.dqr-reward\.screws/)
})

test('quest recommendation labels exist in all supported languages', () => {
  Object.values(catalogs).forEach((catalog) => {
    ;[
      'quest.menu',
      'quest.title',
      'quest.weightSummary',
      'quest.controls',
      'quest.exportMarkdown',
      'quest.exported',
      'quest.exportFailed',
      'quest.exportedAt',
      'quest.exportFilters',
      'quest.exportList',
      'quest.exportParticipants',
      'quest.exportNone',
      'quest.synergy.alternativesTitle',
      'quest.synergy.alternativesHint',
      'quest.typeFilter.label',
      'quest.typeFilter.hint',
      'quest.type.all',
      'quest.type.fleet',
      'quest.type.sortie',
      'quest.type.exercise',
      'quest.type.expedition',
      'quest.type.arsenal',
      'quest.type.modernization',
      'quest.type.other',
      'quest.filter.label',
      'quest.filter.all',
      'quest.filter.medalBlueprint',
      'quest.filter.actionReport',
      'quest.filter.screws',
      'quest.filter.equipmentMaterials',
      'quest.filter.visibleCount',
      'quest.filter.emptyTitle',
      'quest.filter.emptyDetail',
      'quest.sort.label',
      'quest.sort.priorityDesc',
      'quest.sort.deadlineAsc',
      'quest.sort.deadlineDesc',
      'quest.sort.stepsAsc',
      'quest.syncLatest',
      'quest.syncingLatest',
      'quest.syncingStatus',
      'quest.syncingDetail',
      'quest.period.daily',
      'quest.period.weekly',
      'quest.period.monthly',
      'quest.period.quarterly',
      'quest.period.yearly',
      'quest.period.oneTime',
      'quest.period.limited',
      'quest.chapterFilter.label',
      'quest.chapterFilter.hint',
      'quest.chapter.world1',
      'quest.chapter.world7',
      'message.KC3_QUEST_SYNC_UNAVAILABLE',
      'quest.card.requirement',
      'quest.card.reward',
      'quest.card.schedule',
      'quest.requirement.unknown',
      'quest.reward.blueprint',
      'quest.reward.medal',
      'quest.reward.actionReport',
      'quest.reward.screws',
      'quest.reward.screwsGeneric',
      'quest.reward.other',
      'quest.downstream.title',
      'quest.downstream.steps',
      'quest.noFixedDeadline',
      'quest.limitedDeadlineUnknown',
      'quest.group.combined',
      'quest.group.questCount',
      'quest.priority.label',
      'quest.priority.highest',
      'quest.priority.priority',
      'quest.priority.recommended',
      'quest.priority.conditional',
      'quest.priority.optional',
      'quest.priority.unavailable',
      'quest.relation.sameSortie',
      'quest.relation.sameExercise',
      'quest.relation.sameExpedition',
      'quest.relation.sameArsenal',
      'quest.relation.sequence',
      'quest.relation.unlock',
      'quest.synergy.title',
      'quest.synergy.extra.oneFiveExtraOperation',
      'quest.synergy.extra.twoFiveExtraOperation',
      'quest.synergy.fleet.fourDe',
      'quest.synergy.fleet.variedByStage',
      'quest.synergy.fleet.sharedExercise',
      'quest.synergy.fleet.sharedExpedition',
      'quest.synergy.fleet.sharedArsenal',
      'quest.synergy.instruction.oneFiveFifteenSubmarines',
      'quest.synergy.instruction.sharedExercise',
      'quest.synergy.instruction.sharedExpedition',
      'quest.synergy.instruction.sharedArsenal',
      'quest.synergy.instruction.unlockBdTwoCmOne',
      'quest.synergy.instruction.northernMedalReportChain',
      'quest.guidance.missingShip',
      'quest.guidance.downstreamValue',
    ].forEach((key) => assert.equal(typeof catalog[key], 'string', key))
  })
})

test('strategy room i18n preserves aliases, fallback, interpolation, and KC3 locale', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = {
    ConfigManager: { keyName: () => 'fixture-config', language: 'en' },
    KC3Translation: { getLocale: (language) => `kc3:${language}` },
    localStorage: { getItem: () => JSON.stringify({ language: 'zh-TW' }) },
  }
  globalThis.document = { documentElement: { lang: 'en' } }
  try {
    assert.equal(getStrategyRoomLanguage(), 'tcn')
    assert.equal(getStrategyRoomLocale(), 'kc3:zh-TW')
    const i18n = createStrategyRoomI18n()
    assert.equal(i18n.t('fixture.unknown-key'), 'fixture.unknown-key')
    assert.equal(i18n.t('common.minimum', { value: 42 }).includes('42'), true)
    assert.equal(
      i18n
        .translateMessage({
          code: 'EXTERNAL_COMBAT_SETUP_REQUIRED',
          values: { tags: 'lbas, smoke-screen' },
        })
        .includes(i18n.t('fleet.tag.lbas')),
      true,
    )
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

test('fleet recommendation labels exist in all supported languages', () => {
  Object.values(catalogs).forEach((catalog) => {
    ;[
      'fleet.baseSpeed',
      'fleet.speedTransition',
      'fleet.fleetSpeed',
      'fleet.speed.slow',
      'fleet.speed.fast',
      'fleet.speed.fast+',
      'fleet.speed.fastest',
      'fleet.sourceCount',
      'fleet.noSources',
      'fleet.strategyGuide',
      'fleet.strategyShips',
      'fleet.strategyEquipment',
      'fleet.strategyNotes',
      'fleet.strategyRoute',
      'fleet.strategySpeed',
      'fleet.strategyAirPower',
      'fleet.strategyLos',
      'fleet.strategyOpeningAsw',
      'fleet.strategyResourceGain',
      'fleet.strategyMinimumValue',
      'fleet.strategyResourceValue',
      'fleet.strategyNoDescription',
      'fleet.routeDescription.4-4-guide-bb-cv2-ca-dd-de',
      'fleet.routeDescription.4-4-bahamut-bb-cv2-cav-dd-de',
      'fleet.routeUnknown',
      'fleet.role.torpedo-cruiser',
      'fleet.noSolutionForRoute',
      'fleet.objective.resource-burner',
      'fleet.manualSetup',
      'message.NO_AUTOMATED_ROUTE',
      'message.NO_STABLE_ROUTE',
      'message.OASW_INSUFFICIENT',
      'message.OASW_REQUIREMENT_PASSED',
      'message.FLAGSHIP_REQUIREMENT_PASSED',
      'message.FLEET_CANDIDATE_SEARCH_EXHAUSTED',
      'message.AIR_POWER_BELOW_RECOMMENDED',
      'message.ZUIUN_MULTI_ANGLE_ATTACK_READY',
      'message.ZUIUN_MULTI_ANGLE_ATTACK_FALLBACK',
      'message.ANTI_INSTALLATION_REQUIREMENT_PASSED',
      'message.ANTI_INSTALLATION_EQUIPMENT_INSUFFICIENT',
      'message.ANTI_INSTALLATION_CARRIER_READY',
      'message.ANTI_INSTALLATION_CARRIER_AIRCRAFT_INSUFFICIENT',
      'message.DRUM_CANISTER_REQUIREMENT_PASSED',
      'message.DRUM_CANISTER_EQUIPMENT_INSUFFICIENT',
      'message.KC3_COMBAT_EVALUATION_APPLIED',
      'message.SPECIAL_ATTACK_READY',
      'message.SPECIAL_ATTACK_SORTIE_CHECK',
      'message.SPECIAL_ATTACK_UNAVAILABLE',
    ].forEach((key) => assert.equal(typeof catalog[key], 'string', key))
  })
})

test('expedition status safeguards exist in all supported languages', () => {
  const keys = [
    'expedition.syncComplete',
    'expedition.candidateUnlockWarning',
    'expedition.state.returned',
    'expedition.state.returnedAction',
    'expedition.perHourAfterDispatch',
    'expedition.supplyAfterReturn',
    'expedition.weightTooltip',
    'expedition.planHourlyTotal',
    'expedition.planHourlyTotalAfterDispatch',
  ]
  ;[en, jp, scn, tcn].forEach((catalog) => {
    keys.forEach((key) => assert.equal(typeof catalog[key], 'string', key))
  })
})

test('daily improvement filter applies once per rendered KC3 toggle button', () => {
  let clickCount = 0
  const button = { click: () => clickCount++ }
  const equipmentList = { querySelector: () => ({}) }
  const root = {
    querySelector: (selector) => (selector.includes('disabled_toggle') ? button : equipmentList),
  }
  const filteredButtons = new WeakSet()

  assert.equal(applyDefaultDailyImprovementFilter(root, filteredButtons), true)
  assert.equal(applyDefaultDailyImprovementFilter(root, filteredButtons), false)
  assert.equal(clickCount, 1)
})

test('daily improvement filter waits for KC3 to render filterable equipment', () => {
  let clickCount = 0
  const root = {
    querySelector: (selector) =>
      selector.includes('disabled_toggle')
        ? { click: () => clickCount++ }
        : { querySelector: () => null },
  }

  assert.equal(applyDefaultDailyImprovementFilter(root), false)
  assert.equal(clickCount, 0)
})

test('daily improvement category filter combines with KC3 row visibility classes', () => {
  const createEquipment = (type) => {
    const classes = new Set(['equipment', 'disabled'])
    return {
      classList: {
        contains: (name) => classes.has(name),
        toggle: (name, active) => (active ? classes.add(name) : classes.delete(name)),
      },
      querySelector: () => ({ dataset: { item_type3: type } }),
    }
  }
  const mainGun = createEquipment('1')
  const torpedo = createEquipment('5')

  applyDailyImprovementCategoryFilter([mainGun, torpedo], '1')

  assert.equal(getDailyImprovementEquipmentType(mainGun), '1')
  assert.equal(mainGun.classList.contains('kca-equipment-category-hidden'), false)
  assert.equal(mainGun.classList.contains('disabled'), true)
  assert.equal(torpedo.classList.contains('kca-equipment-category-hidden'), true)

  applyDailyImprovementCategoryFilter([mainGun, torpedo], 'all')
  assert.equal(torpedo.classList.contains('kca-equipment-category-hidden'), false)
})

test('daily improvement category filter ignores rows without a numeric KC3 icon type', () => {
  const equipment = {
    querySelector: () => ({ dataset: { item_type3: 'unknown' } }),
  }

  assert.equal(getDailyImprovementEquipmentType(equipment), null)
})

test('daily improvement categories only include rows KC3 marks as improvable', () => {
  const createEquipment = (type, unavailable = false) => ({
    matches: () => unavailable,
    querySelector: (selector) =>
      selector === '.eq_name'
        ? { dataset: { item_type3: type }, textContent: `Equipment ${type}` }
        : { getAttribute: () => `/items/${type}.png` },
  })
  const categories = collectDailyImprovementCategories([
    createEquipment('1'),
    createEquipment('5', true),
    createEquipment('1'),
    createEquipment('8', true),
  ])

  assert.equal(isDailyImprovementEquipmentAvailable(createEquipment('5', true)), false)
  assert.deepEqual(categories, [{ type: '1', name: 'Equipment 1', icon: '/items/1.png', count: 2 }])
})
