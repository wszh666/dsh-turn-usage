/**
 * Turn token usage — browser half.
 *
 * Adds one always-visible line under every completed Chat turn:
 * `本轮 12.3K tok · 累计 58.1K tok`, with a click-to-expand breakdown.
 *
 * Data comes from two client-side sources the installed packages already
 * maintain, so this plugin makes no model requests and adds no session events:
 * - per-turn numbers: the Chat `turn-tail` node data (`tokenUsage`), the same
 *   accounting behind the built-in Turn usage surface;
 * - session total: the session's `tokenUsage` projection (whole durable log).
 */
window.__ModuleLoader__.load({
  id: '@local/turn-usage',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } = React

    const NS = 'turn-usage'

    const zh = {
      'line.turn': '本轮 {count}',
      'line.total': '累计 {count}',
      'line.separator': ' · ',
      'count.tokens': '{count} tok',
      'number.thousand': '{value}K',
      'number.million': '{value}M',
      'number.groupSeparator': ',',
      'details.expand': '展开用量明细',
      'details.collapse': '收起用量明细',
      'details.aria': '本轮与会话的 token 用量明细',
      'details.turnTitle': '本轮用量',
      'details.sessionTitle': '会话累计',
      'details.uncachedInput': '未缓存输入',
      'details.cacheRead': '缓存读取',
      'details.cacheWrite': '缓存写入',
      'details.output': '输出',
      'details.reasoning': ' （其中推理 {count}）',
      'details.cacheHit': '缓存命中',
      'details.model': '提供方 / 模型',
      'details.turnUnavailable': '本轮没有精确用量（历史未完整载入或提供方未报告）。',
      'details.sessionUnavailable': '会话累计暂不可用。',
      'title.breakdown': '{label} {count}',
    }

    const en = {
      'line.turn': 'This turn {count}',
      'line.total': 'Total {count}',
      'line.separator': ' · ',
      'count.tokens': '{count} tok',
      'number.thousand': '{value}K',
      'number.million': '{value}M',
      'number.groupSeparator': ',',
      'details.expand': 'Show usage details',
      'details.collapse': 'Hide usage details',
      'details.aria': 'Token usage details for this turn and the session',
      'details.turnTitle': 'This turn',
      'details.sessionTitle': 'Session total',
      'details.uncachedInput': 'Uncached input',
      'details.cacheRead': 'Cached input',
      'details.cacheWrite': 'Cache write',
      'details.output': 'Output',
      'details.reasoning': ' ({count} reasoning)',
      'details.cacheHit': 'Cache hit',
      'details.model': 'Provider / model',
      'details.turnUnavailable': 'No exact usage for this turn (history incomplete or the provider reported none).',
      'details.sessionUnavailable': 'Session total is not available yet.',
      'title.breakdown': '{label} {count}',
    }

    const STYLES = `
.dsu-root {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  max-width: 100%;
}
.dsu-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsu-line:hover {
  color: var(--dsw-alias-label-secondary);
}
.dsu-line:focus-visible {
  outline: none;
  border-radius: var(--dsw-radius-xs);
  box-shadow: 0 0 0 var(--dsw-focus-ring-width, 2px) var(--dsw-focus-ring-color);
}
.dsu-panel {
  box-sizing: border-box;
  width: min(420px, 100%);
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}
.dsu-section + .dsu-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsu-sectionHead {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dsu-sectionValue {
  font-variant-numeric: tabular-nums;
}
.dsu-grid {
  display: grid;
  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);
  gap: 4px 16px;
  margin: 0;
}
.dsu-grid dt,
.dsu-grid dd {
  margin: 0;
  min-width: 0;
}
.dsu-grid dd {
  color: var(--dsw-alias-label-secondary);
  text-align: right;
}
.dsu-route {
  overflow-wrap: anywhere;
}
.dsu-hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
}
`

    /**
     * Compact token count, matching the Chat statistics surfaces: 517 / 12.2K / 517K / 1.2M.
     * @param {number} value - non-negative token count.
     * @param {(key: string, values?: Record<string, unknown>) => string} t - namespace translator.
     * @returns {string} display string.
     */
    function formatCompact(value, t) {
      const scaled = candidate => candidate >= 100
        ? String(Math.round(candidate))
        : String(Math.round(candidate * 10) / 10)
      if (value < 1_000) return String(value)
      if (value < 1_000_000) return t('number.thousand', { value: scaled(value / 1_000) })
      return t('number.million', { value: scaled(value / 1_000_000) })
    }

    /**
     * Exact integer token count with the active locale's digit grouping.
     * @param {number} value - non-negative token count.
     * @param {(key: string, values?: Record<string, unknown>) => string} t - namespace translator.
     * @returns {string} display string.
     */
    function formatExact(value, t) {
      const digits = String(Math.max(0, Math.round(value)))
      const groups = []
      for (let end = digits.length; end > 0; end -= 3) {
        groups.unshift(digits.slice(Math.max(0, end - 3), end))
      }
      return groups.join(t('number.groupSeparator'))
    }

    function compactCount(value, t) {
      return t('count.tokens', { count: formatCompact(value, t) })
    }

    function exactCount(value, t) {
      return t('count.tokens', { count: formatExact(value, t) })
    }

    function totalOf(buckets) {
      if (buckets === null || buckets === undefined) return undefined
      if (typeof buckets.totalTokens === 'number') return buckets.totalTokens
      const uncached = buckets.uncachedInputTokens ?? 0
      const cacheRead = buckets.cacheReadTokens ?? 0
      const cacheWrite = buckets.cacheWriteTokens ?? 0
      const output = buckets.outputTokens ?? 0
      return uncached + cacheRead + cacheWrite + output
    }

    /**
     * Prompt-side cache hit rate without rounding a partial hit up to 100%.
     * @param {number|undefined} cacheReadTokens - cached prompt tokens.
     * @param {number|undefined} promptTokens - billed prompt tokens.
     * @returns {string|null} percentage text, or null when there was no prompt input.
     */
    function cacheHitPercent(cacheReadTokens, promptTokens) {
      if (typeof cacheReadTokens !== 'number' || typeof promptTokens !== 'number') return null
      if (!Number.isFinite(promptTokens) || promptTokens <= 0) return null
      const percent = cacheReadTokens / promptTokens * 100
      if (percent >= 100) return '100%'
      const rounded = Math.round(percent * 10) / 10
      return `${rounded >= 100 ? '99.9' : String(rounded)}%`
    }

    function grid(rows) {
      const children = []
      rows.forEach((row, index) => {
        children.push(h('dt', { key: `dt${index}` }, row.label))
        children.push(h(
          'dd',
          { key: `dd${index}`, className: row.route === true ? 'dsu-route' : undefined },
          row.value,
        ))
      })
      return h('dl', { className: 'dsu-grid' }, children)
    }

    function turnRows(usage, t) {
      const rows = [{ label: t('details.uncachedInput'), value: exactCount(usage.uncachedInputTokens ?? 0, t) }]
      if (usage.cacheReadTokens !== undefined) {
        rows.push({ label: t('details.cacheRead'), value: exactCount(usage.cacheReadTokens, t) })
      }
      if (usage.cacheWriteTokens !== undefined) {
        rows.push({ label: t('details.cacheWrite'), value: exactCount(usage.cacheWriteTokens, t) })
      }
      const output = h(
        'span',
        null,
        exactCount(usage.outputTokens ?? 0, t),
        usage.reasoningTokens === undefined
          ? null
          : h('span', { className: 'dsu-hint' }, ' ', t('details.reasoning', {
            count: exactCount(usage.reasoningTokens, t),
          })),
      )
      rows.push({ label: t('details.output'), value: output })
      const promptTokens = usage.totalTokens !== undefined
        ? usage.totalTokens - (usage.outputTokens ?? 0)
        : undefined
      const hit = cacheHitPercent(usage.cacheReadTokens, promptTokens)
      if (hit !== null) rows.push({ label: t('details.cacheHit'), value: hit })
      const routes = Array.isArray(usage.routes) && usage.routes.length > 0
        ? usage.routes.map(route => `${route.provider}/${route.model}`).join(', ')
        : ''
      if (routes !== '') rows.push({ label: t('details.model'), value: routes, route: true })
      return rows
    }

    function sessionRows(usage, t) {
      const rows = [{ label: t('details.uncachedInput'), value: exactCount(usage.uncachedInputTokens ?? 0, t) }]
      if (usage.cacheReadTokens !== undefined) {
        rows.push({ label: t('details.cacheRead'), value: exactCount(usage.cacheReadTokens, t) })
      }
      if (usage.cacheWriteTokens !== undefined) {
        rows.push({ label: t('details.cacheWrite'), value: exactCount(usage.cacheWriteTokens, t) })
      }
      rows.push({ label: t('details.output'), value: exactCount(usage.outputTokens ?? 0, t) })
      const promptTokens = (usage.uncachedInputTokens ?? 0)
        + (usage.cacheReadTokens ?? 0)
        + (usage.cacheWriteTokens ?? 0)
      const hit = cacheHitPercent(usage.cacheReadTokens, promptTokens)
      if (hit !== null) rows.push({ label: t('details.cacheHit'), value: hit })
      return rows
    }

    function section(title, total, rows, hint) {
      const head = h(
        'div',
        { className: 'dsu-sectionHead' },
        h('span', null, title),
        total === undefined ? null : h('span', { className: 'dsu-sectionValue' }, total),
      )
      return h(
        'div',
        { className: 'dsu-section' },
        head,
        rows.length > 0 ? grid(rows) : h('p', { className: 'dsu-hint' }, hint),
      )
    }

    function UsageDetails({ turnUsage, sessionUsage, t, id }) {
      const turnTotal = turnUsage === null || turnUsage === undefined ? undefined : totalOf(turnUsage)
      const sessionTotal = totalOf(sessionUsage)
      return h(
        'div',
        { className: 'dsu-panel', id, role: 'region', 'aria-label': t('details.aria') },
        section(
          t('details.turnTitle'),
          turnTotal === undefined ? undefined : exactCount(turnTotal, t),
          turnUsage === null || turnUsage === undefined ? [] : turnRows(turnUsage, t),
          t('details.turnUnavailable'),
        ),
        section(
          t('details.sessionTitle'),
          sessionTotal === undefined ? undefined : exactCount(sessionTotal, t),
          sessionUsage === null || sessionUsage === undefined ? [] : sessionRows(sessionUsage, t),
          t('details.sessionUnavailable'),
        ),
      )
    }

    function titleText({ turnUsage, sessionUsage, t }) {
      const lines = []
      const turnTotal = turnUsage === null || turnUsage === undefined ? undefined : totalOf(turnUsage)
      const sessionTotal = totalOf(sessionUsage)
      if (turnTotal !== undefined) lines.push(t('title.breakdown', {
        label: t('details.turnTitle'),
        count: exactCount(turnTotal, t),
      }))
      if (turnUsage !== null && turnUsage !== undefined) {
        const parts = []
        parts.push(t('title.breakdown', {
          label: t('details.uncachedInput'),
          count: exactCount(turnUsage.uncachedInputTokens ?? 0, t),
        }))
        if (turnUsage.cacheReadTokens !== undefined) {
          parts.push(t('title.breakdown', {
            label: t('details.cacheRead'),
            count: exactCount(turnUsage.cacheReadTokens, t),
          }))
        }
        if (turnUsage.cacheWriteTokens !== undefined) {
          parts.push(t('title.breakdown', {
            label: t('details.cacheWrite'),
            count: exactCount(turnUsage.cacheWriteTokens, t),
          }))
        }
        parts.push(t('title.breakdown', {
          label: t('details.output'),
          count: exactCount(turnUsage.outputTokens ?? 0, t),
        }))
        lines.push(parts.join(' · '))
      }
      if (sessionTotal !== undefined) lines.push(t('title.breakdown', {
        label: t('details.sessionTitle'),
        count: exactCount(sessionTotal, t),
      }))
      return lines.join('\n')
    }

    /**
     * One always-visible usage line plus its expanded breakdown.
     * @param {object} props - owner turn, translator, and the injected readers.
     */
    function TurnUsageLine({ turn, t, readTurnUsage, readSessionUsage, subscribeUsage }) {
      const getTurnUsage = useCallback(() => readTurnUsage(turn), [readTurnUsage, turn])
      const getSessionUsage = useCallback(() => readSessionUsage(), [readSessionUsage])
      const turnUsage = useSyncExternalStore(subscribeUsage, getTurnUsage)
      const sessionUsage = useSyncExternalStore(subscribeUsage, getSessionUsage)
      const [open, setOpen] = useState(false)
      const rootRef = useRef(null)
      const detailsId = useId()
      const close = useCallback(() => { setOpen(false) }, [])

      useEffect(() => {
        if (!open) return undefined
        const dismiss = event => {
          const root = rootRef.current
          if (root !== null && event.target instanceof Node && root.contains(event.target)) return
          setOpen(false)
        }
        document.addEventListener('pointerdown', dismiss, true)
        return () => { document.removeEventListener('pointerdown', dismiss, true) }
      }, [open])

      if (typeof turn !== 'number') return null
      const turnTotal = turnUsage === null || turnUsage === undefined ? undefined : totalOf(turnUsage)
      const sessionTotal = totalOf(sessionUsage)
      if (turnTotal === undefined && sessionTotal === undefined) return null

      const parts = []
      if (turnTotal !== undefined) parts.push(t('line.turn', { count: compactCount(turnTotal, t) }))
      if (sessionTotal !== undefined) parts.push(t('line.total', { count: compactCount(sessionTotal, t) }))
      const label = parts.join(t('line.separator'))

      return h(
        'div',
        {
          className: 'dsu-root',
          ref: rootRef,
          'data-dsh-turn-usage': String(turn),
          onKeyDown: event => {
            if (event.key !== 'Escape' || !open) return
            event.stopPropagation()
            close()
          },
        },
        h('button', {
          type: 'button',
          className: 'dsu-line',
          'aria-expanded': open,
          'aria-controls': detailsId,
          'aria-label': `${label} — ${t(open ? 'details.collapse' : 'details.expand')}`,
          title: titleText({ turnUsage, sessionUsage, t }),
          onClick: () => { setOpen(!open) },
        }, label),
        open
          ? h(UsageDetails, { id: detailsId, turnUsage, sessionUsage, t })
          : null,
      )
    }

    /**
     * Resolve the session's Chat snapshot source and token-usage projection face
     * for one slot registration. Both are identity-stable observables owned by
     * the installed packages, so the component only subscribes.
     * @param {object} ctx - client root context.
     * @param {string} sessionId - the slot's session.
     */
    function createFace(ctx, sessionId) {
      let binding
      let chatTarget
      let usageFace
      const resolve = () => {
        if (binding !== undefined) return
        const current = ctx.sessions.binding(sessionId)
        if (current === undefined) return
        try {
          const target = ctx.uiConversation.binding(current).target('chat')
          const face = current.session.projections.faceOf('tokenUsage')
          binding = current
          chatTarget = target
          usageFace = face
        } catch (error) {
          binding = undefined
          chatTarget = undefined
          usageFace = undefined
        }
      }
      const readTurnUsage = turn => {
        resolve()
        if (chatTarget === undefined) return null
        const snapshot = chatTarget.getSnapshot()
        if (snapshot === undefined) return null
        const nodes = snapshot.nodes.turnDataSource(turn, 'turn-tail').getSnapshot()
        const node = nodes.length === 0 ? undefined : nodes[nodes.length - 1]
        return node === undefined || node.tokenUsage === undefined ? null : node.tokenUsage
      }
      const readSessionUsage = () => {
        resolve()
        if (usageFace === undefined) return null
        const value = usageFace.getSnapshot()
        return value === undefined || value === null ? null : value
      }
      const subscribeUsage = listener => {
        resolve()
        const disposers = []
        if (chatTarget !== undefined) disposers.push(chatTarget.subscribe(listener))
        if (usageFace !== undefined) disposers.push(usageFace.subscribe(listener))
        return () => { for (const dispose of disposers) dispose() }
      }
      return { readTurnUsage, readSessionUsage, subscribeUsage }
    }

    return {
      inject: ['slots', 'sessions', 'uiConversation', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-usage: dictionaries')
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {}
          const style = document.createElement('style')
          style.setAttribute('data-dsh-turn-usage-styles', '')
          style.textContent = STYLES
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'turn-usage: styles')
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'turn-usage',
          locale: NS,
          inject: sessionId => createFace(ctx, sessionId),
        }, TurnUsageLine))
      },
    }
  },
})
