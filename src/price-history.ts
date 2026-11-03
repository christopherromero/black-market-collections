import type { Finish } from './domain'
import type { QuoteObservation } from './quote-store'

export function capturedPriceChange(observations: QuoteObservation[], finish: Finish) {
  const ordered = [...observations].sort((a, b) => a.retrievedAt.localeCompare(b.retrievedAt))
  const first = ordered.find(observation => observation.cents[finish] !== null)
  const last = ordered.at(-1)
  const start = first?.cents[finish], end = last?.cents[finish]
  if (!first || !last || first.retrievedAt === last.retrievedAt || start === null || start === undefined || end === null || end === undefined) return null
  return { cents: end - start, percent: start === 0 ? null : (end - start) / start * 100 }
}
