import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { HAUNTING_TYPES } from '@the-unseen/core'
import type { HauntingType } from '@the-unseen/core'
import { speechExample } from '../../src/pure/speech-example.js'
import { syntheticAxNode, syntheticRaw } from '../../src/pure/synthetic-raw.js'
import { typeArb } from '../arbitraries/haunting.js'

const RUNS = { numRuns: 100 }

/** Role labels and special rows from hauntings.md, independent of the implementation. */
const EXPECTED: Readonly<Partial<Record<HauntingType, string>>> = {
  NamelessSpirit: 'button',
  HollowPortrait: 'unlabelled graphic, hero.png',
  WhisperingField: 'edit text, blank',
}

test('property P10: each speaking type matches its hauntings.md announcement exactly', async () => {
  await fc.assert(
    fc.asyncProperty(typeArb, async (type) => {
      const expected = EXPECTED[type]
      expect(speechExample(type)).toBe(expected ?? null)
    }),
    RUNS
  )
})

test('property P10: the five silent types, and the two sound-cue types, have no speech example', async () => {
  const silent: HauntingType[] = ['TheFog', 'LostSoul', 'InvisibleWanderer', 'TheVeiled', 'ShatteredOrder', 'SilentTongue', 'CursedLoop']
  await fc.assert(
    fc.asyncProperty(fc.constantFrom(...silent), async (type) => {
      expect(speechExample(type)).toBeNull()
    }),
    RUNS
  )
})

test('every type is covered by the expectations above', () => {
  expect(HAUNTING_TYPES).toHaveLength(10)
  expect(Object.keys(EXPECTED)).toHaveLength(3)
})

test('the synthetic helpers build a complete RawAudit and a named AX node', () => {
  expect(syntheticRaw().axNodes).toEqual([])
  expect(syntheticAxNode('button', 'Pay').name.value).toBe('Pay')
})
