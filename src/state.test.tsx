import { describe, expect, it, vi } from 'vitest'
import { EMPTY_QUERY } from './domain'
import { loadSavedView } from './storage'

describe('saved demo view storage', () => {
  it('reads and validates a named view', () => {
    expect(loadSavedView({ getItem: () => JSON.stringify({ name: 'Sultai', query: { ...EMPTY_QUERY, colors: ['U', 'B', 'G'] } }) }).view?.name).toBe('Sultai')
    expect(loadSavedView({ getItem: () => null })).toEqual({ view: null, error: null })
  })
  it('surfaces corruption and browser permission errors instead of claiming success', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const storage of [{ getItem: () => 'broken-json' }, { getItem: () => { throw new DOMException('Denied', 'SecurityError') } }, { getItem: () => '{"name":"Old","query":{}}' }]) {
      const result = loadSavedView(storage)
      expect(result.view).toBeNull()
      expect(result.error).toContain('could not be read')
    }
    expect(log).toHaveBeenCalledTimes(3)
    log.mockRestore()
  })
})
