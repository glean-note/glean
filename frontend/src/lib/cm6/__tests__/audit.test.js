import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import './cm6dom'
import { EditorSelection } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { createEditor, emitMarkdown } from '../editor'

// vitest runs from frontend/, the suite sits at the repo root
const SUITE = resolve(process.cwd(), '../markdown-test-suite_2.md')
const suiteText = readFileSync(SUITE, 'utf8')

// CM6 virtualizes the DOM to the viewport, so a census over view.dom of the
// full 686-line suite only ever sees the first screenful. The audit mounts
// per-section snippets that fit, and reserves the full file for the
// byte-true round-trip which reads the doc, not the DOM
function section(n) {
  const start = suiteText.indexOf(`## ${n}.`)
  const next = suiteText.slice(start + 1).search(/\n## \d/)
  const end = next < 0 ? suiteText.length : start + 1 + next
  return suiteText.slice(start, end) + '\n'
}

function mount(initial) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = createEditor({ parent, markdown: initial, starline: { getNoteNames: () => ({}), onNoteLink: () => {} } })
  return { view, parent }
}

function destroy(ctx) {
  ctx.view.destroy()
  ctx.parent.remove()
}

async function settle(ms = 40) {
  await new Promise((r) => setTimeout(r, ms))
}

// Poll until the condition holds or the budget runs out; fixed sleeps race
// the async parser on a loaded box, the poll does not
async function until(fn, budgetMs = 8000) {
  const start = Date.now()
  for (;;) {
    if (fn()) return true
    if (Date.now() - start > budgetMs) return false
    await settle(50)
  }
}

// CM6 parses in background chunks; decorations read a half-parsed doc
// before this resolves
async function fullyParsed(view, budgetMs = 30000) {
  return until(() => syntaxTree(view.state).length >= view.state.doc.length - 1, budgetMs)
}

function census(view) {
  const counts = {}
  for (const el of view.dom.querySelectorAll('[class*="glean-"]')) {
    for (const c of el.className.split(/\s+/)) {
      if (c.startsWith('glean-')) counts[c] = (counts[c] || 0) + 1
    }
  }
  return counts
}

let FAILURES = []

// Decoration plugins rebuild on their own update tick after the tree
// completes; asserting at parse-complete reads a stale census. Two equal
// censuses 100ms apart mean the render pass has settled
async function quiescent(view, budgetMs = 15000) {
  let prev = JSON.stringify(census(view))
  const t0 = Date.now()
  for (;;) {
    await settle(100)
    const cur = JSON.stringify(census(view))
    if (cur === prev) return true
    prev = cur
    if (Date.now() - t0 > budgetMs) return false
  }
}

// reveal puts the caret on the construct first: CM6 renders only the
// viewport and hides syntax the caret has not visited
async function probe(name, text, fn, reveal) {
  const ctx = mount(text)
  await fullyParsed(ctx.view)
  await quiescent(ctx.view)
  if (reveal) {
    const needle = Array.isArray(reveal) ? reveal[0] : reveal
    const offset = Array.isArray(reveal) ? reveal[1] : 0
    const at = text.indexOf(needle)
    if (at >= 0) {
      ctx.view.dispatch({ selection: EditorSelection.cursor(at + offset) })
      await settle(120)
    }
  }
  try {
    await fn(ctx, census(ctx.view))
  } catch (e) {
    FAILURES.push(`${name}: ${e.message.split('\n')[0]}`)
  }
  destroy(ctx)
}

describe('markdown suite audit', () => {
  it('round-trips the whole suite byte-true', async () => {
    const ctx = mount(suiteText)
    await fullyParsed(ctx.view)
    const out = emitMarkdown(ctx.view)
    destroy(ctx)
    expect(out).toBe(suiteText)
  })

  it('renders every construct the engine claims, section by section', async () => {
    FAILURES = []
    await probe('headings', section(1), (ctx, c) => {
      expect(['glean-h1', 'glean-h2', 'glean-h3', 'glean-h4', 'glean-h5', 'glean-h6'].every((k) => c[k] > 0)).toBe(true)
    })
    await probe('blockquotes', section(4), (ctx, c) => {
      expect(c['glean-quote-line']).toBeGreaterThan(0)
      expect(c['glean-quotemark']).toBeGreaterThan(0)
    }, '>')
    await probe('lists', section(5), (ctx, c) => {
      expect(c['glean-list-line']).toBeGreaterThan(0)
      expect(c['glean-bullet']).toBeGreaterThan(0)
      const boxes = ctx.view.dom.querySelectorAll('.glean-taskbox [role=checkbox]').length
      expect(boxes).toBeGreaterThan(0)
    }, '[x]')
    // the fence chip replaces the raw language mark unless the caret sits
    // in the info word itself
    await probe('code fences', section(6), (ctx, c) => {
      expect(c['glean-fence-line']).toBeGreaterThan(0)
      expect(c['glean-codeinfo']).toBeGreaterThan(0)
    }, ['```js', 4])
    await probe('links', section(8), (ctx, c) => {
      expect(c['glean-linktip'] || c['glean-link']).toBeGreaterThan(0)
    })
    await probe('images', section(9), (ctx, c) => {
      expect(c['glean-image'] || c['glean-img']).toBeGreaterThan(0)
    })
    await probe('tables', section(10), (ctx, c) => {
      expect(c['glean-table-line']).toBeGreaterThan(0)
    }, '|')
    await probe('raw html pairs', section(12), (ctx, c) => {
      expect(c['glean-html-strong']).toBeGreaterThan(0)
      expect(c['glean-html-em']).toBeGreaterThan(0)
      expect(c['glean-html-sub']).toBeGreaterThan(0)
      expect(c['glean-html-sup']).toBeGreaterThan(0)
      expect(c['glean-html-kbd']).toBeGreaterThan(0)
      expect(c['glean-html-mark'] || c['glean-html-ins'] || c['glean-html-u']).toBeGreaterThan(0)
    })
    await probe('footnotes', section(13), (ctx, c) => {
      expect(c['glean-fn']).toBeGreaterThan(0)
    }, '[^')
    await probe('highlight marks', section(16), (ctx, c) => {
      expect(c['glean-hl']).toBeGreaterThan(0)
    })
    await probe('math', section(19), (ctx, c) => {
      expect(c['glean-math-inline']).toBeGreaterThan(0)
      expect(c['glean-math-block']).toBeGreaterThan(0)
    })
    await probe('mermaid', section(20), async (ctx, c) => {
      const ok = await until(() => ctx.view.dom.querySelectorAll('.glean-mermaid').length >= 2, 25000)
      expect(ok).toBe(true)
    })
    await probe('alerts', section(21), (ctx, c) => {
      const alertKeys = Object.keys(c).filter((k) => k.startsWith('glean-alert'))
      expect(alertKeys.length).toBeGreaterThan(0)
    })

    expect(FAILURES).toEqual([])
  })

  it('keeps unrendered extended syntax as honest raw text', async () => {
    FAILURES = []
    const probes = [
      ['definition list colon', 'Definition A for term 2.'],
      ['abbreviation block', '*[HTML]: Hyper Text Markup Language'],
      ['toc marker', '[TOC]'],
      ['directive fence', ':::note'],
      ['attr syntax', '{#custom-id}'],
      ['single tilde literal', '~single tilde strike~'],
      ['sub/sup tildes literal', 'H~2~O'],
      ['inline footnote literal', '^[This footnote is written inline'],
      ['entity survives', '&#65;&#66;&#67;'],
    ]
    for (const [name, needle] of probes) {
      const ctx = mount(needle + '\n')
      await fullyParsed(ctx.view)
      const domText = ctx.view.dom.textContent
      destroy(ctx)
      if (!domText.includes(needle)) FAILURES.push(`raw text lost: ${name}`)
    }
    expect(FAILURES).toEqual([])
  })

  it('reveals and hides syntax on the closing-hash heading by caret', async () => {
    const doc = '# Closing hash heading #\n\nbody text here\n'
    const ctx = mount(doc)
    await fullyParsed(ctx.view)
    ctx.view.dispatch({ selection: EditorSelection.cursor(doc.indexOf('body')) })
    await settle(120)
    const away = ctx.view.dom.querySelectorAll('.cm-line')[0].textContent
    ctx.view.dispatch({ selection: EditorSelection.cursor(0) })
    await settle(120)
    const on = ctx.view.dom.querySelectorAll('.cm-line')[0].textContent
    destroy(ctx)
    expect(away.includes(' #')).toBe(false)
    expect(on.includes('#')).toBe(true)
  })
})
