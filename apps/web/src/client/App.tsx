import type { ReactElement } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppHeader } from './components/AppHeader'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AnnouncerProvider } from './contexts/AnnouncerContext'
import { useAmbientDrone } from './hooks/useAmbientDrone'
import { replayConfig } from './utils/replay-config'
import { AuditResultView } from './views/AuditResultView'
import { LandingView } from './views/LandingView'
import { NotFoundView } from './views/NotFoundView'
import { SeanceView } from './views/SeanceView'

export function App(): ReactElement {
  useAmbientDrone()
  const { pathname } = useLocation()
  return (
    <AnnouncerProvider>
      <div className="app-shell">
        <div id="skip-link-slot" />
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <AppHeader />
        <ErrorBoundary resetKey={pathname}>
          <Routes>
            <Route path="/" element={<LandingView />} />
            {/* The replay edition has no jobs: these routes fall through to "Page not found". */}
            {!replayConfig.replay && <Route path="/seance/:jobId" element={<SeanceView />} />}
            {!replayConfig.replay && <Route path="/audit/:jobId/*" element={<AuditResultView source="job" />} />}
            <Route path="/sample/:sampleId/*" element={<AuditResultView source="sample" />} />
            <Route path="*" element={<NotFoundView />} />
          </Routes>
        </ErrorBoundary>
        <footer className="app-footer">
          <p>© THE UNSEEN</p>
        </footer>
      </div>
    </AnnouncerProvider>
  )
}
