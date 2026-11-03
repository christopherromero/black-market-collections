import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle, Panel } from '../components'
import { MAX_CSV_BYTES, parseMoxfield } from '../moxfield'
import type { ImportPreview } from '../moxfield'
import { useCollection } from '../state'

export default function ImportCollection() {
  const { source, holdings, applyImport, enableDemo, exitDemo, clearCollection } = useCollection()
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [applied, setApplied] = useState(false)
  const selection = useRef(0)
  return <>
    <PageTitle title="Import collection"><Link className="text-link" to="/collection">Back to collection</Link></PageTitle>
    <Panel title="Moxfield export">
      <p>Your file stays in this browser, never uploaded. {source === 'empty' ? 'No collection loaded.' : source === 'demo' ? 'Temporary demo active; your saved collection is unchanged.' : `${holdings.length} entries currently saved.`}</p>
      <label>Moxfield export<input type="file" accept=".csv,text/csv" onChange={async event => {
        const token = ++selection.current
        const file = event.target.files?.[0]
        // Permit selecting the same corrected file again, including after reset.
        event.target.value = ''
        setCsv(''); setPreview(null); setError(''); setApplied(false)
        if (!file) { setReading(false); return }
        if (file.size > MAX_CSV_BYTES) { setReading(false); setError('Choose a file of at most 8 MiB.'); return }
        setReading(true)
        try {
          const text = await file.text()
          if (selection.current !== token) return
          setCsv(text); setPreview(parseMoxfield(text))
        } catch { if (selection.current === token) setError('The file could not be read. Choose it again and check local file permissions.') }
        finally { if (selection.current === token) setReading(false) }
      }} /></label>
      {reading && <p role="status">Reading locally…</p>}
      {error && <p role="alert" className="notice warning">{error}</p>}
      {preview && <section aria-label="Import preview">
        <h3>Import preview</h3>
        <p>Entries are saved records, not unique names: 1 entry can hold 4 copies.</p>
        {preview.errors.length ? <div role="alert"><p>{preview.errors.length} errors. Nothing will be replaced; fix every error and choose the corrected file.</p>
          <ul>{preview.errors.slice(0, 50).map((issue, i) => <li key={i}>Row {issue.row}, {issue.field}: {issue.message}</li>)}</ul>
          {preview.errors.length > 50 && <p>Showing the first 50 errors of {preview.errors.length}.</p>}
        </div> : <><p><strong>{preview.rows} entries / {preview.copies} copies</strong>. All entries validated.</p>
          <p className="notice warning">Replace your entire saved collection? This cannot be undone here. Keep your original export as a backup.</p>
          <button className="button primary" disabled={reading || applied} onClick={() => {
            if (applyImport(csv)) { setApplied(true); setCsv(''); setError('') }
            else setError('Replacement failed. Your previous collection remains active. Check storage permissions/space and retry.')
          }}>Replace collection with {preview.rows} {preview.rows === 1 ? 'entry' : 'entries'}</button>
        </>}
      </section>}
      {applied && <p role="status">Collection saved locally. <Link className="text-link" to="/collection">Browse collection</Link></p>}
    </Panel>
    <details className="collection-totals"><summary>Demo & saved collection</summary>
    <Panel title="Optional temporary demo">
      <p>Explore fictional cards without changing your saved collection. Reload or exit to return.</p>
      <button className="button ghost" onClick={() => {
        if (source === 'demo') exitDemo()
        else enableDemo()
        setConfirmClear(false)
      }}>{source === 'demo' ? 'Exit demo' : 'Try demo'}</button>
    </Panel>
    <Panel title="Clear saved collection">
      <p>Remove the saved collection from this browser. Keep your original export to restore it. Saved filters and public metadata remain.</p>
      <label className="check-label"><input type="checkbox" checked={confirmClear} onChange={event => setConfirmClear(event.target.checked)} />I understand this removes my imported collection from this browser.</label>
      <button className="button ghost" disabled={!confirmClear} onClick={() => {
        if (clearCollection()) { selection.current++; setReading(false); setConfirmClear(false); setPreview(null); setCsv(''); setApplied(false); setError('') }
        else setError('Clear failed. Check browser storage permissions and retry.')
      }}>Clear saved collection</button>
    </Panel>
    </details>
  </>
}
