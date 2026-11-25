import { useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { submitAudit } from '../utils/audit-api'
import { recallJobUrl, rememberJobUrl } from '../utils/job-urls'

type SessionEndedProps = {
  /** The expired job. Its URL is looked up so the audit can be started again. */
  jobId: string
}

/**
 * Actions for an audit that has ended (requirement 31.4): "Audit again" re-posts the same URL
 * (only offered while this browser still remembers it, see utils/job-urls: two hours, newest 20,
 * shared by every tab) and "Back to home". Failures to re-post are
 * announced in an assertive region that is always in the DOM.
 */
export function SessionEnded({ jobId }: SessionEndedProps): ReactElement {
  const navigate = useNavigate()
  const url = recallJobUrl(jobId)
  const [error, setError] = useState('')
  const busy = useRef(false)

  const auditAgain = async (): Promise<void> => {
    if (url === undefined || busy.current) return
    busy.current = true
    setError('')
    const result = await submitAudit(url)
    busy.current = false
    if (result.ok) {
      rememberJobUrl(result.id, url)
      navigate(`/seance/${encodeURIComponent(result.id)}`)
    } else {
      setError(result.message)
    }
  }

  return (
    <>
      <p className="form-error" aria-live="assertive">
        {error}
      </p>
      <div className="state-actions">
        {url === undefined ? null : (
          <button type="button" className="button button-primary" onClick={() => void auditAgain()}>
            Audit again
          </button>
        )}
        <Link to="/" className={url === undefined ? 'button button-primary' : 'button'}>
          Back to home
        </Link>
      </div>
    </>
  )
}
