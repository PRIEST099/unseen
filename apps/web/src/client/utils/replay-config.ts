/**
 * The replay edition is a static build (`npm run build:replay`) that serves the pre-recorded sample audits
 * from files and never calls `/api`. Everything here is decided at build time.
 */
export type ReplayConfig = {
  /** True in the replay build. */
  replay: boolean
  /** The site's base path with a trailing slash: `/` for the hosted app, `/unseen/` on GitHub Pages. */
  basePath: string
  /** The live auditor's URL, or '' when none was set or the value is not a plain http(s) URL. */
  liveUrl: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Only an absolute http(s) URL may become a link: anything else (javascript:, relative, junk) counts as unset. */
export function sanitizeLiveUrl(value: string): string {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : ''
  } catch {
    return ''
  }
}

export function normalizeBasePath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
}

export function readReplayConfig(env: Record<string, unknown>): ReplayConfig {
  return {
    replay: asString(env.VITE_REPLAY) === '1',
    basePath: normalizeBasePath(asString(env.BASE_URL)),
    liveUrl: sanitizeLiveUrl(asString(env.VITE_LIVE_URL)),
  }
}

// Each key is read by name so Vite can replace it at build time.
export const replayConfig: ReplayConfig = readReplayConfig({
  VITE_REPLAY: import.meta.env.VITE_REPLAY,
  BASE_URL: import.meta.env.BASE_URL,
  VITE_LIVE_URL: import.meta.env.VITE_LIVE_URL,
})

/** The sentence shown in place of the URL form. The live auditor sentence is left out when no URL is set. */
export const REPLAY_NOTICE = 'This is the replay edition: pre-recorded audits of our haunted demo shop.'
export const LIVE_AUDITOR_LEAD = 'The live auditor runs at'

/** Where the replay build keeps the files that the API serves in the hosted app. */
export function replayAssetUrl(config: ReplayConfig, file: string): string {
  return `${config.basePath}replay-data/${file}`
}
