import type { Page } from 'playwright'

/** backendDOMNodeId (as a string) of the first element matching `selector`, or null. */
export async function backendIdOf(page: Page, selector: string): Promise<string | null> {
  const cdp = await page.context().newCDPSession(page)
  try {
    const { result } = (await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
    })) as { result: { objectId?: string; subtype?: string } }
    if (!result.objectId || result.subtype === 'null') return null
    const { node } = (await cdp.send('DOM.describeNode', { objectId: result.objectId })) as {
      node: { backendNodeId: number }
    }
    return String(node.backendNodeId)
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}
