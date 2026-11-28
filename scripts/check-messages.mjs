// Fails when es.json and en.json don't have exactly the same keys / ICU placeholders.
import { readFileSync } from 'node:fs'
const load = (l) => JSON.parse(readFileSync(new URL(`../src/messages/${l}.json`, import.meta.url), 'utf8'))
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]])
const en = Object.fromEntries(flat(load('en'))), es = Object.fromEntries(flat(load('es')))
// ICU-aware: variables are the argument names, plus any variable used inside plural/select branches.
// Branch labels (one/other/=0 …) and the literal words in branches are not variables.
const vars = (s) => {
  const out = new Set()
  const walk = (str) => {
    for (let i = 0; i < str.length; i++) {
      if (str[i] !== '{') continue
      let depth = 1, j = i + 1
      while (j < str.length && depth) { if (str[j] === '{') depth++; else if (str[j] === '}') depth--; j++ }
      const body = str.slice(i + 1, j - 1)
      const m = body.match(/^\s*(\w+)\s*(?:,\s*(plural|select|selectordinal)\s*,(.*))?$/s)
      if (m) {
        out.add(m[1])
        if (m[3]) for (const b of m[3].matchAll(/[\w=]+\s*\{/g)) { /* branches handled below */ }
        if (m[3]) {
          const rest = m[3]
          let k = 0
          while (k < rest.length) {
            const o = rest.indexOf('{', k)
            if (o < 0) break
            let d = 1, e = o + 1
            while (e < rest.length && d) { if (rest[e] === '{') d++; else if (rest[e] === '}') d--; e++ }
            walk(rest.slice(o + 1, e - 1).replace(/#/g, ''))
            k = e
          }
        }
      } else walk(body)
      i = j - 1
    }
  }
  walk(String(s))
  return [...out].sort().join(',')
}
let bad = 0
for (const k of Object.keys(en)) {
  if (!(k in es)) { console.error('missing in es:', k); bad++ }
  else if (vars(en[k]) !== vars(es[k])) { console.error('placeholder mismatch:', k, vars(en[k]), '|', vars(es[k])); bad++ }
  else if (!String(es[k]).trim()) { console.error('empty es:', k); bad++ }
}
// Release notes: every entry in changelog.ts needs a Spanish version in changelogEs.ts (same id, same number of items).
const src = (n) => readFileSync(new URL(`../src/lib/${n}.ts`, import.meta.url), 'utf8')
const enIds = [...src('changelog').matchAll(/^\s*id: '([^']+)'/gm)].map((m) => m[1])
const esIds = new Set([...src('changelogEs').matchAll(/^  '([^']+)': \{/gm)].map((m) => m[1]))
for (const id of enIds) if (!esIds.has(id)) { console.error('changelog entry without Spanish text:', id); bad++ }
for (const id of esIds) if (!enIds.includes(id)) { console.error('Spanish changelog entry without English entry:', id); bad++ }
for (const k of Object.keys(es)) if (!(k in en)) { console.error('extra in es:', k); bad++ }
console.log(bad ? `${bad} problem(s)` : `OK: ${Object.keys(en).length} keys in both languages`)
process.exit(bad ? 1 : 0)
