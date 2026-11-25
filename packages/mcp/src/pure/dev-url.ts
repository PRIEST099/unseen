export const DEFAULT_DEV_URL = 'http://localhost:5173'

export type DevUrlSource = 'env' | 'config' | 'default'
export type ResolvedDevUrl = { url: string; source: DevUrlSource }

function validHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}

function configUrl(config: unknown): string | null {
  if (typeof config !== 'object' || config === null) return null
  return validHttpUrl((config as Record<string, unknown>)['devServerUrl'])
}

/** `UNSEEN_DEV_URL`, then `devServerUrl` of `.unseen/config.json`, then the default. Invalid values are skipped. */
export function resolveDevUrl(env: Readonly<Record<string, string | undefined>>, config: unknown): ResolvedDevUrl {
  const fromEnv = validHttpUrl(env['UNSEEN_DEV_URL'])
  if (fromEnv !== null) return { url: fromEnv, source: 'env' }
  const fromConfig = configUrl(config)
  if (fromConfig !== null) return { url: fromConfig, source: 'config' }
  return { url: DEFAULT_DEV_URL, source: 'default' }
}
