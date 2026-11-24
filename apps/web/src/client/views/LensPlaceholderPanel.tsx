import type { ReactElement } from 'react'
import { LensNav } from '../components/LensNav'
import type { Lens } from '../components/LensNav'

type PanelCopy = { h1Prefix: string; h2: readonly string[]; note: string }

type PlaceholderLens = Exclude<Lens, 'spirit' | 'daylight' | 'whisper'>

const PANELS: Record<PlaceholderLens, PanelCopy> = {
  keyboard: {
    h1Prefix: 'Keyboard Walk',
    h2: ['Tab sequence'],
    note: 'The animated keyboard walk is not built yet.',
  },
}

type LensPlaceholderPanelProps = {
  lens: PlaceholderLens
  hostname: string
  basePath: string
}

/**
 * PLACEHOLDER panel for the Keyboard walk, with the heading outline from the design. Task 2.3
 * replaces it (Daylight is built in task 1.7, the Whisper walk in task 2.2).
 */
export function LensPlaceholderPanel({ lens, hostname, basePath }: LensPlaceholderPanelProps): ReactElement {
  const copy = PANELS[lens]
  return (
    <>
      <h1>
        {copy.h1Prefix}: {hostname}
      </h1>
      <div className="lens-bar">
        <LensNav basePath={basePath} current={lens} />
      </div>
      {copy.h2.map((heading) => (
        <section key={heading} aria-labelledby={`panel-${heading.replace(/\W+/g, '-').toLowerCase()}`}>
          <h2 id={`panel-${heading.replace(/\W+/g, '-').toLowerCase()}`}>{heading}</h2>
          <p>{copy.note}</p>
        </section>
      ))}
    </>
  )
}
