import type { ReactElement } from 'react'
import { LensNav } from '../components/LensNav'
import type { Lens } from '../components/LensNav'

type PanelCopy = { h1Prefix: string; h2: readonly string[]; note: string }

type PlaceholderLens = Exclude<Lens, 'spirit' | 'daylight'>

const PANELS: Record<PlaceholderLens, PanelCopy> = {
  keyboard: {
    h1Prefix: 'Keyboard Walk',
    h2: ['Tab sequence'],
    note: 'The animated keyboard walk is not built yet.',
  },
  whisper: {
    h1Prefix: 'Whisper Walk',
    h2: ['Screen reader announcements'],
    note: 'The whisper walk is not built yet.',
  },
}

type LensPlaceholderPanelProps = {
  lens: PlaceholderLens
  hostname: string
  basePath: string
}

/**
 * PLACEHOLDER panels for the sub-routes with the heading outline from the design. Task 2.2 replaces
 * the Whisper walk and task 2.3 the Keyboard walk (Daylight is built in task 1.7).
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
