/**
 * OpenIV `.oiv` `<text>` / `<xml>` content edits (assembly.xml spec 2.1).
 *
 * `<text>`  — line-based: add / insert(where,line,condition) / replace(line,condition) / delete(condition)
 * `<xml>`   — element-based: add(xpath[,append]) / replace(xpath) / remove(xpath)
 *
 * The XML side works at the string level (locate element, splice) so picky game
 * files aren't reformatted. Only plain element-name xpaths with optional `[N]` /
 * `[last()]` are understood; attribute / text predicates are reported unsupported.
 */

export interface OivTextEdit {
  op: 'add' | 'insert' | 'replace' | 'delete'
  where?: 'Before' | 'After'
  line?: string
  condition?: string
  value: string
}

export interface OivXmlEdit {
  op: 'add' | 'replace' | 'remove'
  xpath: string
  append?: string
  /** inner XML for add / replace */
  fragment?: string
}

// ── text ────────────────────────────────────────────────────────────────────

function maskToRegExp(mask: string): RegExp {
  const esc = mask.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc.replace(/\*/g, '.*').replace(/\?/g, '.').replace(/#/g, '\\d')}$`)
}

function lineMatches(line: string, pattern: string, condition = 'Equal'): boolean {
  switch (condition.toLowerCase()) {
    case 'startwith':
      return line.trimStart().startsWith(pattern)
    case 'endwith':
      return line.trimEnd().endsWith(pattern)
    case 'contains':
      return line.includes(pattern)
    case 'mask':
      return maskToRegExp(pattern.trim()).test(line.trim())
    default: // Equal
      return line.trim() === pattern.trim()
  }
}

export function applyTextEdits(text: string, edits: OivTextEdit[]): string {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  let lines = text.split(/\r?\n/)
  for (const e of edits) {
    if (e.op === 'add') {
      lines.push(e.value)
      continue
    }
    if (e.op === 'delete') {
      lines = lines.filter((l) => !lineMatches(l, e.value, e.condition))
      continue
    }
    const idx = lines.findIndex((l) => lineMatches(l, e.line ?? '', e.condition))
    if (idx < 0) continue
    if (e.op === 'replace') {
      lines[idx] = e.value
    } else {
      lines.splice(e.where === 'After' ? idx + 1 : idx, 0, e.value)
    }
  }
  return lines.join(nl)
}

// ── xml (string-level element locator) ──────────────────────────────────────

interface Span {
  openStart: number
  openEnd: number
  innerStart: number
  innerEnd: number
  closeEnd: number
}

/** Find the Nth (1-based) child element named `tag` inside [from, to). */
function findChild(xml: string, tag: string, from: number, to: number, nth: number): Span | null {
  let pos = from
  let count = 0
  const openRe = new RegExp(`<${tag}(\\s[^>]*?)?(/)?>`, 'g')
  while (pos < to) {
    openRe.lastIndex = pos
    const m = openRe.exec(xml)
    if (!m || m.index >= to) return null
    const openStart = m.index
    const openEnd = m.index + m[0].length
    let innerStart = openEnd
    let innerEnd = openEnd
    let closeEnd = openEnd
    if (m[2] === '/') {
      // self-closing
      innerStart = innerEnd = openEnd
      closeEnd = openEnd
    } else {
      // walk to the matching close tag, honouring nesting of the same tag
      let depth = 1
      const scan = new RegExp(`<${tag}(\\s[^>]*?)?(/)?>|</${tag}\\s*>`, 'g')
      scan.lastIndex = openEnd
      let sm: RegExpExecArray | null
      while ((sm = scan.exec(xml))) {
        if (sm[0].startsWith('</')) {
          depth--
          if (depth === 0) {
            innerEnd = sm.index
            closeEnd = sm.index + sm[0].length
            break
          }
        } else if (sm[2] !== '/') {
          depth++
        }
      }
      if (depth !== 0) return null
    }
    count++
    if (count === nth || (nth === -1 && !hasMoreChild(xml, tag, closeEnd, to))) {
      return { openStart, openEnd, innerStart, innerEnd, closeEnd }
    }
    pos = closeEnd
  }
  return null
}

function hasMoreChild(xml: string, tag: string, from: number, to: number): boolean {
  const re = new RegExp(`<${tag}(\\s|/|>)`, 'g')
  re.lastIndex = from
  const m = re.exec(xml)
  return !!m && m.index < to
}

/** Resolve an xpath like `/A/B/C` or `/A/B/Item[10]` / `Item[last()]`. */
function resolveXPath(xml: string, xpath: string): Span | null {
  const parts = xpath.replace(/^\//, '').split('/').filter(Boolean)
  let from = 0
  let to = xml.length
  let span: Span | null = null
  for (const raw of parts) {
    const mm = raw.match(/^([A-Za-z_][\w.-]*)(?:\[(\d+|last\(\))\])?$/)
    if (!mm) return null // predicate we don't understand
    const tag = mm[1]
    const nth = mm[2] === undefined ? 1 : mm[2] === 'last()' ? -1 : Number(mm[2])
    span = findChild(xml, tag, from, to, nth)
    if (!span) return null
    from = span.innerStart
    to = span.innerEnd
  }
  return span
}

function indentOf(xml: string, pos: number): string {
  let s = pos
  while (s > 0 && xml[s - 1] !== '\n') s--
  const m = xml.slice(s, pos).match(/^\s*/)
  return m ? m[0] : ''
}

export function applyXmlEdits(
  xml: string,
  edits: OivXmlEdit[],
): { xml: string; applied: number; unsupported: number } {
  let out = xml
  let applied = 0
  let unsupported = 0
  for (const e of edits) {
    const span = resolveXPath(out, e.xpath)
    if (!span) {
      unsupported++
      continue
    }
    if (e.op === 'remove') {
      let a = span.openStart
      let b = span.closeEnd
      // swallow the whole line if the element sits alone on it
      while (a > 0 && (out[a - 1] === ' ' || out[a - 1] === '\t')) a--
      if (out[b] === '\r') b++
      if (out[b] === '\n') b++
      out = out.slice(0, a) + out.slice(b)
      applied++
      continue
    }
    const frag = (e.fragment ?? '').trim()
    if (!frag) {
      unsupported++
      continue
    }
    if (e.op === 'replace') {
      out = out.slice(0, span.openStart) + frag + out.slice(span.closeEnd)
      applied++
      continue
    }
    // add — insert frag as a child of the matched element
    const childIndent = indentOf(out, span.openStart) + '\t'
    if ((e.append ?? '').toLowerCase() === 'first') {
      const nlAfterOpen = out.indexOf('\n', span.openEnd)
      const at = nlAfterOpen >= 0 && nlAfterOpen < span.innerEnd ? nlAfterOpen + 1 : span.innerStart
      out = out.slice(0, at) + childIndent + frag + '\n' + out.slice(at)
    } else {
      let at = span.innerEnd
      while (at > span.innerStart && /\s/.test(out[at - 1])) at--
      out = out.slice(0, at) + '\n' + childIndent + frag + out.slice(at)
    }
    applied++
  }
  return { xml: out, applied, unsupported }
}
