import { WHISPER_RATE } from './whisper-speech'

/** Speeds offered by the Whisper walk (requirement 14.4). Speeds above 1x are not offered. */
export const SPEED_OPTIONS = [0.5, 0.75, 1] as const
export type WhisperSpeed = (typeof SPEED_OPTIONS)[number]

export const MIN_WHISPER_RATE = 0.4
/** Shortest time a caption stays up in captions-only mode, in ms. */
export const MIN_CAPTION_MS = 1500
/** Time per character in captions-only mode, in ms. */
export const CAPTION_MS_PER_CHAR = 60
/** Gap between two utterances at 1x, in ms. A faster speed shortens the gap instead of raising the rate. */
export const PAUSE_AT_1X_MS = 400

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** `rate = clamp(0.85 * speed, 0.4, 0.85)`: never above the whisper ceiling (requirement 14.2). */
export function whisperRate(speed: number): number {
  return clamp(WHISPER_RATE * speed, MIN_WHISPER_RATE, WHISPER_RATE)
}

/** How long a caption stays when nothing is spoken: `max(1500 ms, 60 ms x characters)`. */
export function captionDelayMs(text: string): number {
  return Math.max(MIN_CAPTION_MS, CAPTION_MS_PER_CHAR * text.length)
}

/** A rough speaking time: the caption delay, stretched when the rate is below the ceiling. */
export function estimateSpeechMs(text: string, rate: number): number {
  return (captionDelayMs(text) * WHISPER_RATE) / clamp(rate, MIN_WHISPER_RATE, WHISPER_RATE)
}

/** The utterance is treated as finished after twice its estimated duration (requirement 14.11). */
export function utteranceTimeoutMs(text: string, rate: number): number {
  return 2 * estimateSpeechMs(text, rate)
}

/** The gap before the next utterance; shorter at higher speeds. */
export function pauseBetweenMs(speed: number): number {
  return Math.round(PAUSE_AT_1X_MS / Math.max(speed, 0.1))
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return clamp(Math.trunc(index), 0, length - 1)
}

/** Reads a `<select>` value back into one of the offered speeds (1x when unknown). */
export function parseSpeed(value: string): WhisperSpeed {
  const parsed = Number(value)
  return SPEED_OPTIONS.find((option) => option === parsed) ?? 1
}

export function counterText(index: number, total: number): string {
  return `${index + 1} of ${total}`
}

export function speedLabel(speed: WhisperSpeed): string {
  return `${speed}×`
}
