import { announce } from '@the-unseen/core'
import type { HauntingType } from '@the-unseen/core'
import { syntheticAxNode, syntheticRaw } from './synthetic-raw.js'

/**
 * The announcement a screen reader gives for the typical element of each type, produced by Core's `announce`
 * on a fixed synthetic AX node. Types with no announcement of their own return null.
 */
export function speechExample(type: HauntingType): string | null {
  switch (type) {
    case 'NamelessSpirit':
      return announce(syntheticAxNode('button', ''), syntheticRaw())
    case 'HollowPortrait':
      return announce(syntheticAxNode('image', ''), syntheticRaw({ imgSrcAttributes: { '2': 'img/hero.png' } }))
    case 'WhisperingField':
      return announce(syntheticAxNode('textbox', ''), syntheticRaw())
    default:
      return null
  }
}
