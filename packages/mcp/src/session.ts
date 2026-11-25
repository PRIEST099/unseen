import type { ClassifiedAudit, Haunting } from '@the-unseen/core'

export const MAX_SESSION_AUDITS = 5

/** In-memory record of the hauntings from the last few audits, by haunting id. Per process. */
export class Session {
  private readonly audits: Map<string, Haunting>[] = []

  record(classified: ClassifiedAudit): void {
    const byId = new Map<string, Haunting>()
    for (const h of classified.hauntings) {
      byId.set(h.id, h)
      for (const s of h.secondary) byId.set(s.id, s)
    }
    this.audits.push(byId)
    while (this.audits.length > MAX_SESSION_AUDITS) this.audits.shift()
  }

  /** Newest audit wins when the same id appears in several. */
  find(id: string): Haunting | undefined {
    for (let i = this.audits.length - 1; i >= 0; i--) {
      const found = this.audits[i]?.get(id)
      if (found) return found
    }
    return undefined
  }

  get size(): number {
    return this.audits.length
  }
}
