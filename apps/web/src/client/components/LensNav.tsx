import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

export type Lens = 'spirit' | 'keyboard' | 'whisper' | 'daylight'

const LENSES: ReadonlyArray<{ lens: Lens; suffix: string; label: string }> = [
  { lens: 'spirit', suffix: '', label: 'Spirit Sight' },
  { lens: 'keyboard', suffix: '/keyboard', label: 'Keyboard walk' },
  { lens: 'whisper', suffix: '/whisper', label: 'Whisper walk' },
  { lens: 'daylight', suffix: '/daylight', label: 'Daylight mode' },
]

type LensNavProps = { basePath: string; current: Lens }

/** Links between the four lenses on one audit (the numbered step bar: reveal, walk, listen, report). */
export function LensNav({ basePath, current }: LensNavProps): ReactElement {
  return (
    <nav aria-label="Audit views">
      <ol className="lens-nav">
        {LENSES.map(({ lens, suffix, label }) => (
          <li key={lens}>
            <Link to={`${basePath}${suffix}`} aria-current={lens === current ? 'page' : undefined}>
              {label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
