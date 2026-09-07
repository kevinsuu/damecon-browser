const MASTER_SHIP_MATERIAL_SELECTOR = '.tab_mstship .shipInfo .remodel_blueprint .rsc_icon'

const MATERIAL_LIST_CLASS = 'kca-master-ship-material-list'
const MATERIAL_NAME_CLASS = 'kca-master-ship-material-name'
const TOOLTIP_ATTRIBUTES = ['title', 'titlealt']
const TOOLTIP_IMAGE_PATTERN = /<img\b[^>]*\bsrc=(['"])([^'"]+)\1[^>]*>/gi

const MATERIAL_NAMES = {
  en: {
    58: 'Remodel Blueprints',
    65: 'Prototype Flight Deck Catapult',
    75: 'New Model Artillery Armament Materials',
    77: 'New Model Aviation Armament Materials',
    78: 'Action Report',
    94: 'New Model Armament Materials',
    100: 'Latest Overseas Warship Technology',
    104: 'Arsenal Resource',
    899: 'New Model High Temperature High Pressure Boiler',
    bucket: 'Bucket',
    devmat: 'DevMat',
    screws: 'Screws',
    ibuild: 'Torch',
  },
  jp: {
    58: '改装設計図',
    65: '試製甲板カタパルト',
    75: '新型砲熕兵装資材',
    77: '新型航空兵装資材',
    78: '戦闘詳報',
    94: '新型兵装資材',
    100: '海外艦最新技術',
    104: '工廠資源',
    899: '新型高温高圧缶',
    bucket: '高速修復材',
    devmat: '開発資材',
    screws: '改修資材',
    ibuild: '高速建造材',
  },
  scn: {
    58: '改装设计图',
    65: '试制甲板用弹射器',
    75: '新型火炮兵装资材',
    77: '新型航空兵装资材',
    78: '战斗详报',
    94: '新型兵装资材',
    100: '海外舰最新技术',
    104: '工厂资源',
    899: '新型高温高压锅炉',
    bucket: '高速修复材',
    devmat: '开发资材',
    screws: '改修资材',
    ibuild: '高速建造材',
  },
  tcn: {
    58: '改裝設計圖',
    65: '試製甲板用彈射器',
    75: '新型火炮兵裝資材',
    77: '新型航空兵裝資材',
    78: '戰鬥詳報',
    94: '新型兵裝資材',
    100: '海外艦最新技術',
    104: '工廠資源',
    899: '新型高溫高壓鍋爐',
    bucket: '高速修復材',
    devmat: '開發資材',
    screws: '改修資材',
    ibuild: '高速建造材',
  },
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })

export const getMasterShipMaterialIdentifier = (iconSource) => {
  const source = String(iconSource || '')
  const useItemMatch = source.match(/\/useitems(?:_p\d+)?\/(\d+)\.png(?:[?#]|$)/i)
  if (useItemMatch) return { type: 'useitem', id: Number(useItemMatch[1]) }

  const consumableMatch = source.match(
    /\/assets\/img\/client\/(bucket|devmat|screws|ibuild)\.png(?:[?#]|$)/i,
  )
  if (consumableMatch) return { type: 'consumable', id: consumableMatch[1].toLowerCase() }

  return null
}

export const getMasterShipMaterialLanguage = (language) => {
  const normalized = String(language || '').toLowerCase()
  if (normalized === 'scn' || normalized.startsWith('zh-hans')) return 'scn'
  if (normalized === 'jp' || normalized.startsWith('ja')) return 'jp'
  if (normalized === 'tcn' || normalized.startsWith('zh')) return 'tcn'
  return 'en'
}

export const getMasterShipMaterialName = (iconSource, language) => {
  const identifier = getMasterShipMaterialIdentifier(iconSource)
  if (!identifier) return ''

  const materialName = MATERIAL_NAMES[getMasterShipMaterialLanguage(language)][identifier.id]
  if (materialName) return materialName
  return identifier.type === 'useitem' ? `素材 #${identifier.id}` : '素材'
}

const iconSourcesFromTooltipMarkup = (tooltipMarkup) =>
  Array.from(String(tooltipMarkup || '').matchAll(TOOLTIP_IMAGE_PATTERN), (match) => match[2])

export const describeMasterShipMaterialTooltipMarkup = (tooltipMarkup, language) => {
  const present = typeof tooltipMarkup === 'string' && tooltipMarkup.length > 0
  const icons = iconSourcesFromTooltipMarkup(tooltipMarkup).map((source) => ({
    identifier: getMasterShipMaterialIdentifier(source),
    source,
  }))
  return { iconCount: icons.length, icons, present }
}

export const describeMasterShipMaterialTooltip = (element) => {
  const language = element?.ownerDocument?.documentElement?.lang
  return {
    attributes: TOOLTIP_ATTRIBUTES.map((name) => ({
      name,
      ...describeMasterShipMaterialTooltipMarkup(element?.getAttribute?.(name), language),
    })),
  }
}

export const enrichMasterShipMaterialTooltipMarkup = (tooltipMarkup, language) => {
  const markup = String(tooltipMarkup || '')
  if (!markup || markup.includes(MATERIAL_LIST_CLASS) || markup.includes(MATERIAL_NAME_CLASS)) {
    return markup
  }

  return markup.replace(
    /(<img\b[^>]*\bsrc=(['"])([^'"]+)\2[^>]*>)(\s*)(<span\b[^>]*>.*?<\/span>)/gi,
    (match, image, _quote, source, separator, count) => {
      const name = getMasterShipMaterialName(source, language)
      if (!name) return match
      const nameMarkup = [
        `<span class="${MATERIAL_NAME_CLASS}" style="min-width: 120px;">`,
        escapeHtml(name),
        '</span>',
      ].join('')
      const quantity = escapeHtml(count.replace(/<[^>]*>/g, '').trim())
      return [
        `<div class="${MATERIAL_LIST_CLASS}"`,
        ' style="align-items: center; display: flex; gap: 4px; line-height: 20px; white-space: nowrap;">',
        image,
        nameMarkup,
        `<span>×${quantity}</span>`,
        '</div>',
      ].join('')
    },
  )
}

export const enrichMasterShipMaterialTooltip = (element) => {
  if (!element?.matches?.(MASTER_SHIP_MATERIAL_SELECTOR)) return false

  const language = element.ownerDocument?.documentElement?.lang
  let enriched = false
  let materialCount = 0

  for (const attribute of TOOLTIP_ATTRIBUTES) {
    const tooltipMarkup = element.getAttribute(attribute)
    if (!tooltipMarkup) continue
    const enrichedMarkup = enrichMasterShipMaterialTooltipMarkup(tooltipMarkup, language)
    if (enrichedMarkup === tooltipMarkup) continue

    element.setAttribute(attribute, enrichedMarkup)
    materialCount += (enrichedMarkup.match(new RegExp(MATERIAL_NAME_CLASS, 'g')) || []).length
    enriched = true
  }

  if (enriched) {
    console.debug('[Kancolle Assistant] Enriched master-ship remodel material tooltip', {
      materialCount,
    })
  }
  return enriched
}

export const refreshMasterShipMaterialTooltips = (root = document, reportDiagnostic = () => {}) => {
  const elements = Array.from(root.querySelectorAll?.(MASTER_SHIP_MATERIAL_SELECTOR) || [])
  const tooltips = elements.map((element) => {
    const enriched = enrichMasterShipMaterialTooltip(element)
    return {
      ...describeMasterShipMaterialTooltip(element),
      outcome: enriched ? 'enriched' : 'unchanged',
    }
  })
  reportDiagnostic({
    contentFound: true,
    enrichedCount: tooltips.filter((tooltip) => tooltip.outcome === 'enriched').length,
    outcome: tooltips.length ? 'targets-observed' : 'target-missing',
    phase: 'refresh',
    targetCount: tooltips.length,
    tooltips,
  })
  return tooltips
}

export const injectMasterShipMaterialTooltips = ({ reportDiagnostic = () => {} } = {}) => {
  const startObserving = (content) => {
    let scheduled = false
    const scheduleRefresh = () => {
      if (scheduled) return
      scheduled = true
      window.setTimeout(() => {
        scheduled = false
        refreshMasterShipMaterialTooltips(content.ownerDocument, reportDiagnostic)
      }, 0)
    }

    const observer = new MutationObserver(scheduleRefresh)
    observer.observe(content, {
      attributes: true,
      attributeFilter: TOOLTIP_ATTRIBUTES,
      childList: true,
      subtree: true,
    })
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
    scheduleRefresh()
  }

  const content = document.querySelector('#contentHtml')
  if (content) {
    startObserving(content)
    return
  }

  reportDiagnostic({
    contentFound: false,
    enrichedCount: 0,
    outcome: 'content-root-missing',
    phase: 'inject',
    targetCount: 0,
    tooltips: [],
  })
  const rootObserver = new MutationObserver(() => {
    const content = document.querySelector('#contentHtml')
    if (!content) return
    rootObserver.disconnect()
    startObserving(content)
  })
  rootObserver.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('pagehide', () => rootObserver.disconnect(), { once: true })
}
