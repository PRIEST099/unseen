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

type Evaluated = { result: RemoteObject; exceptionDetails?: { text?: string; exception?: { description?: string } } }

function failure(what: string, evaluated: Evaluated): Error {
  const detail = evaluated.exceptionDetails?.exception?.description ?? evaluated.exceptionDetails?.text ?? 'threw'
  return new Error(`${what} failed: ${detail}`)
}

/** Evaluate an expression and keep its (object) result remote. Throws when the expression throws. */
export async function evaluateToObject(cdp: CDPSession, expression: string): Promise<string> {
  const evaluated = (await cdp.send('Runtime.evaluate', { expression, returnByValue: false })) as Evaluated
  if (evaluated.exceptionDetails || evaluated.result.subtype === 'error' || !evaluated.result.objectId) {
    throw failure('Runtime.evaluate', evaluated)
  }
  return evaluated.result.objectId
}

function callArguments(args: readonly unknown[]): Array<{ value: unknown }> {
  return args.map((value) => ({ value }))
}

/** Call a function with `this` = the remote object and return its JSON value. Throws on a page exception. */
export async function callByValue<T>(cdp: CDPSession, objectId: string, functionDeclaration: string, args: readonly unknown[] = []): Promise<T> {
  const res = (await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration,
    arguments: callArguments(args),
    returnByValue: true,
  })) as Evaluated & { result: { value: T } }
  if (res.exceptionDetails) throw failure('Runtime.callFunctionOn', res)
  return res.result.value
}

/** Like `callByValue`, but the result stays remote. */
export async function callToObject(cdp: CDPSession, objectId: string, functionDeclaration: string, args: readonly unknown[] = []): Promise<string> {
  const res = (await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration,
    arguments: callArguments(args),
    returnByValue: false,
  })) as Evaluated
  if (res.exceptionDetails || !res.result.objectId) throw failure('Runtime.callFunctionOn', res)
  return res.result.objectId
}

export async function releaseObject(cdp: CDPSession, objectId: string): Promise<void> {
  await cdp.send('Runtime.releaseObject', { objectId }).catch(() => undefined)
}
/** backendNodeIds of the elements in a remote array (order kept; failures become null). */
export async function backendIdsOfObject(cdp: CDPSession, arrayObjectId: string): Promise<Array<number | null>> {
  const { result: props } = (await cdp.send('Runtime.getProperties', {
    objectId: arrayObjectId,
    ownProperties: true,
  })) as { result: Array<{ name: string; value?: RemoteObject }> }
  const items = props.filter((p) => /^\d+$/.test(p.name)).sort((a, b) => Number(a.name) - Number(b.name))
  const out: Array<number | null> = []
  for (const p of items) {
    out.push(p.value?.objectId ? await backendIdOfObject(cdp, p.value.objectId) : null)
  }
  return out
}

/**
 * Evaluate a JS expression that returns an array of DOM elements and resolve
 * each element to its backendNodeId (array order kept; failures become null).
 * Throws when the expression throws, so callers can record a CollectionError.
 */
export async function backendIdsOf(cdp: CDPSession, expression: string): Promise<Array<number | null>> {
  const evaluated = (await cdp.send('Runtime.evaluate', { expression, returnByValue: false })) as {
    result: RemoteObject
    exceptionDetails?: { text?: string; exception?: { description?: string } }
  }
  const { result } = evaluated
  if (evaluated.exceptionDetails || result.subtype === 'error') {
    const detail = evaluated.exceptionDetails?.exception?.description ?? evaluated.exceptionDetails?.text ?? 'expression threw'
    throw new Error(`Runtime.evaluate failed: ${detail}`)
  }
  if (!result.objectId) return []
  try {
    return await backendIdsOfObject(cdp, result.objectId)
  } finally {
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => undefined)
  }
}
/**
 * The deepest focused element: follows `shadowRoot.activeElement` through open
 * shadow roots and `contentDocument.activeElement` through same-origin frames.
 * Without this, focus moving inside an iframe or a web component keeps
 * reporting the host element, which looks like a repeat (a false cycle).
 */
const DEEP_ACTIVE_ELEMENT_EXPR = `(() => {
  const isRoot = (e) => !e || e === e.ownerDocument.body || e === e.ownerDocument.documentElement
  let a = document.activeElement
  if (isRoot(a)) return null
  for (let depth = 0; depth < 32; depth++) {
    let next = null
    if (a.shadowRoot && a.shadowRoot.activeElement) {
      next = a.shadowRoot.activeElement
    } else if (a.tagName === 'IFRAME' || a.tagName === 'FRAME') {
      try {
        const d = a.contentDocument
        if (d && !isRoot(d.activeElement)) next = d.activeElement
      } catch (e) { /* cross-origin: stay on the frame element */ }
    }
    if (!next) break
    a = next
  }
  return a
})()`

/**
 * backendNodeId of the deepest focused element, or null when focus is on
 * body/none. Throws when CDP fails, so the caller can record a `cdpError`.
 */
export async function activeElementBackendId(cdp: CDPSession): Promise<number | null> {
  const { result } = (await cdp.send('Runtime.evaluate', {
    expression: DEEP_ACTIVE_ELEMENT_EXPR,
    returnByValue: false,
  })) as { result: RemoteObject }
  if (!result.objectId || result.subtype === 'null') return null
  try {
    const { node } = (await cdp.send('DOM.describeNode', { objectId: result.objectId })) as {
      node: { backendNodeId: number }
    }
    return node.backendNodeId
  } finally {
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => undefined)
  }
}

/**
 * True when the node hosts content the walker cannot see into: a frame, or an
 * element with an author (open or closed) shadow root. Focus staying on such a
 * node across Tab presses means focus is moving inside it, not trapped on it.
 */
export async function isCompositeHost(cdp: CDPSession, backendNodeId: number): Promise<boolean> {
  const { node } = (await cdp.send('DOM.describeNode', { backendNodeId })) as {
    node: { nodeName: string; shadowRoots?: Array<{ shadowRootType?: string }> }
  }
  const name = node.nodeName.toUpperCase()
  if (name === 'IFRAME' || name === 'FRAME') return true
  return (node.shadowRoots ?? []).some((r) => r.shadowRootType !== 'user-agent')
}

type FrameTree = { frame: { id: string }; childFrames?: FrameTree[] }

function frameIds(tree: FrameTree): string[] {
  return [tree.frame.id, ...(tree.childFrames ?? []).flatMap(frameIds)]
}

/**
 * Apply a stylesheet through the CSS inspector domain. Inspector stylesheets
 * are not subject to the page's Content-Security-Policy, so this works on
 * sites with a strict `style-src` (unlike `page.addStyleTag`). The top frame
 * must succeed; child frames that live in another process are skipped.
 */
export async function injectInspectorStyles(cdp: CDPSession, cssText: string): Promise<void> {
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { frameTree } = (await cdp.send('Page.getFrameTree')) as { frameTree: FrameTree }
  const [top, ...children] = frameIds(frameTree)
  const apply = async (frameId: string): Promise<void> => {
    const { styleSheetId } = (await cdp.send('CSS.createStyleSheet', { frameId })) as { styleSheetId: string }
    await cdp.send('CSS.setStyleSheetText', { styleSheetId, text: cssText })
  }
  if (top === undefined) throw new Error('page has no frame tree')
  await apply(top)
  for (const id of children) await apply(id).catch(() => undefined)
}

const ANCESTORS_FN = `function () {
  const out = []
  const up = (n) => n.parentElement || (n.getRootNode && n.getRootNode().host) || null
  for (let n = up(this); n && out.length < 24; n = up(n)) out.push(n)
  return out
}`

/**
 * Run `work` while every ancestor of the element is forced into `:focus-within`.
 * Moving focus off an element would otherwise collapse a `:focus-within` submenu
 * that contains it, and the element could no longer take focus back.
 * Failures to force the state are ignored: `work` then runs without it.
 */
export async function withForcedFocusWithin<T>(cdp: CDPSession, objectId: string, work: () => Promise<T>): Promise<T> {
  const forced: number[] = []
  try {
    const { result } = (await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: ANCESTORS_FN,
      returnByValue: false,
    })) as { result: RemoteObject }
    if (result.objectId) {
      const backendNodeIds = (await backendIdsOfObject(cdp, result.objectId)).filter((x): x is number => x !== null)
      await cdp.send('DOM.getDocument', { depth: 0 })
      const { nodeIds } = (await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds })) as { nodeIds: number[] }
      for (const nodeId of nodeIds.filter((n) => n > 0)) {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus-within'] })
        forced.push(nodeId)
      }
    }
  } catch {
    /* run without forced state */
  }
  try {
    return await work()
  } finally {
    for (const nodeId of forced) {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => undefined)
    }
  }
}