/**
 * A small, dependency-free XML reader for well-formed documents such as the
 * UBL 2.1 electronic invoices of SUNAT. It builds an element tree (comments,
 * processing instructions and the DOCTYPE are skipped; CDATA and entities
 * become text) and works the same in the browser and in Node, so the invoice
 * parser can be unit tested without a DOM.
 */

export type XmlElement = {
  /** Qualified name as written ("cbc:ID"). */
  name: string
  /** Name without the namespace prefix ("ID"). */
  local: string
  attrs: Record<string, string>
  children: XmlElement[]
  /** Direct text content (entities decoded, CDATA included), not trimmed. */
  text: string
}

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const localOf = (name: string) => name.slice(name.indexOf(":") + 1)

/** Attributes of a start tag body (`a="1" b='2'`). */
function readAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  for (let m = re.exec(body); m; m = re.exec(body)) {
    attrs[m[1] as string] = decode(m[3] ?? m[4] ?? "")
  }
  return attrs
}

/** Skips a markup construct starting at `i` that is not an element; returns the index after it, or -1. */
function skipSpecial(src: string, i: number, onCdata: (text: string) => void): number {
  const pairs: [string, string][] = [
    ["<?", "?>"],
    ["<!--", "-->"],
  ]
  for (const [open, close] of pairs) {
    if (src.startsWith(open, i)) {
      const end = src.indexOf(close, i + open.length)
      if (end < 0) throw new XmlError(`${open} sin cerrar`)
      return end + close.length
    }
  }
  if (src.startsWith("<![CDATA[", i)) {
    const end = src.indexOf("]]>", i + 9)
    if (end < 0) throw new XmlError("CDATA sin cerrar")
    onCdata(src.slice(i + 9, end))
    return end + 3
  }
  if (src.startsWith("<!", i)) {
    const end = src.indexOf(">", i + 2)
    if (end < 0) throw new XmlError("Declaración sin cerrar")
    return end + 1
  }
  return -1
}

type ParseState = { stack: XmlElement[]; root: XmlElement | null }

/** A closing tag: it must match the open element. */
function closeTag(st: ParseState, raw: string): void {
  const name = raw.slice(1).trim()
  const open = st.stack.pop()
  if (!open || open.name !== name) throw new XmlError(`Cierre inesperado </${name}>`)
  if (st.stack.length === 0) st.root = open
}

/** An opening (or self-closing) tag: a new element under the open one. */
function openTag(st: ParseState, raw: string): void {
  const selfClosing = raw.endsWith("/")
  const body = selfClosing ? raw.slice(0, -1) : raw
  const nameEnd = body.search(/\s|$/)
  const name = body.slice(0, nameEnd)
  if (!name) throw new XmlError("Etiqueta vacía")
  const el: XmlElement = {
    name,
    local: localOf(name),
    attrs: readAttrs(body.slice(nameEnd)),
    children: [],
    text: "",
  }
  const parent = st.stack[st.stack.length - 1]
  if (parent) parent.children.push(el)
  else if (st.root) throw new XmlError("Más de un elemento raíz")
  if (!selfClosing) st.stack.push(el)
  else if (!parent) st.root = el
}

/** Parses an XML document and returns its root element. Throws XmlError when malformed. */
export function parseXml(source: string): XmlElement {
  // Without the byte order mark some editors and SUNAT downloads start with.
  const src = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const st: ParseState = { stack: [], root: null }
  const addText = (t: string) => {
    const top = st.stack[st.stack.length - 1]
    if (top) top.text += t
  }
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf("<", i)
    if (lt < 0) {
      addText(decode(src.slice(i)))
      break
    }
    if (lt > i) addText(decode(src.slice(i, lt)))
    const special = skipSpecial(src, lt, addText)
    if (special >= 0) {
      i = special
      continue
    }
    const gt = src.indexOf(">", lt)
    if (gt < 0) throw new XmlError("Etiqueta sin cerrar")
    const raw = src.slice(lt + 1, gt)
    i = gt + 1
    if (raw.startsWith("/")) closeTag(st, raw)
    else openTag(st, raw)
  }
  if (st.stack.length > 0) throw new XmlError(`<${st.stack[st.stack.length - 1]?.name}> sin cerrar`)
  if (!st.root) throw new XmlError("No es un XML")
  return st.root
}

/** Direct children named `local` (any namespace prefix). */
export function childrenOf(el: XmlElement | null | undefined, local: string): XmlElement[] {
  return el ? el.children.filter((c) => c.local === local) : []
}

/** The element at a path of local names from `el` (first match at each step). */
export function at(el: XmlElement | null | undefined, ...path: string[]): XmlElement | null {
  let cur: XmlElement | null = el ?? null
  for (const local of path) {
    cur = childrenOf(cur, local)[0] ?? null
    if (!cur) return null
  }
  return cur
}

/** Trimmed text at a path, or null when missing or empty. */
export function textAt(el: XmlElement | null | undefined, ...path: string[]): string | null {
  const t = at(el, ...path)?.text.trim()
  return t ? t : null
}
