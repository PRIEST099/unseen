import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const container = document.getElementById('root')

if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <main id="main" tabIndex={-1}>
        <h1>THE UNSEEN</h1>
      </main>
    </StrictMode>,
  )
}
