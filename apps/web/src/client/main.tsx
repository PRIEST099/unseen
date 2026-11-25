import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/cinzel-decorative/700.css'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'
import './styles/tokens.css'
import './styles/global.css'
import './styles/spirit-sight.css'
import './styles/daylight.css'
import './styles/whisper-walk.css'
import './styles/keyboard-walk.css'
import './styles/manor.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ReducedMotionProvider } from './contexts/ReducedMotionContext'
import { SoundProvider } from './contexts/SoundContext'
import { replayConfig } from './utils/replay-config'

const container = document.getElementById('root')

if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter basename={replayConfig.basePath === '/' ? undefined : replayConfig.basePath.replace(/\/$/, '')}>
        <ReducedMotionProvider>
          <SoundProvider>
            <App />
          </SoundProvider>
        </ReducedMotionProvider>
      </BrowserRouter>
    </StrictMode>,
  )
}
