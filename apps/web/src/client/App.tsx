import type { ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppHeader } from './components/AppHeader'
import { AuditResultView } from './views/AuditResultView'
import { LandingView } from './views/LandingView'
import { NotFoundView } from './views/NotFoundView'
import { SeanceView } from './views/SeanceView'

export function App(): ReactElement {
  return (
    <div className="app-shell">
      <div id="skip-link-slot" />
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <AppHeader />
      <Routes>
        <Route path="/" element={<LandingView />} />
        <Route path="/seance/:jobId" element={<SeanceView />} />
        <Route path="/audit/:jobId/*" element={<AuditResultView source="job" />} />
        <Route path="/sample/:sampleId/*" element={<AuditResultView source="sample" />} />
        <Route path="*" element={<NotFoundView />} />
      </Routes>
      <footer className="app-footer">
        <p>© THE UNSEEN</p>
      </footer>
    </div>
  )
}
