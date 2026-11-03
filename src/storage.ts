import { isQuery } from './domain'
import type { Query } from './domain'
import { parseMoxfield } from './moxfield'
import type { ImportPreview } from './moxfield'

export interface SavedView { name: string; query: Query }
export const SAVED_KEY = 'bmc:synthetic:saved-view:v1'
export const COLLECTION_KEY = 'bmc:local:moxfield:v1'

export function loadCollection(storage: Pick<Storage, 'getItem'>): { preview: ImportPreview | null; error: string | null } {
  try {
    const raw = storage.getItem(COLLECTION_KEY)
    if (!raw) return { preview: null, error: null }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('csv' in value) || typeof value.csv !== 'string')
      throw new Error('Unsupported collection format')
    const preview = parseMoxfield(value.csv)
    if (preview.errors.length) throw new Error('Invalid collection')
    return { preview, error: null }
  } catch {
    // JSON/parser errors can contain private text: never log the exception.
    return { preview: null, error: 'Local collection could not be read. No collection loaded; the stored collection has not been deleted. Check browser storage permissions and reload, or choose a valid export from Import collection.' }
  }
}

export function storeCollection(storage: Pick<Storage, 'setItem'>, csv: string): ImportPreview {
  const preview = parseMoxfield(csv)
  if (preview.errors.length) throw new Error('File validation failed. Fix every reported row before applying.')
  storage.setItem(COLLECTION_KEY, JSON.stringify({ version: 1, csv }))
  return preview
}

export function loadSavedView(storage: Pick<Storage, 'getItem'>): { view: SavedView | null; error: string | null } {
  try {
    const raw = storage.getItem(SAVED_KEY)
    if (!raw) return { view: null, error: null }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('name' in value) ||
      typeof value.name !== 'string' || !('query' in value) || !value.query || typeof value.query !== 'object' || Array.isArray(value.query)) {
      throw new Error('Saved view has an unsupported format')
    }
    const query = { sets: [], excludeSets: false, ...value.query }
    if (!isQuery(query)) throw new Error('Saved view has an unsupported format')
    return { view: { name: value.name, query }, error: null }
  } catch {
    console.error('Unable to load the saved view')
    return { view: null, error: 'Your saved filters could not be read. You can still browse; saving again will replace them.' }
  }
}
