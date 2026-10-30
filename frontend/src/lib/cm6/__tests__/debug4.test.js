import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import './cm6dom'
import { syntaxTree } from '@codemirror/language'
import { createEditor } from '../editor'

const SUITE = resolve(process.cwd(), '../markdown-test-suite_2.md')
const suiteText = readFileSync(SUITE, 'utf8')

describe('debug section 4', () => {
  it('dumps census and line classes', async () => {
    const start = suiteText.indexOf('## 4.')
    const next = suiteText.slice(start + 1).search(/\n## \d/)
    const text = suiteText.slice(start, start + 1 + next) + '\n'
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = createEditor({ parent, markdown: text, starline: null })
    const until = async (fn, ms) => {
      const t0 = Date.now()
      for (;;) {
        if (fn()) return
        if (Date.now() - t0 > ms) return
        await new Promise((r) => setTimeout(r, 50))
      }
    }
    await until(() => syntaxTree(view.state).length >= view.state.doc.length - 1, 20000)
    await new Promise((r) => setTimeout(r, 200))
    const counts = {}
    for (const el of view.dom.querySelectorAll('[class*="glean-"]')) {
      for (const c of el.className.split(/\s+/)) if (c.startsWith('glean-')) counts[c] = (counts[c] || 0) + 1
    }
    console.log('DOC LINES:', view.state.doc.lines, 'DOM LINES:', view.dom.querySelectorAll('.cm-line').length)
    console.log('CENSUS:', JSON.stringify(counts))
    console.log('LINE CLASSES:', [...view.dom.querySelectorAll('.cm-line')].slice(0, 6).map((l) => l.className))
    console.log('TREE HAS QUOTE:', JSON.stringify(syntaxTree(view.state).topNode.toString().slice(0, 400)))
    view.destroy()
    parent.remove()
  })
})
