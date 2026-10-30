import { isQuery, nextShowcase } from './domain'
import type { Query } from './domain'
import { showcases } from './fixtures'

export interface SavedView { name: string; query: Query }
export const SAVED_KEY = 'bmc:synthetic:saved-view:v1'

export function loadSavedView(storage: Pick<Storage, 'getItem'>): { view: SavedView | null; error: string | null } {
  try {
    const raw = storage.getItem(SAVED_KEY)
    if (!raw) return { view: null, error: null }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('name' in value) ||
      typeof value.name !== 'string' || !('query' in value) || !isQuery(value.query)) {
      throw new Error('Saved view has an unsupported format')
    }
    return { view: { name: value.name, query: value.query }, error: null }
  } catch (error) {
    console.error('Unable to load the saved demo view', error)
    return { view: null, error: 'Your saved demo view could not be read. You can still browse; saving again will replace it.' }
  }
}

export function chooseShowcase(): { index: number; error: string | null } {
  const sample = new Uint32Array(1)
  crypto.getRandomValues(sample)
  const random = sample[0] / 2 ** 32
  try {
    const raw = sessionStorage.getItem('bmc:showcase')
    const previous = raw === null ? null : Number(raw)
    const index = nextShowcase(previous, random, showcases.length)
    sessionStorage.setItem('bmc:showcase', String(index))
    return { index, error: null }
  } catch (error) {
    console.error('Unable to remember the previous demo showcase', error)
    return { index: nextShowcase(null, random, showcases.length), error: 'Browser storage is unavailable. The showcase is random, but may repeat on reload.' }
  }
}
