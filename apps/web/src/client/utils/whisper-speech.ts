import type { Haunting } from '@the-unseen/core'

/** Whisper limits from the design system: pitch <= 0.8, rate <= 0.85. */
export const WHISPER_PITCH = 0.8
export const WHISPER_RATE = 0.85

/**
 * The haunting spoken when Spirit Sight opens with sound on: the first Wraith that has a
 * screen-reader announcement, else the first Restless one. `ordered` is in reading order.
 */
export function pickSpokenHaunting(ordered: readonly Haunting[]): Haunting | undefined {
  const speakable = (haunting: Haunting): boolean => (haunting.speech ?? '').trim() !== ''
  return (
    ordered.find((haunting) => haunting.severity === 'Wraith' && speakable(haunting)) ??
    ordered.find((haunting) => haunting.severity === 'Restless' && speakable(haunting))
  )
}

/** Speaks `text` in a whisper. Returns false when the browser has no speech synthesis. */
export function speakWhisper(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') {
    return false
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.pitch = WHISPER_PITCH
  utterance.rate = WHISPER_RATE
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return true
}
