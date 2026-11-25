import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

type ParamEvent = { kind: 'set' | 'ramp' | 'cancel'; value: number | null; time: number; at: number }
type OscillatorSummary = { type: string; hz: number; startedAt: number | null; stopAt: number | null; stopCalledAt: number | null; disconnected: boolean }
type GainSummary = { toDestination: boolean; events: ParamEvent[]; disconnected: boolean }
type AudioSummary = { contexts: number; resumeCalls: number; closed: number; oscillators: OscillatorSummary[]; gains: GainSummary[] }
type AudioWindow = Window & { __audioSummary?: () => AudioSummary }

/**
 * Replaces window.AudioContext with a recording stub before any page script runs.
 * It starts "suspended" (like a browser before a user gesture) and resumes when `resume()` is called.
 */
const RECORDING_AUDIO_CONTEXT = `
(() => {
  const log = { contexts: 0, resumeCalls: 0, closed: 0, oscillators: [], gains: [] };
  class Param {
    constructor(ctx, value) { this.ctx = ctx; this.value = value; this.events = []; }
    record(kind, value, time) { this.events.push({ kind, value, time, at: this.ctx.currentTime }); }
    setValueAtTime(value, time) { this.value = value; this.record('set', value, time); return this; }
    linearRampToValueAtTime(value, time) { this.record('ramp', value, time); return this; }
    cancelScheduledValues(time) { this.record('cancel', null, time); return this; }
  }
  class Node {
    constructor(ctx) { this.ctx = ctx; this.targets = []; this.disconnected = false; }
    connect(target) { this.targets.push(target); return target; }
    disconnect() { this.disconnected = true; }
  }
  class Gain extends Node {
    constructor(ctx) { super(ctx); this.gain = new Param(ctx, 1); log.gains.push(this); }
  }
  class Filter extends Node {
    constructor(ctx) { super(ctx); this.type = 'lowpass'; this.frequency = new Param(ctx, 350); }
  }
  class Delay extends Node {
    constructor(ctx) { super(ctx); this.delayTime = new Param(ctx, 0); }
  }
  class Oscillator extends Node {
    constructor(ctx) {
      super(ctx);
      this.type = 'sine';
      this.frequency = new Param(ctx, 440);
      this.startedAt = null; this.stopAt = null; this.stopCalledAt = null; this.onended = null;
      log.oscillators.push(this);
    }
    start(time) { this.startedAt = time; }
    stop(time) {
      this.stopAt = time; this.stopCalledAt = this.ctx.currentTime;
      const wait = Math.max(0, time - this.ctx.currentTime) * 1000;
      setTimeout(() => { if (typeof this.onended === 'function') this.onended(); }, wait);
    }
  }
  class RecordingAudioContext {
    constructor() {
      log.contexts += 1;
      this.state = 'suspended';
      this.startTime = performance.now();
      this.destination = { isDestination: true, connect() {}, disconnect() {} };
    }
    get currentTime() { return (performance.now() - this.startTime) / 1000; }
    resume() { log.resumeCalls += 1; this.state = 'running'; return Promise.resolve(); }
    close() { log.closed += 1; this.state = 'closed'; return Promise.resolve(); }
    createGain() { return new Gain(this); }
    createOscillator() { return new Oscillator(this); }
    createBiquadFilter() { return new Filter(this); }
    createDelay() { return new Delay(this); }
  }
  window.AudioContext = RecordingAudioContext;
  window.__audioSummary = () => ({
    contexts: log.contexts, resumeCalls: log.resumeCalls, closed: log.closed,
    oscillators: log.oscillators.map((o) => ({
      type: o.type, hz: o.frequency.value, startedAt: o.startedAt, stopAt: o.stopAt,
      stopCalledAt: o.stopCalledAt, disconnected: o.disconnected,
    })),
    gains: log.gains.map((g) => ({
      toDestination: g.targets.some((t) => t && t.isDestination === true),
      events: g.gain.events, disconnected: g.disconnected,
    })),
  });
})();
`

/** A stand-in for window.speechSynthesis that only counts and ends utterances. */
const SPEECH_STUB = `
(() => {
  window.__spokenCount = 0;
  const stub = {
    speaking: false, pending: false, paused: false,
    speak(utterance) {
      window.__spokenCount += 1;
      setTimeout(() => { if (utterance.onend) utterance.onend({}); }, 300);
    },
    cancel() {}, pause() {}, resume() {}, getVoices() { return []; },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
})();
`

async function summary(page: Page): Promise<AudioSummary> {
  return page.evaluate(() => {
    const w: AudioWindow = window
    return (
      w.__audioSummary?.() ?? { contexts: -1, resumeCalls: 0, closed: 0, oscillators: [], gains: [] }
    )
  })
}

const toggle = (page: Page) => page.getByRole('button', { name: 'Toggle sound' })

function masterGains(audio: AudioSummary): GainSummary[] {
  return audio.gains.filter((gain) => gain.toDestination)
}

test.describe('Ambient drone (Web Audio, stubbed)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({ content: RECORDING_AUDIO_CONTEXT })
  })

  test('creates no AudioContext before the toggle; starts quietly on toggle; stops within 100 ms; restarts cleanly', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('THE UNSEEN')
    // Loading the app, and moving between routes, never starts audio.
    await page.getByRole('button', { name: /Cursed Shop/ }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Spirit Sight: ')
    await page.waitForTimeout(400)
    expect((await summary(page)).contexts).toBe(0)
    expect((await summary(page)).oscillators).toHaveLength(0)
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')

    // Sound on: the drone starts from the click.
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await summary(page)).oscillators.length).toBe(2)
    const on = await summary(page)
    expect(on.contexts).toBe(1)
    expect(on.resumeCalls).toBeGreaterThanOrEqual(1)
    expect(on.oscillators.map((o) => o.type)).toEqual(['sine', 'sine'])
    expect(on.oscillators.map((o) => o.hz).sort((a, b) => a - b)).toEqual([55, 55.4])
    expect(on.oscillators.every((o) => o.startedAt !== null && o.stopAt === null)).toBe(true)

    const master = masterGains(on)
    expect(master).toHaveLength(1)
    const targets = (master[0]?.events ?? []).flatMap((event) => (event.value === null ? [] : [event.value]))
    expect(targets.length).toBeGreaterThan(0)
    expect(Math.max(...targets)).toBeLessThanOrEqual(0.2)
    expect(master[0]?.events[0]).toMatchObject({ kind: 'set', value: 0 }) // fades in from silence
    const fadeIn = master[0]?.events.find((event) => event.kind === 'ramp')
    expect(fadeIn?.value).toBeGreaterThan(0)
    expect((fadeIn?.time ?? 0) - (fadeIn?.at ?? 0)).toBeGreaterThanOrEqual(1.9) // about 2 s

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])

    // Sound off: gain ramps to 0 and the oscillators are stopped within 100 ms.
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await summary(page)).oscillators.every((o) => o.stopAt !== null)).toBe(true)
    const off = await summary(page)
    for (const oscillator of off.oscillators) {
      expect((oscillator.stopAt ?? 99) - (oscillator.stopCalledAt ?? 0)).toBeLessThanOrEqual(0.1)
    }
    const fadeOut = masterGains(off)[0]?.events.filter((event) => event.kind === 'ramp').at(-1)
    expect(fadeOut?.value).toBe(0)
    expect((fadeOut?.time ?? 99) - (fadeOut?.at ?? 0)).toBeLessThanOrEqual(0.1)
    // The nodes are released once the oscillators have ended.
    await expect.poll(async () => (await summary(page)).oscillators.every((o) => o.disconnected)).toBe(true)

    // On again: exactly one live drone, on the same AudioContext.
    await toggle(page).click()
    await expect.poll(async () => (await summary(page)).oscillators.length).toBe(4)
    const again = await summary(page)
    expect(again.contexts).toBe(1)
    expect(again.oscillators.filter((o) => o.stopAt === null)).toHaveLength(2)
    await toggle(page).click()
    await expect.poll(async () => (await summary(page)).oscillators.every((o) => o.stopAt !== null)).toBe(true)
  })

  test('stops when reduced motion is turned on while sound is on, and never exceeds the 0.2 cap', async ({ page }) => {
    await page.goto('/')
    await toggle(page).click()
    await expect.poll(async () => (await summary(page)).oscillators.length).toBe(2)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(async () => (await summary(page)).oscillators.every((o) => o.stopAt !== null)).toBe(true)
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true') // sound itself stays on
    for (const gain of (await summary(page)).gains.filter((g) => g.toDestination)) {
      for (const event of gain.events) expect(event.value ?? 0).toBeLessThanOrEqual(0.2)
    }
  })

  test('Whisper walk Play speaks without starting the drone: no AudioContext, no oscillator (requirement 33.2)', async ({ page }) => {
    await page.addInitScript({ content: SPEECH_STUB })
    await page.goto('/sample/cursed-shop-index/whisper')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Whisper Walk: ')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    // Play's own click allows Web Speech (requirement 20.4)...
    await expect.poll(() => page.evaluate((): number => Reflect.get(window, '__spokenCount'))).toBeGreaterThan(0)
    // ...but the header's ambient sound stays off, and no audio graph is ever built.
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
    await page.waitForTimeout(400)
    let audio = await summary(page)
    expect(audio.contexts).toBe(0)
    expect(audio.oscillators).toHaveLength(0)

    // Pausing and moving to another route does not start it either.
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('link', { name: 'Spirit Sight', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Spirit Sight: ')
    await page.waitForTimeout(400)
    audio = await summary(page)
    expect(audio.contexts).toBe(0)
    expect(audio.oscillators).toHaveLength(0)

    // Only the header toggle starts the drone.
    await toggle(page).click()
    await expect.poll(async () => (await summary(page)).oscillators.length).toBe(2)
    await toggle(page).click()
    await expect.poll(async () => (await summary(page)).oscillators.every((o) => o.stopAt !== null)).toBe(true)
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('never starts the drone, even with sound on', async ({ page }) => {
      await page.goto('/')
      await toggle(page).click()
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
      await page.waitForTimeout(600)
      const audio = await summary(page)
      expect(audio.contexts).toBe(0)
      expect(audio.oscillators).toHaveLength(0)
    })
  })
})

test.describe('Ambient drone without Web Audio', () => {
  test('the sound toggle still works and nothing throws', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'AudioContext')
    })
    await page.goto('/')
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(300)
    expect(errors).toEqual([])
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})
