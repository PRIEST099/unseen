import { useEffect } from 'react'

const SITE_NAME = 'THE UNSEEN'

/** "{view} – THE UNSEEN"; the landing view is just the site name. */
export function formatDocumentTitle(title: string): string {
  return title === SITE_NAME ? SITE_NAME : `${title} – ${SITE_NAME}`
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = formatDocumentTitle(title)
  }, [title])
}
