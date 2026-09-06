export const movePriorityResourceOrder = (order, resourceKey, targetIndex) => {
  const uniqueOrder = order.filter((key, index) => order.indexOf(key) === index)
  const currentIndex = uniqueOrder.indexOf(resourceKey)
  if (currentIndex < 0) return uniqueOrder
  const nextOrder = uniqueOrder.filter((key) => key !== resourceKey)
  const boundedIndex = Math.max(0, Math.min(targetIndex, nextOrder.length))
  nextOrder.splice(boundedIndex, 0, resourceKey)
  return nextOrder
}

export const styles = `
  .dep-root { width: 680px; margin: 0 0 24px; font-size: 13px; line-height: 1.5; }
  .dep-root *, .dep-root *::before, .dep-root *::after { box-sizing: border-box; }
  .dep-button { min-height: 36px; padding: 6px 14px; border: 1px solid #555; cursor: pointer; font-size: 14px; font-weight: bold; }
  .dep-button:disabled { cursor: not-allowed; opacity: .5; }
  body.dark .dep-button { background: #111; color: #ddd; }
  body:not(.dark) .dep-button { border-color: #9bbfd5; border-radius: 6px; background: #e6f3fa; color: #28637e; }
  .dep-button-primary { min-width: 168px; }
  .dep-button-primary.is-loading:disabled { cursor: wait; opacity: .82; }
  .dep-button-primary.is-loading::before { display: inline-block; width: 14px; height: 14px; margin-right: 8px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -2px; animation: dep-route-spin .7s linear infinite; content: ''; }
  body.dark .dep-button-primary { border-color: #b68a00; color: #fc0; }
  body:not(.dark) .dep-button-primary { border-color: #407f9e; background: #d8edf7; color: #174f69; }
  .dep-page-title { min-height: 40px; }
  .dep-title-sync { box-sizing: border-box; float: right; min-width: 126px; min-height: 28px; height: 28px; margin: 3px 8px 0 0; padding: 0 12px; font-size: 12px; line-height: 26px; }
  .dep-lead { margin: 0; padding: 9px 12px; font-size: 12px; }
  .dep-candidate-panel { margin-top: 8px; }
  .dep-candidate-summary { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; cursor: pointer; list-style: none; }
  .dep-candidate-summary::-webkit-details-marker { display: none; }
  .dep-candidate-summary-title strong { display: block; font-size: 16px; }
  .dep-candidate-summary-title small { display: block; color: #888; font-size: 11px; font-weight: normal; }
  .dep-candidate-summary-status { display: flex; align-items: center; gap: 11px; white-space: nowrap; }
  .dep-candidate-summary-status b { color: #317ca2; font-size: 12px; }
  body.dark .dep-candidate-summary-status b { color: #7fc7ea; }
  .dep-candidate-summary-status span::before { color: #888; font-size: 11px; content: attr(data-collapsed-label); }
  .dep-candidate-panel[open] .dep-candidate-summary-status span::before { content: attr(data-expanded-label); }
  .dep-candidate-body { padding: 0 10px 10px; border-top: 1px solid rgba(128,128,128,.25); }
  .dep-candidate-warning { margin: 9px 0 0; padding: 7px 9px; border-left: 3px solid #c98f00; background: rgba(201,143,0,.1); font-size: 11px; }
  .dep-section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .dep-section-head h3 { margin: 0; font-size: 16px; }
  .dep-section-head p { margin: 0; color: #888; font-size: 11px; }
  .dep-presets { display: flex; justify-content: flex-end; gap: 5px; padding: 9px 0; }
  .dep-preset { min-height: 28px; padding: 3px 10px; border: 1px solid rgba(128,128,128,.45); background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-weight: bold; }
  .dep-candidate-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .dep-candidate-group { min-width: 0; padding: 7px 8px; }
  .dep-candidate-group h4 { margin: -7px -8px 5px; padding: 3px 6px; background: #4d82af; color: #fff; font-size: 12px; text-align: center; }
  .dep-candidate { display: grid; grid-template-columns: 16px 28px minmax(0, 1fr); align-items: center; min-height: 20px; cursor: pointer; font-variant-numeric: tabular-nums; }
  .dep-candidate input { margin: 0; }
  .dep-candidate strong { font-size: 12px; text-align: center; }
  .dep-candidate small { color: #888; font: 10px monospace; text-align: right; }
  .dep-settings-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(220px, 1fr); gap: 8px; margin-top: 8px; }
  .dep-setting-panel { padding: 10px 12px; }
  .dep-priority-list { display: grid; gap: 6px; }
  .dep-priority-row { display: grid; grid-template-columns: 42px minmax(0, 1fr) 94px 98px 54px; align-items: center; gap: 6px; min-height: 30px; }
  .dep-priority-rank { color: var(--dep-resource); font: bold 13px monospace; text-align: center; }
  .dep-priority-name { min-width: 0; font-size: 12px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dep-priority-select, .dep-mode-select { width: 100%; min-width: 0; height: 28px; color: inherit; font-size: 12px; }
  .dep-priority-moves { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
  .dep-priority-move { min-width: 0; min-height: 26px; padding: 0; border: 1px solid rgba(128,128,128,.45); background: transparent; color: inherit; cursor: pointer; font-size: 12px; line-height: 1; }
  .dep-priority-move:disabled { cursor: not-allowed; opacity: .35; }
  .dep-schedule { display: grid; grid-template-columns: 1fr; gap: 9px; }
  .dep-time-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .dep-time-inputs label { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; font-size: 11px; }
  .dep-time-inputs input { width: 100%; height: 29px; padding: 3px 5px; color: inherit; text-align: right; }
  body.dark .dep-time-inputs input { border: 1px solid #444; background: #090909; }
  body:not(.dark) .dep-time-inputs input { border: 1px solid #b7cbd5; background: #fff; }
  .dep-fleet-options { display: flex; justify-content: space-between; gap: 5px; }
  .dep-fleet-options label { display: flex; flex: 1; align-items: center; justify-content: center; gap: 4px; min-height: 31px; border: 1px solid rgba(128,128,128,.35); cursor: pointer; font-size: 12px; }
  .dep-fleet-options label:has(input:checked) { border-color: #3b87aa; background: rgba(70,150,190,.14); }
  .dep-button:focus-visible, .dep-root input:focus-visible, .dep-root select:focus-visible, .dep-candidate-summary:focus-visible, .dep-fold:focus-within { outline: 2px solid #69c; outline-offset: 2px; }
  .dep-resources { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 8px; }
  .dep-resource { --dep-resource: #777; position: relative; min-width: 0; padding: 10px 11px 9px; overflow: hidden; }
  .dep-resource::before { position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--dep-resource); content: ''; }
  .dep-resource-head { display: flex; justify-content: space-between; align-items: baseline; }
  .dep-resource-head strong { font-size: 15px; }
  .dep-resource-head span { color: #888; font-size: 12px; }
  .dep-resource-head span b { margin-left: 2px; color: inherit; font-size: 16px; font-variant-numeric: tabular-nums; }
  .dep-success-panel { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1.15fr) minmax(0, .75fr); gap: 12px; align-items: stretch; margin-top: 8px; padding: 13px; }
  .dep-assumption-group { min-width: 0; margin: 0; padding: 0; border: 0; }
  .dep-assumption-group legend, .dep-assumption-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: bold; }
  .dep-success-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .dep-success-option { display: flex; min-width: 0; min-height: 45px; align-items: center; gap: 7px; padding: 7px 9px; border: 1px solid rgba(128,128,128,.35); cursor: pointer; }
  .dep-success-option span { min-width: 0; }
  .dep-success-option:has(input:checked) { border-color: #3b87aa; background: rgba(70,150,190,.14); }
  .dep-success-option input { margin: 0; }
  .dep-success-option strong { display: block; font-size: 13px; }
  .dep-success-option small { display: block; color: #888; font-size: 11px; }
  .dep-daihatsu-select { width: 100%; min-width: 0; max-width: 100%; min-height: 45px; padding: 5px 9px; border: 1px solid rgba(128,128,128,.45); color: inherit; font: bold 14px sans-serif; }
  body.dark .dep-daihatsu-select { background: #090909; }
  body:not(.dark) .dep-daihatsu-select { background: #fff; }
  .dep-factor { display: flex; min-width: 0; flex-direction: column; justify-content: center; padding: 8px 11px; overflow-wrap: anywhere; border-left: 4px solid #3b87aa; }
  .dep-factor span { color: #888; font-size: 11px; }
  .dep-factor strong { font-size: 20px; font-variant-numeric: tabular-nums; }
  .dep-factor small { font-size: 11px; }
  .dep-actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 13px; }
  .dep-actions p { margin: 0; font-size: 13px; line-height: 1.5; }
  .dep-actions b { color: #c98f00; }
  .dep-output { margin-top: 10px; }
  .dep-idle, .dep-error { min-height: 64px; padding: 14px; text-align: center; }
  .dep-idle strong, .dep-error strong { display: block; margin-bottom: 4px; font-size: 16px; }
  .dep-idle span, .dep-error span { font-size: 13px; }
  .dep-error strong { color: #c44; }
  .dep-dispatch-board { margin-bottom: 9px; padding: 11px 12px 12px; }
  .dep-dispatch-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .dep-dispatch-title h3 { margin: 0; font-size: 18px; }
  .dep-dispatch-title span { color: #888; font-size: 12px; }
  .dep-plan-totals { display: grid; grid-template-columns: minmax(112px, 1.2fr) repeat(5, minmax(0, 1fr)); gap: 5px; margin-bottom: 9px; padding: 7px 0; border-top: 1px solid rgba(128,128,128,.25); border-bottom: 1px solid rgba(128,128,128,.25); }
  .dep-plan-total-label { display: flex; align-items: center; padding: 3px 7px; font-size: 12px; line-height: 1.35; }
  .dep-plan-total { min-width: 0; padding: 3px 6px; border-left: 3px solid var(--dep-resource); }
  .dep-plan-total b { display: block; color: #888; font-size: 10px; line-height: 1.2; }
  .dep-plan-total em { display: block; overflow: hidden; font: bold 12px monospace; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  .dep-dispatch-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
  .dep-dispatch-step { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 8px; min-width: 0; padding: 9px; border-left: 4px solid #777; }
  .dep-step-number { display: grid; width: 30px; height: 30px; place-items: center; border: 2px solid currentColor; border-radius: 50%; font: bold 15px monospace; }
  .dep-step-route { font-size: 12px; }
  .dep-step-route strong { display: block; overflow: hidden; font-size: 16px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
  .dep-step-route b { color: #317ca2; }
  body.dark .dep-step-route b { color: #fc0; }
  .dep-step-action { display: block; margin-top: 4px; font-size: 12px; font-weight: bold; }
  .dep-state-ready { border-left-color: #3e9b59; }
  .dep-state-ready .dep-step-number, .dep-state-ready .dep-readiness, .dep-state-ready .dep-step-action { color: #3e9b59; }
  .dep-state-waiting { border-left-color: #317ca2; }
  .dep-state-waiting .dep-step-number, .dep-state-waiting .dep-readiness, .dep-state-waiting .dep-step-action { color: #317ca2; }
  body.dark .dep-state-waiting .dep-step-number, body.dark .dep-state-waiting .dep-readiness, body.dark .dep-state-waiting .dep-step-action { color: #7fc7ea; }
  .dep-state-supply, .dep-state-composition { border-left-color: #c98f00; }
  .dep-state-supply .dep-step-number, .dep-state-supply .dep-readiness, .dep-state-supply .dep-step-action,
  .dep-state-composition .dep-step-number, .dep-state-composition .dep-readiness, .dep-state-composition .dep-step-action { color: #c98f00; }
  .dep-pairing-list { display: grid; gap: 9px; }
  .dep-pairing { padding: 0 11px 11px; border-left: 4px solid #777; }
  .dep-pairing-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; min-height: 50px; }
  .dep-pairing-head h3 { margin: 0; font-size: 17px; line-height: 1.35; }
  .dep-pairing-head h3 span { color: #888; font-size: 13px; font-weight: normal; }
  .dep-readiness { padding: 4px 8px; border: 1px solid currentColor; font-size: 12px; font-weight: bold; white-space: nowrap; }
  .dep-next-action { margin: 0 0 9px; padding: 8px 10px; font-size: 14px; font-weight: bold; }
  body.dark .dep-next-action { background: rgba(255,255,255,.05); }
  body:not(.dark) .dep-next-action { background: rgba(255,255,255,.7); }
  .dep-income { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 9px; }
  .dep-income span { padding: 5px 7px; border-left: 3px solid var(--dep-resource); font: 12px monospace; }
  .dep-income strong { display: block; margin-bottom: 1px; font: bold 13px sans-serif; }
  .dep-fold { margin-top: 6px; padding: 0; }
  .dep-fold summary { padding: 8px 10px; cursor: pointer; font-size: 13px; font-weight: bold; list-style-position: inside; }
  .dep-fold[open] summary { border-bottom: 1px solid rgba(128,128,128,.25); }
  .dep-fold-body { padding: 9px 11px; }
  .dep-fold-summary-ok { color: #3e9b59; }
  .dep-fold-summary-warn { color: #c98f00; }
  .dep-conditions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; margin: 0; padding: 0; list-style: none; }
  .dep-conditions li { position: relative; padding-left: 17px; font-size: 12px; line-height: 1.5; }
  .dep-conditions li::before { position: absolute; left: 0; font-weight: bold; content: '—'; }
  .dep-conditions li.pass::before { color: #3e9b59; content: '✓'; }
  .dep-conditions li.fail { color: #c98f00; }
  .dep-conditions li.fail::before { content: '!'; }
  .dep-notes { margin: 0; padding-left: 19px; }
  .dep-notes li { margin: 4px 0; font-size: 12px; line-height: 1.5; }
  @media (max-width: 680px) {
    .dep-root { width: 100%; }
    .dep-candidate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dep-settings-grid { grid-template-columns: 1fr; }
    .dep-priority-row { grid-template-columns: 36px minmax(0, 1fr) 88px 92px 52px; }
    .dep-resources { grid-template-columns: repeat(2, 1fr); }
    .dep-success-panel { grid-template-columns: minmax(0, 1fr); }
    .dep-plan-totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dep-plan-total-label { grid-column: 1 / -1; }
    .dep-dispatch-steps { grid-template-columns: 1fr; }
    .dep-conditions { grid-template-columns: 1fr; }
    .dep-actions { align-items: stretch; flex-direction: column; }
    .dep-income { grid-template-columns: repeat(2, 1fr); }
  }
  @keyframes dep-route-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .dep-button-primary.is-loading::before { border-right-color: currentColor; animation: none; opacity: .55; }
  }
`

const priorityOptionsMarkup = (t, selectedRank) =>
  [1, 2, 3, 4, 5]
    .map(
      (rank) =>
        `<option value="${rank}"${rank === selectedRank ? ' selected' : ''}>${t(`expedition.priorityRank${rank}`)}</option>`,
    )
    .join('')

const modeOptionsMarkup = (t, selectedMode) =>
  ['optimize', 'constraint', 'ignore']
    .map(
      (mode) =>
        `<option value="${mode}"${mode === selectedMode ? ' selected' : ''}>${t(`expedition.preferenceMode.${mode}`)}</option>`,
    )
    .join('')

export const plannerMarkup = (t, resources, weightResources, expeditionGroups) => `
  <section class="dep-root" aria-label="${t('expedition.title')}">
    <div class="page_title dep-page-title">
      ${t('expedition.title')}
      <button id="dep-sync" class="dep-button dep-title-sync" type="button">${t('expedition.syncResources')}</button>
    </div>
    <p class="dep-lead page_panel bscolor4 fcolor2">${t('expedition.lead')}</p>
    <div id="dep-resources" class="dep-resources">
      ${resources
        .map(
          (resource) => `
            <section class="dep-resource bscolor3 fcolor2" style="--dep-resource:${resource.color}">
              <div class="dep-resource-head">
                <strong>${t(`common.${resource.key}`)}</strong>
                <span>${t('common.current')} <b id="dep-current-${resource.key}">—</b></span>
              </div>
            </section>
          `,
        )
        .join('')}
    </div>
    <details class="dep-candidate-panel page_panel bscolor4 fcolor2">
      <summary class="dep-candidate-summary">
        <span class="dep-candidate-summary-title"><strong>${t('expedition.candidates')}</strong><small>${t('expedition.candidateHint')}</small></span>
        <span class="dep-candidate-summary-status"><b id="dep-candidate-count">${t('expedition.selectAll')}</b><span aria-hidden="true" data-collapsed-label="${t('expedition.expand')}" data-expanded-label="${t('expedition.collapse')}"></span></span>
      </summary>
      <div class="dep-candidate-body">
        <p class="dep-candidate-warning">${t('expedition.candidateUnlockWarning')}</p>
        <div class="dep-presets" aria-label="${t('expedition.candidatePresets')}">
          <button class="dep-preset" data-preset="all" type="button">${t('expedition.selectAll')}</button>
          <button class="dep-preset" data-preset="recommended" type="button">${t('expedition.recommended')}</button>
          <button class="dep-preset" data-preset="buckets" type="button">${t('expedition.buckets')}</button>
          <button class="dep-preset" data-preset="none" type="button">${t('expedition.clear')}</button>
        </div>
        <div class="dep-candidate-grid">
          ${expeditionGroups
            .map(
              (group, index) => `
                <section class="dep-candidate-group bscolor3 fcolor2">
                  <h4>${t('expedition.area', { index: index + 1 })}</h4>
                  ${group
                    .map(
                      ([id, displayNo, duration]) => `
                        <label class="dep-candidate">
                          <input data-expedition-id="${id}" type="checkbox" checked>
                          <strong>${displayNo}</strong>
                          <small>${duration}</small>
                        </label>
                      `,
                    )
                    .join('')}
                </section>
              `,
            )
            .join('')}
        </div>
      </div>
    </details>
    <div class="dep-settings-grid">
      <section class="dep-setting-panel page_panel bscolor4 fcolor2" aria-labelledby="dep-weight-title">
        <div class="dep-section-head"><div><h3 id="dep-weight-title">${t('expedition.resourceWeights')}</h3><p title="${t('expedition.weightTooltip')}">${t('expedition.weightHint')}</p></div></div>
        <div class="dep-priority-list" data-priority-list>
          ${weightResources
            .map(
              (resource, index) => `
                <div class="dep-priority-row" data-priority-resource="${resource.key}" style="--dep-resource:${resource.color}">
                  <span class="dep-priority-rank" data-priority-rank="${resource.key}">${index + 1}</span>
                  <span class="dep-priority-name">${t(`common.${resource.key}`)}</span>
                  <select class="dep-mode-select" data-resource-mode="${resource.key}" aria-label="${t('expedition.resourceModeFor', { resource: t(`common.${resource.key}`) })}">
                    ${modeOptionsMarkup(t, 'optimize')}
                  </select>
                  <select class="dep-priority-select" data-resource-priority="${resource.key}" aria-label="${t('expedition.resourcePriorityFor', { resource: t(`common.${resource.key}`) })}">
                    ${priorityOptionsMarkup(t, index + 1)}
                  </select>
                  <span class="dep-priority-moves">
                    <button class="dep-priority-move" data-priority-move="up" data-priority-key="${resource.key}" type="button" title="${t('expedition.priorityMoveUp')}">▲</button>
                    <button class="dep-priority-move" data-priority-move="down" data-priority-key="${resource.key}" type="button" title="${t('expedition.priorityMoveDown')}">▼</button>
                  </span>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
      <section class="dep-setting-panel page_panel bscolor4 fcolor2" aria-labelledby="dep-schedule-title">
        <div class="dep-section-head"><div><h3 id="dep-schedule-title">${t('expedition.schedule')}</h3><p>${t('expedition.scheduleHint')}</p></div></div>
        <div class="dep-schedule">
          <div class="dep-time-inputs">
            <label><input id="dep-afk-hours" min="0" max="48" type="number" value="0">${t('common.hours', { value: '' }).trim()}</label>
            <label><input id="dep-afk-minutes" min="0" max="59" type="number" value="0">${t('common.minutes', { value: '' }).trim()}</label>
          </div>
          <div class="dep-fleet-options" aria-label="${t('expedition.availableFleets')}">
            ${[1, 2, 3]
              .map(
                (count) =>
                  `<label><input name="dep-fleet-count" type="radio" value="${count}"${count === 3 ? ' checked' : ''}>${t('expedition.fleets', { count })}</label>`,
              )
              .join('')}
          </div>
        </div>
      </section>
    </div>
    <section class="dep-success-panel page_panel bscolor4 fcolor2">
      <fieldset class="dep-assumption-group">
        <legend>${t('expedition.successMode')}</legend>
        <div class="dep-success-options">
          <label class="dep-success-option">
            <input name="dep-success-mode" type="radio" value="normal" checked>
            <span><strong>${t('expedition.normalSuccess')}</strong><small>${t('expedition.rewardMultiplier', { value: '1.00' })}</small></span>
          </label>
          <label class="dep-success-option">
            <input name="dep-success-mode" type="radio" value="great">
            <span><strong>${t('expedition.greatSuccess')}</strong><small>${t('expedition.rewardMultiplier', { value: '1.50' })}</small></span>
          </label>
        </div>
      </fieldset>
      <label class="dep-assumption-group" for="dep-daihatsu-count">
        <span class="dep-assumption-label">${t('expedition.daihatsu')}</span>
        <select id="dep-daihatsu-count" class="dep-daihatsu-select">
          ${[0, 1, 2, 3, 4].map((count) => `<option value="${count}">${t('expedition.daihatsuOption', { count, percent: count * 5 })}${count === 4 ? ` (${t('expedition.maximum')})` : ''}</option>`).join('')}
        </select>
      </label>
      <output class="dep-factor bscolor3 fcolor2" aria-live="polite">
        <span>${t('expedition.totalMultiplier')}</span>
        <strong id="dep-factor-total">×1.000</strong>
        <small id="dep-factor-formula">1.00 × 1.00</small>
      </output>
    </section>
    <div class="dep-actions page_panel bscolor4 fcolor2">
      <p>${t('expedition.actionHint')}</p>
      <button id="dep-generate" class="dep-button dep-button-primary" type="button" disabled>${t('expedition.generate')}</button>
    </div>
    <div id="dep-output" class="dep-output" aria-live="polite">
      <div class="dep-idle bscolor3 fcolor2"><strong>${t('expedition.idle')}</strong><span>${t('expedition.idleHint')}</span></div>
    </div>
  </section>
`
