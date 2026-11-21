import type { CDPSession, Page } from 'playwright'

/** Open a CDP session for a page. Callers detach it when done. */
export async function openCdp(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page)
}

type RemoteObject = { objectId?: string; subtype?: string; type: string }

/** backendNodeId of a remote DOM object, or null. */
export async function backendIdOfObject(cdp: CDPSession, objectId: string): Promise<number | null> {
  try {
    const { node } = (await cdp.send('DOM.describeNode', { objectId })) as { node: { backendNodeId: number } }
    return node.backendNodeId
  } catch {
    return null
  }
}

/**
 * Evaluate a JS expression that returns an array of DOM elements and resolve
 * each element to its backendNodeId (array order kept; failures become null).
 */
export async function backendIdsOf(cdp: CDPSession, expression: string): Promise<Array<number | null>> {
  const { result } = (await cdp.send('Runtime.evaluate', { expression, returnByValue: false })) as {
    result: RemoteObject
  }
  if (!result.objectId) return []
  try {
    const { result: props } = (await cdp.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
    })) as { result: Array<{ name: string; value?: RemoteObject }> }
    const items = props
      .filter((p) => /^\d+$/.test(p.name))
      .sort((a, b) => Number(a.name) - Number(b.name))
    const out: Array<number | null> = []
    for (const p of items) {
      out.push(p.value?.objectId ? await backendIdOfObject(cdp, p.value.objectId) : null)
    }
    return out
  } finally {
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => undefined)
  }
}

/** backendNodeId of `document.activeElement`, or null when focus is on body/none. */
export async function activeElementBackendId(cdp: CDPSession): Promise<number | null> {
  const { result } = (await cdp.send('Runtime.evaluate', {
    expression:
      '(() => { const a = document.activeElement; return a && a !== document.body && a !== document.documentElement ? a : null })()',
    returnByValue: false,
  })) as { result: RemoteObject }
  if (!result.objectId || result.subtype === 'null') return null
  try {
    return await backendIdOfObject(cdp, result.objectId)
  } finally {
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => undefined)
  }
}
