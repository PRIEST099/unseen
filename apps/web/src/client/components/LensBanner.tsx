import type { ReactElement } from 'react'
import corridor from '../assets/manor/corridor.webp'
import corridorSmall from '../assets/manor/corridor-768.webp'
import daylight from '../assets/manor/lens-daylight.webp'
import daylightSmall from '../assets/manor/lens-daylight-800.webp'
import spirit from '../assets/manor/lens-spirit.webp'
import spiritSmall from '../assets/manor/lens-spirit-800.webp'
import whisper from '../assets/manor/lens-whisper.webp'
import whisperSmall from '../assets/manor/lens-whisper-800.webp'
import type { Lens } from './LensNav'

type Banner = { src: string; small: string; smallWidth: number; width: number; height: number; position: string }

/**
 * One painting of the manor per lens: the house in fog for Spirit Sight, the corridor for the
 * Keyboard walk, the whispering gramophone for the Whisper walk, and the library at sunrise for
 * Daylight mode, the morning after.
 */
const BANNERS: Record<Lens, Banner> = {
  spirit: { src: spirit, small: spiritSmall, smallWidth: 800, width: 1600, height: 686, position: '50% 45%' },
  keyboard: { src: corridor, small: corridorSmall, smallWidth: 768, width: 1536, height: 1024, position: '50% 55%' },
  whisper: { src: whisper, small: whisperSmall, smallWidth: 800, width: 1600, height: 686, position: '30% 50%' },
  daylight: { src: daylight, small: daylightSmall, smallWidth: 800, width: 1600, height: 686, position: '50% 55%' },
}

/** A decorative framed painting above the lens. It carries no text; the h1 below names the view. */
export function LensBanner({ lens }: { lens: Lens }): ReactElement {
  const banner = BANNERS[lens]
  return (
    <div className={`painting lens-banner lens-banner-${lens}`}>
      <img
        src={banner.src}
        srcSet={`${banner.small} ${banner.smallWidth}w, ${banner.src} ${banner.width}w`}
        sizes="(max-width: 48rem) 100vw, 96rem"
        width={banner.width}
        height={banner.height}
        alt=""
        style={{ objectPosition: banner.position }}
      />
    </div>
  )
}
