import {
  DRONE_DELAY_S,
  DRONE_FEEDBACK,
  DRONE_FREQUENCIES_HZ,
  DRONE_LOWPASS_HZ,
  DRONE_WET,
  planFadeIn,
  planFadeOut,
} from './ambient-drone'

/** The Web Audio I/O for the ambient drone. The numbers come from `ambient-drone.ts`. */

export type AudioContextConstructor = new () => AudioContext

export type DroneEngine = {
  /** Builds and starts the drone. Returns false when Web Audio is unavailable. Safe to call repeatedly. */
  start: () => boolean
  /** Fades the drone out and stops its oscillators within 100 ms. Safe to call repeatedly. */
  stop: () => void
  /** Stops everything at once and closes the AudioContext. The engine can be started again afterwards. */
  dispose: () => void
}

type Graph = {
  oscillators: OscillatorNode[]
  envelope: GainNode
  nodes: AudioNode[]
  stopping: boolean
}

export function resolveAudioContext(): AudioContextConstructor | null {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function' ? window.AudioContext : null
}

function connectReverb(ctx: AudioContext, input: AudioNode, output: AudioNode): AudioNode[] {
  const delay = ctx.createDelay(1)
  delay.delayTime.value = DRONE_DELAY_S
  const feedback = ctx.createGain()
  feedback.gain.value = DRONE_FEEDBACK
  const wet = ctx.createGain()
  wet.gain.value = DRONE_WET
  input.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  wet.connect(output)
  return [delay, feedback, wet]
}

function buildGraph(ctx: AudioContext): Graph {
  const now = ctx.currentTime
  const fade = planFadeIn(now)
  const envelope = ctx.createGain()
  envelope.gain.setValueAtTime(0, fade.startAt)
  envelope.gain.linearRampToValueAtTime(fade.peak, fade.peakAt)
  envelope.connect(ctx.destination)

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = DRONE_LOWPASS_HZ
  lowpass.connect(envelope)

  // Two oscillators at half amplitude each, so the mix peaks at 1 before the envelope.
  const mix = ctx.createGain()
  mix.gain.value = 0.5
  mix.connect(lowpass)

  const oscillators = DRONE_FREQUENCIES_HZ.map((hz) => {
    const oscillator = ctx.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = hz
    oscillator.connect(mix)
    oscillator.start(now)
    return oscillator
  })
  const reverb = connectReverb(ctx, lowpass, envelope)
  return { oscillators, envelope, nodes: [envelope, lowpass, mix, ...reverb], stopping: false }
}

function disconnectGraph(graph: Graph): void {
  for (const oscillator of graph.oscillators) oscillator.disconnect()
  for (const node of graph.nodes) node.disconnect()
}

function stopOscillator(oscillator: OscillatorNode, at: number): void {
  try {
    oscillator.stop(at)
  } catch (error: unknown) {
    // Stopping an oscillator that already ended throws InvalidStateError; it is already silent.
    if (!(error instanceof DOMException)) throw error
  }
}

function fadeOutGraph(ctx: AudioContext, graph: Graph, onGone: () => void): void {
  graph.stopping = true
  const plan = planFadeOut(ctx.currentTime)
  const gain = graph.envelope.gain
  gain.cancelScheduledValues(ctx.currentTime)
  gain.setValueAtTime(gain.value, ctx.currentTime)
  gain.linearRampToValueAtTime(0, plan.rampEndAt)
  for (const oscillator of graph.oscillators) stopOscillator(oscillator, plan.stopAt)
  const [first] = graph.oscillators
  if (first !== undefined) {
    first.onended = () => {
      disconnectGraph(graph)
      onGone()
    }
  }
}

export function createDroneEngine(getConstructor: () => AudioContextConstructor | null = resolveAudioContext): DroneEngine {
  let context: AudioContext | null = null
  const graphs = new Set<Graph>()

  const ensureContext = (): AudioContext | null => {
    if (context !== null && context.state !== 'closed') return context
    const Constructor = getConstructor()
    if (Constructor === null) return null
    try {
      context = new Constructor()
    } catch (error: unknown) {
      if (!(error instanceof DOMException)) throw error
      context = null
    }
    return context
  }

  const start = (): boolean => {
    for (const graph of graphs) if (!graph.stopping) return true
    const ctx = ensureContext()
    if (ctx === null) return false
    // An autosuspended context is resumed here, while the sound toggle's user activation is still valid.
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
    graphs.add(buildGraph(ctx))
    return true
  }

  const stop = (): void => {
    const ctx = context
    if (ctx === null) return
    for (const graph of graphs) {
      if (!graph.stopping) fadeOutGraph(ctx, graph, () => graphs.delete(graph))
    }
  }

  const dispose = (): void => {
    const ctx = context
    context = null
    for (const graph of graphs) {
      for (const oscillator of graph.oscillators) stopOscillator(oscillator, 0)
      disconnectGraph(graph)
    }
    graphs.clear()
    if (ctx !== null && ctx.state !== 'closed') ctx.close().catch(() => undefined)
  }

  return { start, stop, dispose }
}
