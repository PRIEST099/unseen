import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/cormorant-garamond/400.css'
import './styles/tokens.css'
import './styles/global.css'
import './styles/spirit-sight.css'
import './styles/daylight.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ReducedMotionProvider } from './contexts/ReducedMotionContext'
import { SoundProvider } from './contexts/SoundContext'

const container = document.getElementById('root')

if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <ReducedMotionProvider>
          <SoundProvider>
            <App />
          </SoundProvider>
        </ReducedMotionProvider>
      </BrowserRouter>
    </StrictMode>,
  )
}
