import type { Finish, Holding } from './domain'

export const MOXFIELD_HEADERS = ['Count', 'Tradelist Count', 'Name', 'Edition', 'Condition', 'Language', 'Foil', 'Tags', 'Last Modified', 'Collector Number', 'Alter', 'Proxy', 'Purchase Price'] as const
export const MAX_CSV_BYTES = 8 * 1024 * 1024
export interface ImportIssue { row: number; field: string; message: string }
export interface ImportPreview { holdings: Holding[]; rows: number; copies: number; errors: ImportIssue[] }

// Strict RFC-style quoting, with physical line numbers for actionable errors.
// No cell contents are included in errors, logs, or network requests.
function csvRecords(input: string): { records: { line: number; cells: string[] }[]; errors: ImportIssue[] } {
  const text = input.replace(/^\uFEFF/, '')
  const records: { line: number; cells: string[] }[] = []
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, start = 1, touched = false
  const fail = (message: string) => ({ records: [], errors: [{ row: line, field: 'File', message }] })
  const endCell = () => { cells.push(cell); cell = ''; closed = false }
  const endRecord = () => {
    if (touched || cells.length || cell) { endCell(); records.push({ line: start, cells }) }
    cells = []; cell = ''; touched = false; closed = false
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else { quoted = false; closed = true }
      } else {
        cell += char
        if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line++
      }
    } else if (char === ',' ) { endCell(); touched = true }
    else if (char === '\r' || char === '\n') {
      endRecord()
      if (char === '\r' && text[i + 1] === '\n') i++
      line++; start = line
    } else if (closed) return fail('Unexpected text after a closing quote. Separate cells with a comma.')
    else if (char === '"') {
      if (cell) return fail('Quote inside an unquoted cell. Quote the whole cell and double embedded quotes.')
      quoted = true; touched = true
    } else { cell += char; touched = true }
  }
  if (quoted) return fail(`Unclosed quoted cell starting in record at line ${start}. Close the quote.`)
  endRecord()
  return { records, errors: [] }
}

export function parseMoxfield(text: string): ImportPreview {
  const empty = { holdings: [], rows: 0, copies: 0 }
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES)
    return { ...empty, errors: [{ row: 1, field: 'File', message: 'File exceeds the 8 MiB local import limit. Split the export before importing.' }] }
  const parsed = csvRecords(text)
  if (parsed.errors.length) return { ...empty, errors: parsed.errors }
  const [header, ...records] = parsed.records
  if (!header) return { ...empty, errors: [{ row: 1, field: 'Header', message: 'Choose a Moxfield export with a header and at least one holding.' }] }
  const errors: ImportIssue[] = []
  const names = header.cells
  for (const name of MOXFIELD_HEADERS) {
    if (!names.includes(name)) errors.push({ row: header.line, field: name, message: 'Required header is missing. Choose a Moxfield export with this column.' })
    if (names.filter(value => value === name).length > 1) errors.push({ row: header.line, field: name, message: 'Duplicate header. Keep exactly one column with this name.' })
  }
  if (names.some(name => !(MOXFIELD_HEADERS as readonly string[]).includes(name)))
    errors.push({ row: header.line, field: 'Header', message: 'Unrecognized columns are not supported. Use the standard 13-column Moxfield collection export.' })
  if (errors.length) return { ...empty, rows: records.length, errors }
  if (!records.length || records.length > 20000)
    return { ...empty, errors: [{ row: 2, field: 'File', message: 'Import requires 1–20,000 holding rows. Empty files cannot replace a collection.' }] }
  const holdings: Holding[] = []
  for (const record of records) {
    const issue = (field: string, message: string) => errors.push({ row: record.line, field, message })
    if (record.cells.length !== names.length) { issue('File', 'Column count does not match the header. Quote names or tags containing commas.'); continue }
    const get = (name: typeof MOXFIELD_HEADERS[number]) => record.cells[names.indexOf(name)]
    const before = errors.length
    for (const key of ['Name', 'Edition', 'Condition', 'Language', 'Collector Number'] as const)
      if (!get(key).trim()) issue(key, 'A value is required; restore it from the original export.')
    const integer = (key: 'Count' | 'Tradelist Count', minimum: number) => {
      const value = get(key)
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum)
        issue(key, `Use a whole number of at least ${minimum}.`)
      return Number(value)
    }
    const quantity = integer('Count', 1)
    const tradelistCount = integer('Tradelist Count', 0)
    if (tradelistCount > quantity) issue('Tradelist Count', 'Tradelist copies cannot exceed Count.')
    const finishes: Record<string, Finish> = { '': 'Nonfoil', nonfoil: 'Nonfoil', foil: 'Foil', etched: 'Etched' }
    const foilKey = get('Foil').toLowerCase()
    const finish = Object.hasOwn(finishes, foilKey) ? finishes[foilKey] : undefined
    if (!finish) issue('Foil', 'Use blank (nonfoil), nonfoil, foil, or etched. Other finishes are not supported.')
    for (const key of ['Alter', 'Proxy'] as const)
      if (!/^(true|false)$/i.test(get(key))) issue(key, 'Use True or False; the flag is preserved, not inferred.')
    const purchasePrice = get('Purchase Price')
    if (purchasePrice !== '' && (!/^\d+(\.\d+)?$/.test(purchasePrice) || !Number.isFinite(Number(purchasePrice))))
      issue('Purchase Price', 'Use a nonnegative decimal or leave blank. Currency symbols and currencies are not inferred.')
    if (errors.length !== before) continue
    const printing = { set: get('Edition'), collectorNumber: get('Collector Number'), language: get('Language') }
    holdings.push({
      id: `moxfield-${record.line}`,
      card: { id: `moxfield:${get('Name')}`, name: get('Name'), colors: [], type: '', manaValue: null, rarity: null, rules: '', printing },
      ...printing, quantity, finish: finish!, condition: get('Condition'), binder: 'Unassigned (Moxfield)',
      priceCents: null, allocations: [],
      moxfield: { row: record.line, foil: get('Foil'), tags: get('Tags'), lastModified: get('Last Modified'), alter: get('Alter'), proxy: get('Proxy'), tradelistCount, purchasePrice },
    })
  }
  const copies = holdings.reduce((sum, row) => sum + row.quantity, 0)
  if (!Number.isSafeInteger(copies)) errors.push({ row: 2, field: 'Count', message: 'Total copies exceed the supported safe integer range.' })
  // An invalid file is never a partially successful import.
  return { holdings: errors.length ? [] : holdings, rows: records.length, copies: errors.length ? 0 : copies, errors }
}
