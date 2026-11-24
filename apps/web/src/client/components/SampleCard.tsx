import type { ReactElement } from 'react'
import type { SampleMetadata } from '../utils/samples'

type SampleCardProps = SampleMetadata & {
  onSelect: (id: string) => void
}

export function SampleCard({ id, name, score, thumbnailUrl, onSelect }: SampleCardProps): ReactElement {
  return (
    <button type="button" className="sample-card" onClick={() => onSelect(id)}>
      <img src={thumbnailUrl} alt="" loading="lazy" />
      <span className="sample-card-name">{name}</span>
      <span className="sample-card-score">Haunting Score: {score}</span>
    </button>
  )
}
