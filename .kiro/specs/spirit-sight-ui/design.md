# Design Document: Spirit Sight UI

## Overview

Spirit Sight UI (`apps/web`) is a full-stack web application that makes accessibility issues visible and audible. It combines a React + Vite single-page application with a Fastify API server deployable to any Node hosting platform (Dockerfile delivered by run-16 prompt). Users paste a URL, see a real-time audit progress séance, then explore hauntings through three lenses: Spirit Sight (visual overlay), Whisper Walk (AX-tree speech experience), and Keyboard Walk (animated Tab sequence). The app exports to Daylight mode (calm WCAG report) and meets WCAG 2.2 AA itself—it audits itself with zero hauntings on every route.

The design prioritizes demo impact: the vertical slice delivers score + WCAG export + self-audit proof first; one obvious user path (≤2 clicks between views); complete polish over proof-of-concept; performance budgets that keep audits fast.

### Key Design Principles

1. **Single Source of Truth**: `@the-unseen/core` produces `ClassifiedAudit`; the UI renders it faithfully
2. **Deterministic Rendering**: Screenshot PNG and overlays scale together from the same dimensions; positions never drift
3. **Accessibility First**: The app itself demonstrates WCAG 2.2 AA compliance on every route
4. **Respect Preferences**: `prefers-reduced-motion` disables all animations; sound is off by default
5. **Performance Budget**: Cursed Shop demo audit ≤20s, Spirit Sight render ≤2s, animations ≥30fps
6. **Signature Moment**: Spirit Sight opens on the clean screenshot; "Open Spirit Sight" reveals overlays with a fog wave

---

## Routing and URL Structure

Every view is URL-addressable. Deep links and refreshes work correctly.

| Path | View | Sub-routes | Purpose |
|------|------|------------|---------|
| `/` | `LandingView` | — | URL input + sample cards |
| `/seance/:jobId` | `SeanceView` | — | Real-time audit progress (polls `/api/audit/:jobId`) |
| `/audit/:jobId` | `AuditResultView` | `/keyboard`, `/whisper`, `/daylight` | Job result with Spirit Sight, walks, and Daylight modes |
| `/sample/:sampleId` | `AuditResultView` | `/keyboard`, `/whisper`, `/daylight` | Pre-audited sample with Spirit Sight, walks, and Daylight modes |

**Sub-Route Structure**:

The audit result views (both `/audit/:id` and `/sample/:id`) have four sub-routes:

- **Base** (`/audit/:id` or `/sample/:id`): Spirit Sight overlay (the default view)
- **`/keyboard`**: Keyboard Walk (animated Tab sequence)
- **`/whisper`**: Whisper Walk (AX-tree speech with Web Speech)
- **`/daylight`**: Daylight mode (calm WCAG report)

Each sub-route renders the **same** `AuditResultView` component with the same data, switching only the active panel via URL-based state. The screenshot + sidebar are always visible except in Daylight mode, which hides the screenshot and renders a full-page report.

**Navigation Flow**:

1. User enters URL or clicks sample → POST `/api/audit` or navigate to `/sample/:sampleId`
2. POST returns job ID → navigate to `/seance/:jobId`
3. Séance polls until `status: 'done'` → auto-navigate to `/audit/:jobId` (Spirit Sight by default)
4. User clicks "Keyboard walk" → navigate to `/audit/:jobId/keyboard`
5. User clicks "Daylight mode" → navigate to `/audit/:jobId/daylight`

**Data Sources**:

- `/audit/:jobId` fetches from `GET /api/audit/:jobId` (ephemeral, 1h TTL)
- `/sample/:sampleId` fetches from `GET /api/samples/:sampleId` (permanent, cached)
- Screenshot served separately: `GET /api/audit/:jobId/screenshot.png` or `GET /api/samples/:sampleId/screenshot.png`

**Route Component Sharing**:

Both `/audit/:jobId/*` and `/sample/:sampleId/*` render `AuditResultView`. The component:
- Reads route params to determine source: `{ kind: 'job', id }` or `{ kind: 'sample', id }`
- Fetches the matching endpoint once and caches the result
- Reads the current sub-route (`/keyboard`, `/whisper`, `/daylight`, or base) from `useLocation()`
- Shows a 404 state if the job expired or the sample doesn't exist
- Renders the same UI for both sources

**Accessibility Requirements**:

Each route has:
- Exactly one `<h1>` element
- A `<main id="main" tabindex="-1">` landmark wrapping the view content
- A skip link "Skip to main content" as the first focusable element (linking to `#main`)
- `<html lang="en">` set in `index.html`
- `document.title` set to `"{view name} – THE UNSEEN"` on mount

**Heading Hierarchy**:

- **Landing** (`/`): h1 "THE UNSEEN" > h2 "Try a sample"
- **Séance** (`/seance/:id`): h1 "The séance"
- **Spirit Sight** (`/audit/:id` or `/sample/:id`): h1 "Spirit Sight: {hostname}" > h2 "Hauntings"
- **Keyboard Walk** (`/audit/:id/keyboard`): h1 "Keyboard Walk: {hostname}" > h2 "Tab sequence"
- **Whisper Walk** (`/audit/:id/whisper`): h1 "Whisper Walk: {hostname}" > h2 "Screen reader announcements"
- **Daylight** (`/audit/:id/daylight`): h1 "Daylight report: {hostname}" > h2 "Findings by WCAG criterion" > h2 "Needs manual check"
- **Dialog** (haunting detail): h2 (inside `role="dialog"`)
- **ErrorBoundary** (error fallback): h1 "An error occurred"

**404 Handling**:

A `NotFoundView` component is rendered for unmatched routes, displaying h1 "Page not found" and a link back to `/`.

---

## Data Contract: Core Types to UI Needs

The classifier exports `ClassifiedAudit`. The UI must use the correct field paths.

| UI Need | Real Path | Type |
|---------|-----------|------|
| Screenshot PNG (base64) | `audit.raw.screenshotPng` | `string` |
| Viewport size | `audit.raw.viewportWidth`, `audit.raw.viewportHeight` | `number` |
| Bounding boxes | `audit.raw.boundingBoxes` | `BoundingBox[]` |
| AX nodes | `audit.raw.axNodes` | `AXNode[]` |
| Tab walk steps | `audit.raw.tabWalkResult.steps` | `TabStep[]` |
| Escapable cycles | `audit.raw.tabWalkResult.cycles.filter(c => c.escapable)` | `TabCycle[]` |
| Hauntings (primary only) | `audit.hauntings` | `Haunting[]` |
| Score | `audit.score` | `number` (0-100) |
| Primary counts | `audit.countsByType` | `Record<HauntingType, number>` |
| Detected counts (primary + secondary) | `audit.detectedCountsByType` | `Record<HauntingType, number>` |
| Manual check nodes | `audit.needsManualCheck` | `ManualCheckNode[]` |
| Unmapped axe violations | `audit.axeCrossCheck.unmapped` | `AxeViolation[]` |
| Haunting box | `haunting.box` | `BoundingBox \| null` |
| Haunting fix | `haunting.fix.instruction`, `haunting.fix.codeSnippet` | `string` |
| Haunting WCAG criteria | `haunting.wcag` (array, primary first) | `WCAGCriterion[]` |
| Haunting AAA guidance | `haunting.guidance` (Invisible Wanderer only) | `WCAGCriterion?` |
| Secondary hauntings | `haunting.secondary` | `Haunting[]` |
| Speech | Built from `buildSpeechTrack(audit.raw)` (exported by core) | `SpeechLine[]` |

**Never use**:
- ~~`audit.screenshotPng`~~ → use `audit.raw.screenshotPng`
- ~~`audit.tabWalkResult`~~ → use `audit.raw.tabWalkResult`
- ~~`haunting.fixSuggestion`~~ → use `haunting.fix`
- ~~`haunting.cycle`~~ → use `audit.raw.tabWalkResult.cycles`

---

## API Layer Design

### Fastify Server Factory

**File**: `apps/web/src/server/server.ts`

```typescript
import fastify from 'fastify'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'

export type ServerOptions = {
  maxConcurrency?: number // default 2
  logger?: boolean | object
}

export function createServer(options: ServerOptions = {}): FastifyInstance {
  const server = fastify({
    logger: NODE_ENV === 'production' 
      ? true 
      : { transport: { target: 'pino-pretty' } },
    trustProxy: true, // for rate limiting behind a reverse proxy
  })

  // Security: Helmet with strict CSP (global: false, applied per route below)
  server.register(helmet, {
    global: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // No inline; Vite hashes not needed with external bundle
        styleSrc: ["'self'", "'unsafe-inline'"], // Vite requires inline styles in dev
        fontSrc: ["'self'"], // Self-hosted @fontsource only
        imgSrc: ["'self'", "data:"], // base64 screenshots, PNG endpoints
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      }
    }
  })

  // Rate limiting with global: false (applies only where attached)
  server.register(rateLimitPlugin, { global: false })

  // Routes (helmet enabled via onRequest hook)
  server.register(async (apiContext) => {
    apiContext.addHook('onRequest', async (request, reply) => {
      await reply.helmet()
    })
    
    apiContext.register(auditRoutes, { maxConcurrency: options.maxConcurrency ?? 2 })
    apiContext.register(samplesRoutes)
    apiContext.register(healthRoutes)
  }, { prefix: '/api' })

  // Serve apps/cursed-shop statically at /cursed-shop/ (no helmet, so inline scripts work)
  server.register(async (instance) => {
    await instance.register(fastifyStatic, {
      root: fileURLToPath(new URL('../../../cursed-shop', import.meta.url)),
      prefix: '/cursed-shop/',
      decorateReply: false,
    })
  }, { prefix: '/cursed-shop' })

  // Static file serving in production only
  if (NODE_ENV === 'production') {
    // Refuse UNSEEN_DEV_ALLOW_PRIVATE in production
    if (process.env.UNSEEN_DEV_ALLOW_PRIVATE === '1') {
      throw new Error('UNSEEN_DEV_ALLOW_PRIVATE=1 is forbidden in production (NODE_ENV=production)')
    }

    server.register(fastifyStatic, {
      root: fileURLToPath(new URL('../client', import.meta.url)), // dist/server/ → dist/client/
      prefix: '/',
    })
    server.setNotFoundHandler((req, reply) => {
      reply.sendFile('index.html') // SPA fallback
    })
  }

  return server
}
```

### Entry Point

**File**: `apps/web/src/server/main.ts`

```typescript
import { createServer } from './server.js'

const PORT = Number(process.env.PORT) || 3000
const UNSEEN_MAX_CONCURRENCY = Number(process.env.UNSEEN_MAX_CONCURRENCY) || 2

const server = createServer({ maxConcurrency: UNSEEN_MAX_CONCURRENCY })

server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    server.log.error(err)
    process.exit(1)
  }
  server.log.info(`Server listening at ${address}`)
})
```

### Route: POST /api/audit

**File**: `apps/web/src/server/routes/audit.ts`

**Request**:
```json
{ "url": "https://example.com" }
```

**Flow**:
1. Validate input (must have `url` field; JSON schema `additionalProperties: false`)
2. Validate `url` format (`http://` or `https://`, well-formed)
3. SSRF pre-check: resolve DNS, check against blocked ranges (`.kiro/steering/security.md`)
4. Create job with unique ID (`crypto.randomUUID()`)
5. **Enqueue job before replying** (if `queue.enqueue` throws `QueueFullError`, delete job and return 429)
6. Return `202 Accepted { "id": "uuid" }`

**Rate Limiting**:
Attached to this route only via route-level config:
```typescript
server.post('/api/audit', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
    }
  }
}, async (req, reply) => { ... })
```
Plus a per-IP 30/hour limit enforced by `src/server/middleware/rate-limit.ts` (a preHandler on the same route).

**Response Status Codes**:
- `202`: Job accepted and queued
- `400`: Invalid URL format or JSON schema violation
- `403`: SSRF blocked (private IP or metadata endpoint)
- `429`: Rate limit exceeded (per-IP: 5/min or 30/hour) OR queue full (20 waiting jobs)

**Error Response Format**:
```typescript
type ErrorResponse = {
  error: 'INVALID_URL' | 'SSRF_BLOCKED' | 'RATE_LIMIT' | 'QUEUE_FULL'
  message: string // User-safe message
  retryAfter?: number // For 429 only, seconds
}
```

### Route: GET /api/audit/:id

**File**: `apps/web/src/server/routes/audit.ts`

**Response Variants**:

```typescript
type AuditStatusResponse =
  | { status: 'queued'; stages: Stages }
  | { status: 'loading' | 'tree' | 'walking' | 'classifying'; stages: Stages }
  | { status: 'done'; result: ClassifiedAudit; stages: Stages } // result has raw.screenshotPng = ''
  | { status: 'error'; error: string; message: string }
  | { status: 'not-found' } // 404

type Stages = {
  queued: number    // epoch ms
  loading?: number
  tree?: number
  walking?: number
  classifying?: number
  done?: number
}
```

**Polling**: Client polls every 500ms while `status` is queued/loading/tree/walking/classifying.

**Screenshot Endpoint**: `GET /api/audit/:id/screenshot.png` returns the PNG as `image/png` from a Buffer.

### Route: GET /api/samples

**File**: `apps/web/src/server/routes/samples.ts`

**Response**:
```typescript
type SampleMetadata = {
  id: string           // e.g. "cursed-shop-index"
  name: string         // "Cursed Shop: Home"
  url: string          // The original URL audited
  score: number
  countsByType: Record<HauntingType, number>
  thumbnailUrl: string // "/api/samples/:id/thumbnail.png"
}

type SamplesResponse = SampleMetadata[]
```

Samples metadata is loaded from `apps/web/samples/index.json` at server startup.

### Route: GET /api/samples/:id

**File**: `apps/web/src/server/routes/samples.ts`

**Response**:
```typescript
type Sample = {
  id: string
  name: string
  url: string
  result: ClassifiedAudit // with raw.screenshotPng = ''
  speechTrack: SpeechLine[]
}
```

Loaded from `apps/web/samples/<id>.json`. Returns 404 if the sample doesn't exist.

**Screenshot Endpoint**: `GET /api/samples/:id/screenshot.png` returns the PNG as `image/png`.

### Route: GET /api/health

**File**: `apps/web/src/server/routes/health.ts`

**Response**: `200 { "status": "ok" }`

Used by Docker health checks and load balancers.

---

## Audit Job Queue

### Job Store

**File**: `apps/web/src/server/jobs/store.ts`

In-memory Map with TTL and LRU:
```typescript
type Job = {
  id: string
  url: string
  status: JobStatus
  stages: Stages
  result?: ClassifiedAudit // dropped after 15 min or when LRU evicts (keep at most 50)
  error?: { code: string; message: string }
  createdAt: number  // epoch ms
  updatedAt: number
}

type JobStatus = 'queued' | 'loading' | 'tree' | 'walking' | 'classifying' | 'done' | 'error'

class JobStore {
  private jobs = new Map<string, Job>()
  private TTL = 60 * 60 * 1000 // 1 hour
  private MAX_RESULTS = 50 // LRU cap for done jobs

  set(job: Job): void
  get(id: string): Job | undefined
  
  // Functional update that reads current job
  update(id: string, updater: (job: Job) => Partial<Job>): void {
    const job = this.jobs.get(id)
    if (!job) return
    this.jobs.set(id, { ...job, ...updater(job), updatedAt: Date.now() })
  }
  
  // Cleanup: runs every 5 minutes, removes jobs older than TTL
  // Also drops result from done jobs older than 15 min
  startCleanup(): NodeJS.Timeout
}
```

### Job Queue

**File**: `apps/web/src/server/jobs/queue.ts`

Concurrency-limited FIFO queue:
```typescript
class JobQueue {
  private queue: string[] = [] // Job IDs
  private running = new Set<string>()
  private maxConcurrency: number // From UNSEEN_MAX_CONCURRENCY env var

  enqueue(jobId: string): void {
    if (this.queue.length >= 20) {
      throw new QueueFullError()
    }
    this.queue.push(jobId)
    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.running.size >= this.maxConcurrency) return
    if (this.queue.length === 0) return

    const jobId = this.queue.shift()!
    this.running.add(jobId)
    
    try {
      await executeJob(jobId)
    } finally {
      this.running.delete(jobId)
      this.processNext()
    }
  }
}
```

### Job Worker

**File**: `apps/web/src/server/jobs/worker.ts`

```typescript
import { auditAndClassify, OriginScopedPolicy, RestrictiveSafeFetchPolicy } from '@the-unseen/core'

async function executeJob(jobId: string): Promise<void> {
  const job = jobStore.get(jobId)
  if (!job) return

  try {
    const allowPrivate = process.env.UNSEEN_DEV_ALLOW_PRIVATE === '1' && NODE_ENV !== 'production'

    const classified = await auditAndClassify(job.url, {
      allowPrivate,
      timeoutMs: 60000,
      
      // Progress callback updates job status and stages (functional update)
      onProgress: (stage: 'loading' | 'tree' | 'walking' | 'classifying', atMs: number) => {
        jobStore.update(jobId, (j) => ({
          status: stage,
          stages: { ...j.stages, [stage]: atMs }
        }))
      }
    })

    // Store screenshot separately before stripping from result
    const screenshot = Buffer.from(classified.raw.screenshotPng, 'base64')

    // Strip screenshot from result JSON (served separately)
    const resultWithoutPng = {
      ...classified,
      raw: { ...classified.raw, screenshotPng: '' }
    }

    jobStore.update(jobId, (j) => ({
      status: 'done',
      result: resultWithoutPng,
      screenshot,
      stages: { ...j.stages, done: Date.now() }
    }))
  } catch (error) {
    const errorResponse = mapErrorToResponse(error)
    jobStore.update(jobId, (j) => ({
      status: 'error',
      error: errorResponse,
      stages: { ...j.stages, error: Date.now() }
    }))
  }
}

function mapErrorToResponse(error: unknown): { code: string; message: string } {
  if (error instanceof SsrfBlockedError) {
    return { code: 'SSRF_BLOCKED', message: 'Cannot audit private or internal URLs for security reasons.' }
  }
  if (error instanceof AuditTimeoutError) {
    return { code: 'TIMEOUT', message: 'The audit took too long (60s limit). The page may be too large or slow to load.' }
  }
  if (error instanceof AuditResourceLimitError) {
    return { code: 'RESOURCE_LIMIT', message: 'The page is too large to audit (50MB limit).' }
  }
  // Network errors, DNS failures, etc.
  return { code: 'NETWORK_ERROR', message: 'Could not load the page. Check the URL and try again.' }
}
```

---

## Sample Generation

**File**: `apps/web/scripts/build-samples.mjs`

```typescript
import { startShopServer } from '@the-unseen/core'
import { auditAndClassify, buildSpeechTrack } from '@the-unseen/core'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const samples = [
  { id: 'cursed-shop-index', page: 'index.html', name: 'Cursed Shop: Home' },
  { id: 'cursed-shop-product', page: 'product.html', name: 'Cursed Shop: Product' },
  { id: 'cursed-shop-checkout', page: 'checkout.html', name: 'Cursed Shop: Checkout' },
  // Plus 2-3 public URLs from samples.config.json
]

async function main() {
  const { baseUrl, close } = await startShopServer() // returns random port

  const manifest = []

  for (const { id, page, name } of samples) {
    const localUrl = `${baseUrl}/${page}`
    const displayUrl = `https://cursed-shop.the-unseen.app/${page}`

    const classified = await auditAndClassify(localUrl, { allowPrivate: true })

    // Rewrite auditedUrl to the public display URL
    classified.raw.auditedUrl = displayUrl

    // Extract and save screenshot separately
    const screenshotPng = classified.raw.screenshotPng
    const pngBuffer = Buffer.from(screenshotPng, 'base64')
    await writeFile(`samples/${id}.png`, pngBuffer)

    // Generate 400px-wide JPEG thumbnail
    const thumbnail = await sharp(pngBuffer).resize(400, null, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()
    await writeFile(`samples/${id}-thumb.jpg`, thumbnail)

    // Strip screenshot from JSON
    const resultWithoutPng = {
      ...classified,
      raw: { ...classified.raw, screenshotPng: '' }
    }

    // Save sample JSON
    await writeFile(`samples/${id}.json`, JSON.stringify({
      id,
      name,
      url: displayUrl,
      result: resultWithoutPng,
      speechTrack: buildSpeechTrack(classified.raw), // from core
    }, null, 2))

    // Add to manifest
    manifest.push({
      id,
      name,
      url: displayUrl,
      score: classified.score,
      countsByType: classified.countsByType,
      thumbnailUrl: `/api/samples/${id}/thumbnail.jpg`
    })
  }

  await writeFile('samples/index.json', JSON.stringify(manifest, null, 2))
  await close()
}

main()
```

Run with: `npm run build-samples -w apps/web` (after `npm run build -w @the-unseen/core`).

### Data Flow Diagram

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ POST /api/audit { url }
       ▼
┌─────────────────────────────┐
│   Fastify API Server        │
│  - Validate URL             │
│  - SSRF pre-check           │
│  - Create job               │
│  - Enqueue                  │
└──────┬──────────────────────┘
       │ 202 { id }
       │
       │ GET /api/audit/:id (poll every 500ms)
       ▼
┌─────────────────────────────┐
│   Job Queue                 │
│  - Concurrency limit: 2     │
│  - Queue depth: 20          │
└──────┬──────────────────────┘
       │ When slot available
       ▼
┌─────────────────────────────┐
│   Job Worker                │
│  - auditUrl(@the-unseen/core)│
│  - onProgress callbacks     │
│  - classify(raw)            │
└──────┬──────────────────────┘
       │ Update job status
       ▼
┌─────────────────────────────┐
│   Job Store (in-memory)     │
│  - TTL: 1 hour              │
│  - Status + stages          │
│  - Result/error             │
└──────┬──────────────────────┘
       │ Return to client
       ▼
┌─────────────────────────────┐
│   React SPA                 │
│  - SeanceView (progress)    │
│  - SpiritSightView (render) │
│  - Whisper/Keyboard walks   │
└─────────────────────────────┘
```

### Component Interaction Diagram

```
<App>
  └─ <ReducedMotionProvider>
      └─ <SoundProvider>
          └─ <Router>
              ├─ <LandingView>
              │   ├─ <SampleCard> (loads from /api/samples)
              │   └─ <form> (submits to /api/audit)
              │
              ├─ <SeanceView>
              │   └─ usePoll(/api/audit/:id)
              │       → navigates to /audit/:id when done
              │
              └─ <AuditResultView>
                  ├─ useScale(containerRef)
                  ├─ <img> (screenshot from /api/.../screenshot.png)
                  ├─ <svg> (overlay)
                  │   └─ <HauntingOverlay> (×N hauntings)
                  ├─ <HauntingSidebar>
                  │   └─ groupHauntings(audit.hauntings)
                  ├─ <HauntingDetailDialog> (focus trap)
                  ├─ <WhisperWalk> (at /whisper)
                  │   └─ useWebSpeech(utterances)
                  ├─ <KeyboardWalk> (at /keyboard)
                  │   └─ Tab ghost animation
                  └─ <DaylightReport> (at /daylight)
                      ├─ groupByWCAG(audit.hauntings)
                      └─ Export buttons
```

---

## SPA Architecture

### Technology Stack

- **React 18** with TypeScript strict mode
- **Vite 5** for dev server and build
- **react-router-dom** for client-side routing
- **@fontsource/atkinson-hyperlegible** and **@fontsource/cormorant-garamond** (self-hosted)
- **focus-trap-react** for modal dialog focus management
- **CSS Modules** for component styles (scoped, no global pollution)

### Component Hierarchy

```
<App>
  <ReducedMotionProvider>
    <SoundProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingView />} />
          <Route path="/seance/:id" element={<SeanceView />} />
          <Route path="/audit/:jobId" element={<AuditResultView />}>
            <Route index element={<SpiritSightPanel />} />
            <Route path="keyboard" element={<KeyboardWalkPanel />} />
            <Route path="whisper" element={<WhisperWalkPanel />} />
            <Route path="daylight" element={<DaylightPanel />} />
          </Route>
          <Route path="/sample/:sampleId" element={<AuditResultView />}>
            <Route index element={<SpiritSightPanel />} />
            <Route path="keyboard" element={<KeyboardWalkPanel />} />
            <Route path="whisper" element={<WhisperWalkPanel />} />
            <Route path="daylight" element={<DaylightPanel />} />
          </Route>
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </Router>
    </SoundProvider>
  </ReducedMotionProvider>
</App>
```

### React Contexts

#### ReducedMotionContext

**File**: `apps/web/src/client/contexts/ReducedMotionContext.tsx`

```typescript
type ReducedMotionContextValue = {
  reducedMotion: boolean
}

export function ReducedMotionProvider({ children }: PropsWithChildren) {
  const [reducedMotion, setReducedMotion] = useState(() => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return (
    <ReducedMotionContext.Provider value={{ reducedMotion }}>
      {children}
    </ReducedMotionContext.Provider>
  )
}

export function useReducedMotion(): boolean {
  const ctx = useContext(ReducedMotionContext)
  return ctx.reducedMotion
}
```

#### SoundContext

**File**: `apps/web/src/client/contexts/SoundContext.tsx`

```typescript
type SoundContextValue = {
  soundEnabled: boolean
  toggleSound: () => void
}

export function SoundProvider({ children }: PropsWithChildren) {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    // Persist preference in localStorage
    const stored = localStorage.getItem('unseen:sound-enabled')
    return stored === 'true'
  })

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      localStorage.setItem('unseen:sound-enabled', String(next))
      return next
    })
  }, [])

  return (
    <SoundContext.Provider value={{ soundEnabled, toggleSound }}>
      {children}
    </SoundContext.Provider>
  )
}
```

---

## Landing View

**File**: `apps/web/src/client/views/LandingView.tsx`

### Layout

```
┌─────────────────────────────────────────┐
│          THE UNSEEN (h1)                │
│  "Which site do you dare to see         │
│   through their eyes?"                  │
│                                         │
│  [Enter a URL to audit]                │
│  [━━━━━━━━━━━━━━━━━━━]  [Begin audit] │
│                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Cursed  │ │ Sample  │ │ Sample  │ │
│  │  Shop   │ │   #2    │ │   #3    │ │
│  │  (home) │ │         │ │         │ │
│  └─────────┘ └─────────┘ └─────────┘ │
└─────────────────────────────────────────┘
```

### Accessibility

- **Heading hierarchy**: One `<h1>` ("THE UNSEEN"), followed by `<h2>` for "Try a sample"
- **Form label**: `<label htmlFor="url-input">Enter a URL to audit</label>` (visually styled as the tagline)
- **Submit button**: `<button type="submit">Begin audit</button>` with `--color-ecto` focus ring
- **Sample cards**: `<button>` elements (not divs) with accessible names "Load sample: Cursed Shop Home"

### Sample Cards

Loaded from `/api/samples` on mount. Each card displays:
- Sample name ("Cursed Shop: Home")
- Thumbnail (screenshot scaled to 200×150px)
- Haunting Score badge (uses severity colors)

**Click behavior**: Navigate to `/sample/:id`. The view fetches the sample from `/api/samples/:id`.

---

## Séance View (Loading Progress)

**File**: `apps/web/src/client/views/SeanceView.tsx`

### Polling Logic

```typescript
function SeanceView() {
  const { id } = useParams<{ id: string }>()
  const [status, setStatus] = useState<AuditStatusResponse | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const poll = async () => {
      const response = await fetch(`/api/audit/${id}`)
      const data: AuditStatusResponse = await response.json()
      setStatus(data)

      if (data.status === 'done') {
        navigate(`/spirit-sight/${id}`)
      }
    }

    const interval = setInterval(poll, 500)
    poll() // Initial fetch
    return () => clearInterval(interval)
  }, [id, navigate])

  return <SeanceDisplay status={status} />
}
```

### Stage Display

```typescript
const STAGE_LABELS: Record<JobStatus, string> = {
  queued: 'Waiting in queue…',
  loading: 'Loading page…',
  tree: 'Reading accessibility tree…',
  walking: 'Walking the keyboard path…',
  classifying: 'Classifying hauntings…',
}
```

**UI**:
- Current stage name in large text (`--text-3xl`)
- Elapsed time for each completed stage (from `stages` timestamps)
- `aria-live="polite"` region announces each new stage

**Error Handling**:
If `status === 'error'`, display the error message in an `aria-live="assertive"` region with a "Try another URL" button linking back to `/`.

---

## Spirit Sight View

**File**: `apps/web/src/client/views/SpiritSightView.tsx`

### Core Layout

```
┌────────────────────────────────────────────────────┐
│ [Sound Toggle] [Daylight Toggle] [Shortcuts Help]│
├──────────────────┬─────────────────────────────────┤
│                  │                                 │
│   Screenshot     │   Sidebar:                      │
│   + SVG Overlay  │   • Haunting Score: 42          │
│                  │   • Nameless Spirit (5) [Wraith]│
│   [hauntings     │   • The Fog (12) [Restless]     │
│    positioned    │   • ...                         │
│    with boxes]   │                                 │
│                  │   Tabs:                         │
│                  │   • Whisper Walk                │
│                  │   • Keyboard Walk               │
│                  │                                 │
└──────────────────┴─────────────────────────────────┘
```

### Screenshot Geometry and Scaling

**Problem**: Overlay positions must match screenshot elements exactly, never drift on resize/zoom.

**Solution**: Both screenshot and SVG overlay scale by the **same factor** from the PNG's natural dimensions.

**PNG Size Extraction**:
```typescript
// Read from loaded <img> element using naturalWidth/naturalHeight
const [scale, setScale] = useState<ScaleState | null>(null)

useEffect(() => {
  const img = imgRef.current
  if (!img) return
  
  const handleLoad = () => {
    const pngWidth = img.naturalWidth
    const pngHeight = img.naturalHeight
    const containerWidth = containerRef.current?.clientWidth ?? 1280
    setScale(computeScale(pngWidth, pngHeight, containerWidth))
  }
  
  if (img.complete) {
    handleLoad()
  } else {
    img.addEventListener('load', handleLoad)
    return () => img.removeEventListener('load', handleLoad)
  }
}, [audit.id]) // recalculate when audit changes
```

**Scale Computation**:
```typescript
type ScaleState = {
  pngWidth: number          // Intrinsic PNG width (from img.naturalWidth)
  pngHeight: number         // Intrinsic PNG height (from img.naturalHeight)
  containerWidth: number    // Available width in viewport
  scaleFactor: number       // min(1, containerWidth / pngWidth)
  scaledWidth: number       // pngWidth * scaleFactor
  scaledHeight: number      // pngHeight * scaleFactor
}

function computeScale(
  pngWidth: number,
  pngHeight: number,
  containerWidth: number
): ScaleState {
  const scaleFactor = Math.min(1, containerWidth / pngWidth)
  return {
    pngWidth,
    pngHeight,
    containerWidth,
    scaleFactor,
    scaledWidth: pngWidth * scaleFactor,
    scaledHeight: pngHeight * scaleFactor,
  }
}
```

**Do not use**: `audit.raw.viewportWidth` or `audit.raw.viewportHeight` for scaling. The viewport is the browser's render size; the PNG may be larger (device pixel ratio) or smaller (compression). Always read the PNG's natural dimensions.

**Rendering**:
```tsx
const screenshotUrl = audit.kind === 'job' 
  ? `/api/audit/${audit.id}/screenshot.png`
  : `/api/samples/${audit.id}/screenshot.png`

<div className="spirit-sight-stage" ref={containerRef} style={{ overflowY: 'scroll', height: '100vh' }}>
  <div style={{ width: scale.scaledWidth, height: scale.scaledHeight, position: 'relative' }}>
    <img
      ref={imgRef}
      src={screenshotUrl}
      alt="Audited page screenshot"
      width={scale.scaledWidth}
      height={scale.scaledHeight}
      onLoad={(e) => {
        // Fallback: if pngSize fails, read from img element
        const img = e.currentTarget
        setPngDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      }}
    />
    <svg
      className="haunting-overlay"
      width={scale.scaledWidth}
      height={scale.scaledHeight}
      viewBox={`0 0 ${scale.pngWidth} ${scale.pngHeight}`}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {audit.hauntings.filter(h => h.box !== null).map(h => (
        <HauntingOverlay key={h.id} haunting={h} scale={scale.scaleFactor} />
      ))}
    </svg>
    <canvas
      id="spirit-sight"
      width={scale.scaledWidth}
      height={scale.scaledHeight}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', opacity: spiritSightOpen ? 1 : 0 }}
    />
  </div>
</div>
```

**Resize Handler**:
```typescript
useEffect(() => {
  const observer = new ResizeObserver(entries => {
    const { width } = entries[0].contentRect
    setScale(computeScale(pngWidth, pngHeight, width))
  })
  observer.observe(containerRef.current!)
  return () => observer.disconnect()
}, [pngWidth, pngHeight])
```

**Key invariants**:
1. Screenshot `<img>` and SVG overlay always have the same `width` and `height` CSS pixels.
2. SVG `viewBox` matches the PNG's intrinsic dimensions, so `BoundingBox` coordinates map 1:1 to PNG pixels.
3. The stage scrolls vertically; horizontal scrolling is never needed (scale ≤ 1).

### The Spirit Sight Signature Moment

**Goal**: Transform the clean screenshot into a haunted view with drama and clarity.

**Initial State**: Spirit Sight view opens with the clean screenshot ("mortal eyes"). All haunting overlays are absent from the DOM. One primary button: **"Open Spirit Sight"** (`aria-pressed="false"`), positioned prominently above the screenshot.

**Activation Sequence** (standard motion):

1. **User clicks "Open Spirit Sight"**
   - Button state changes to `aria-pressed="true"` (label remains "Open Spirit Sight")
   - Focus remains on the button (no focus movement)

2. **Canvas fog layer appears** (800 ms)
   - A `<canvas id="spirit-sight">` absolutely positioned over the screenshot `<img>` only (never over app UI)
   - Canvas draws a 2D value-noise fog using a precomputed 256×256 noise tile
   - Fog color: `--color-mist` read via `getComputedStyle(document.documentElement).getPropertyValue('--color-mist')`
   - **Feathered wave**: a soft-edged band (64px vertical feather using alpha gradient) sweeps from `y=0` to `y=scaledHeight` over 800 ms with `ease-in-out` timing

3. **Haunting overlays fade in** (reading order)
   - Each haunting overlay element is inserted into the SVG and fades in (400 ms `ease-out`) as the fog wave passes its `box.y`
   - Overlays appear in reading order (sorted by `box.y` ascending, then `box.x` ascending)
   - Stagger: overlay at `y` starts fading when wave reaches `y - 100px` (slight lead for smooth reveal)

4. **Status announcement** (after wave completes)
   - A polite live region announces: "Spirit Sight open: {N} hauntings found, Haunting Score {score}"
   - **If sound is enabled**: the first Wraith haunting's speech (from `haunting.speech`) plays through the whisper engine (Web Speech with `pitch ≤ 0.8`, `rate ≤ 0.85`). The button click is the user gesture; no alert or second interaction required.
   - **If no Wraiths**: the first Restless haunting's speech plays
   - **If sound is off**: no audio plays

**Reduced Motion Variant** (`prefers-reduced-motion: reduce`):

- **No canvas animation**: the fog wave is disabled entirely
- **Instant reveal**: a CSS `filter: saturate(0.7) brightness(0.9)` is applied to the screenshot `<img>` instantly (no transition)
- **All overlays at once**: every haunting overlay appears simultaneously with no fade-in (just mount them)
- **Status announcement**: same polite live region, but no audio plays even if sound is enabled

**Toggle Off** (closing Spirit Sight):

- Overlays fade out (200 ms) and are removed from the DOM
- Canvas clears and is hidden (`opacity: 0`)
- Button returns to `aria-pressed="false"` (label remains "Open Spirit Sight")

**Acceptance Test**:

```typescript
// Before activation
expect(screen.queryByRole('button', { name: /Nameless Spirit/ })).not.toBeInTheDocument()
expect(canvas.style.opacity).toBe('0')

// After activation
await userEvent.click(screen.getByRole('button', { name: 'Open Spirit Sight', pressed: false }))
await waitFor(() => {
  expect(screen.getByRole('button', { name: 'Open Spirit Sight', pressed: true })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /Nameless Spirit|The Fog|Lost Soul/ }).length).toBeGreaterThan(0)
})
```

**Implementation Notes**:

- The `spiritSightOpen` boolean state lives in `SpiritSightView` component state (not global context)
- The fog canvas uses `requestAnimationFrame` for the wave animation
- Noise tile generation: Perlin or Simplex noise library (e.g. `simplex-noise` npm package) run once on mount, cached
- **No `aria-hidden` subtree may contain text nodes or focusable elements** — overlays are `<button>` elements semantically, not hidden

---

### The Overlay Layer: Interactive Buttons

**Problem**: Users must be able to navigate hauntings by keyboard, discover them in reading order, and activate them without pixel-perfect mouse precision.

**Solution**: Each haunting is represented by a focusable `<button>` element in the SVG, with a visual treatment (`aria-hidden` decorative shapes) and an accessible name.

**Button Structure**:

```tsx
<g>
  {/* Visual treatment: aria-hidden decorative SVG */}
  <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="..." />
    {/* Type-specific shapes, colors, patterns */}
  </g>
  
  {/* Interactive button: size in viewBox units so it scales with the SVG */}
  <foreignObject
    x={Math.max(0, box.x + box.width / 2 - 12 / scaleFactor)}
    y={Math.max(0, box.y + box.height / 2 - 12 / scaleFactor)}
    width={24 / scaleFactor}
    height={24 / scaleFactor}
  >
    <button
      className="haunting-overlay-button"
      onClick={() => openDialog(haunting)}
      aria-label={`${hauntingDisplayName(haunting.type)}: ${elementLabel(haunting)}, ${haunting.severity}`}
      style={{ 
        width: '100%', 
        height: '100%', 
        minWidth: '100%', 
        minHeight: '100%',
        pointerEvents: 'auto'
      }}
    />
  </foreignObject>
</g>
```

**Accessible Name Format**:

```typescript
function buildOverlayLabel(haunting: Haunting): string {
  const typeName = hauntingDisplayName(haunting.type) // "Nameless Spirit", not "NamelessSpirit"
  const element = elementLabel(haunting) // role + name, or landmark context
  const severity = haunting.severity // "Wraith", "Restless", "Banished"
  return `${typeName}: ${element}, ${severity}`
}

// Examples:
// "Nameless Spirit: Add to cart button, Wraith"
// "The Fog: Shop now link, Restless"
// "Whispering Field: Email input, Banished"
// "Shattered Order: Missing heading level 2, Restless"
```

**Element Label** (from haunting data):

```typescript
function elementLabel(haunting: Haunting): string {
  if (haunting.speech) {
    // Use the screen-reader announcement if available
    return haunting.speech
  }
  // Fallback: extract role and name from htmlSnippet or box context
  return haunting.htmlSnippet.match(/<(\w+)/)?.[1] || 'element'
}
```

**Reading Order** (DOM order = focus order):

Buttons are sorted before rendering:
```typescript
const sortedHauntings = [...audit.hauntings].sort((a, b) => {
  // Null boxes always sort last
  if (!a.box && !b.box) return 0
  if (!a.box) return 1
  if (!b.box) return -1
  
  // Both have boxes: top to bottom, then left to right
  if (a.box.y !== b.box.y) return a.box.y - b.box.y
  return a.box.x - b.box.x
})
```

**Minimum Hit Area** (WCAG 2.5.8):

Each button is at least 24×24 CSS pixels. If the haunting's bounding box is smaller, the button is centered and expanded:

```typescript
const buttonSize = 24
const buttonX = Math.max(0, box.x + box.width / 2 - buttonSize / 2)
const buttonY = Math.max(0, box.y + box.height / 2 - buttonSize / 2)
```

**Pointer Events**:

- **SVG overlay container**: no `pointer-events` restriction (defaults to allow interaction)
- **Decorative SVG shapes** (`aria-hidden` groups): `pointer-events: none`
- **Buttons inside foreignObject**: `pointer-events: auto` (explicit, to override any inheritance)
- **Screenshot**: no pointer events needed (not interactive)
- **Fog canvas**: `pointer-events: none`

**Focus Ring** (dual-tone for visibility on any background):

```css
.haunting-overlay-button:focus-visible {
  outline: 3px solid var(--color-ecto);
  outline-offset: 2px;
  box-shadow:
    0 0 0 2px var(--color-ink),  /* Inner halo */
    0 0 0 7px var(--color-ink);  /* Outer halo */
}
```

**Rationale**: The dual-tone ring (ecto accent with ink halo) ensures ≥3:1 contrast against any screenshot background color. The ecto outline is visible against dark backgrounds; the ink halo provides contrast against light backgrounds.

**Focus Scroll Behavior** (WCAG 2.4.11):

When a button receives focus, it scrolls into view with `scroll-margin` to avoid being obscured by any sticky header:

```css
.haunting-overlay-button {
  scroll-margin: 80px; /* Height of app header */
}
```

---

## Haunting Visual Treatments (All 10 Types)

**File**: `apps/web/src/client/components/HauntingOverlay.tsx`

Each haunting type renders a distinct visual treatment inside the SVG overlay. All positions are in raw screenshot coordinates (SVG `viewBox` handles scaling). Every treatment is wrapped in `<g aria-hidden="true">` and paired with an interactive button (see Overlay Layer section above).

### 1. Nameless Spirit

**Haunting Definition**: Element becomes a faceless translucent ghost; its label text fades out

**Shape**: Translucent ghost silhouette (rounded rect with gradient fill)
**Color**: `--color-mist` with 60% opacity
**Motion** (standard): subtle vertical bob (±3px over 3s, `ease-in-out` infinite)
**Reduced motion**: static, no bob

```tsx
<g aria-hidden="true" className="nameless-spirit-visual">
  <defs>
    <linearGradient id="ghost-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="var(--color-mist)" stopOpacity="0.8" />
      <stop offset="100%" stopColor="var(--color-mist)" stopOpacity="0.3" />
    </linearGradient>
  </defs>
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    rx={4}
    fill="url(#ghost-gradient)"
    className={reducedMotion ? '' : 'ghost-bob'}
  />
</g>
```

### 2. Hollow Portrait

**Haunting Definition**: Image goes hollow-eyed and desaturated

**Shape**: Dashed border around the image, two hollow circles for eyes
**Color**: `--color-mist` border, `--color-ink` eye sockets
**Motion**: none (images are static)
**Reduced motion**: same

```tsx
<g aria-hidden="true" className="hollow-portrait-visual">
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    fill="none"
    stroke="var(--color-mist)"
    strokeWidth={2}
    strokeDasharray="4 4"
  />
  <circle cx={box.x + box.width * 0.33} cy={box.y + box.height * 0.4} r={8} fill="var(--color-ink)" />
  <circle cx={box.x + box.width * 0.67} cy={box.y + box.height * 0.4} r={8} fill="var(--color-ink)" />
</g>
```

### 3. The Fog

**Haunting Definition**: A fog overlay on the text element; density proportional to the contrast deficit

**Shape**: Rectangle with noise pattern fill
**Color**: `--color-mist` with opacity 0.3–0.8 (computed from contrast deficit)
**Motion** (standard): slow horizontal drift of the noise pattern (20s linear infinite)
**Reduced motion**: static fog, no drift

```tsx
<g aria-hidden="true" className="fog-visual">
  <defs>
    <pattern id={`fog-pattern-${haunting.id}`} width="64" height="64" patternUnits="userSpaceOnUse">
      <image href="/fog-noise-tile.png" width="64" height="64" />
    </pattern>
  </defs>
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    fill={`url(#fog-pattern-${haunting.id})`}
    opacity={computeFogOpacity(haunting)} // 0.3–0.8 based on actual contrast from TextNodeStyle
    style={{ mixBlendMode: 'multiply' }}
    className={reducedMotion ? '' : 'fog-drift'}
  />
</g>

function computeFogOpacity(haunting: Haunting): number {
  // Extract contrast data from the haunting's raw data if available
  // For now, default to 0.6 (medium fog)
  // TODO: derive from audit.raw.textNodeStyles[haunting.nodeIds[0]]
  return 0.6
}
```

### 4. Lost Soul

**Haunting Definition**: A soul trapped behind glass; the Tab path ghost walks straight past it

**Shape**: Frosted glass overlay (gradient fill) + diagonal "X" mark
**Color**: `--color-mist` gradient for glass, `--color-mist` strokes for X
**Motion**: none (the "walk straight past" is handled by the Keyboard Walk animation)
**Reduced motion**: same

```tsx
<g aria-hidden="true" className="lost-soul-visual">
  <defs>
    <linearGradient id="glass-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="var(--color-mist)" stopOpacity="0.4" />
      <stop offset="100%" stopColor="var(--color-mist)" stopOpacity="0.6" />
    </linearGradient>
  </defs>
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    fill="url(#glass-gradient)"
  />
  <line x1={box.x} y1={box.y} x2={box.x + box.width} y2={box.y + box.height} stroke="var(--color-mist)" strokeWidth={2} opacity={0.7} />
  <line x1={box.x + box.width} y1={box.y} x2={box.x} y2={box.y + box.height} stroke="var(--color-mist)" strokeWidth={2} opacity={0.7} />
</g>
```

### 5. Cursed Loop

**Haunting Definition**: A glowing red cursed circle around the trapped region; the walking ghost gets stuck

**Shape**: Ellipse outline around the trap region
**Color**: `--color-ember` (red)
**Motion** (standard): continuous glow pulse (2s `ease-in-out` infinite) for inescapable traps; 2 pulses for escapable cycles
**Reduced motion**: static ring, no pulse

```tsx
<g aria-hidden="true" className="cursed-loop-visual">
  <ellipse
    cx={box.x + box.width / 2}
    cy={box.y + box.height / 2}
    rx={box.width / 2 + 10}
    ry={box.height / 2 + 10}
    fill="none"
    stroke="var(--color-ember)"
    strokeWidth={3}
    opacity={0.8}
    className={reducedMotion ? '' : (haunting.kind === 'inescapable' ? 'cursed-loop-glow' : 'cursed-loop-pulse')}
  />
</g>

// CSS:
.cursed-loop-glow {
  animation: glow 2s ease-in-out infinite;
}
.cursed-loop-pulse {
  animation: pulse 1s ease-in-out 2; /* 2 cycles for escapable */
}
```

### 6. Invisible Wanderer

**Haunting Definition**: Ghost footsteps with no accompanying light

**Shape**: Two footprint icons (SVG paths)
**Color**: `--color-mist` with 40% opacity
**Motion**: none (the "wandering" is conceptual; this is a focus indicator failure)
**Reduced motion**: same

```tsx
<g aria-hidden="true" className="invisible-wanderer-visual">
  <path
    d="M5,15 Q7,12 10,12 Q12,12 12,15 L11,20 Q10,22 8,22 Q6,22 5,20 Z"
    transform={`translate(${box.x + 5}, ${box.y + 5})`}
    fill="var(--color-mist)"
    opacity={0.4}
  />
  <path
    d="M5,15 Q7,12 10,12 Q12,12 12,15 L11,20 Q10,22 8,22 Q6,22 5,20 Z"
    transform={`translate(${box.x + 25}, ${box.y + 20}) scale(-1, 1)`} // flipped footprint
    fill="var(--color-mist)"
    opacity={0.4}
  />
</g>
```

### 7. Whispering Field

**Haunting Definition**: A form field with a ghostly mouth and no words

**Shape**: Dashed outline around the input, plus a wavy path representing a mouth
**Color**: `--color-ecto` outline, `--color-mist` mouth
**Motion**: none
**Reduced motion**: same

```tsx
<g aria-hidden="true" className="whispering-field-visual">
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    fill="none"
    stroke="var(--color-ecto)"
    strokeWidth={2}
    strokeDasharray="6 3"
  />
  <path
    d={`M ${box.x + 10} ${box.y + box.height - 10} Q ${box.x + box.width/2} ${box.y + box.height - 20} ${box.x + box.width - 10} ${box.y + box.height - 10}`}
    fill="none"
    stroke="var(--color-mist)"
    strokeWidth={1.5}
  />
</g>
```

### 8. Silent Tongue

**Haunting Definition**: A page-level banner: the spirits speak a garbled tongue

**Shape**: Full-width banner at top of screenshot (not tied to a specific element box)
**Color**: `--color-ember` background, `--color-bone` text
**Motion**: none (page-level, always visible)
**Reduced motion**: same

```tsx
<g aria-hidden="true" className="silent-tongue-visual" style={{ pointerEvents: 'none' }}>
  <rect
    x={0}
    y={0}
    width={pngWidth}
    height={40}
    fill="var(--color-ember)"
    opacity={0.9}
  />
  {/* Visual symbol only - no text in aria-hidden */}
  <text
    x={20}
    y={25}
    fontSize={20}
    fill="var(--color-bone)"
  >
    ⚠
  </text>
</g>
```

The warning message "The spirits speak a garbled tongue (missing lang attribute)" appears only on the accessible overlay button and in the sidebar, never inside the aria-hidden visual.

### 9. Shattered Order

**Haunting Definition**: Broken gravestone headings in an outline panel view

**Shape**: This haunting is not rendered as an overlay on the screenshot. Instead, it appears in the sidebar "Structural issues" section with a broken-gravestone icon.

**Sidebar Representation**:
```tsx
<div className="shattered-order-item">
  <svg width="24" height="24" viewBox="0 0 24 24">
    {/* Broken gravestone icon */}
    <path d="M..." fill="var(--color-mist)" />
  </svg>
  <span>{haunting.explanation}</span>
</div>
```

### 10. The Veiled

**Haunting Definition**: The element dissolves into thick, impenetrable fog — distinct from the lighter contrast-failure fog of The Fog haunting

**Shape**: Thick fog rectangle (solid, not patterned) with high opacity
**Color**: `--color-ink` with 70% opacity (much darker than The Fog)
**Motion** (standard): slow fade pulse (4s `ease-in-out` infinite, opacity 0.6–0.8)
**Reduced motion**: static at 70% opacity

```tsx
<g aria-hidden="true" className="veiled-visual">
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    fill="var(--color-ink)"
    opacity={0.7}
    className={reducedMotion ? '' : 'veiled-pulse'}
  />
</g>

// CSS:
.veiled-pulse {
  animation: fade-pulse 4s ease-in-out infinite;
}
@keyframes fade-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 0.8; }
}
```

---

## Haunting Sidebar

**File**: `apps/web/src/client/components/HauntingSidebar.tsx`

### Layout

```
┌────────────────────────────┐
│ Haunting Score: 42         │
│ [█████░░░░░░░░░░░] 42/100 │
├────────────────────────────┤
│ ▸ Nameless Spirit (5) 👻  │  ← Wraith color
│ ▸ The Fog (12) 🌫️          │  ← Restless color
│ ▾ Lost Soul (3) 💀         │  ← Banished, expanded
│   • button at #checkout    │
│   • div.card at #product-1 │
│   • div.card at #product-2 │
├────────────────────────────┤
│ [Whisper Walk] [Keyboard] │
└────────────────────────────┘
```

### Grouping Logic

```typescript
type HauntingGroup = {
  type: HauntingType
  count: number // Primary instances only
  severity: HauntingSeverity // Most severe in group
  instances: Haunting[]
  expanded: boolean
}

function groupHauntings(hauntings: Haunting[]): HauntingGroup[] {
  const groups = new Map<HauntingType, Haunting[]>()
  
  for (const h of hauntings) {
    if (!groups.has(h.type)) groups.set(h.type, [])
    groups.get(h.type)!.push(h)
  }

  return Array.from(groups.entries()).map(([type, instances]) => ({
    type,
    count: instances.length,
    severity: mostSevere(instances.map(h => h.severity)),
    instances,
    expanded: false, // Initially collapsed
  }))
}

function mostSevere(severities: HauntingSeverity[]): HauntingSeverity {
  if (severities.includes('Wraith')) return 'Wraith'
  if (severities.includes('Restless')) return 'Restless'
  return 'Banished'
}
```

### Severity Colors

```typescript
const SEVERITY_COLORS = {
  Wraith: 'var(--color-ember)',
  Restless: 'var(--color-candle)',
  Banished: 'var(--color-mist)',
}
```

### Click Behavior

- **Group header click**: Toggle expand/collapse
- **Instance click**: Open haunting detail dialog

---

## Haunting Detail Dialog

**File**: `apps/web/src/client/components/HauntingDetailDialog.tsx`

### Modal Structure

```tsx
<FocusTrap active={isOpen}>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    className="haunting-dialog"
  >
    <header>
      <h2 id="dialog-title">{haunting.type}</h2>
      <span className={`severity-badge ${haunting.severity}`}>
        {haunting.severity}
      </span>
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="close-button"
      >
        ✕
      </button>
    </header>

    <section>
      <h3>Who is affected</h3>
      <p>{haunting.persona}</p>
      {/* e.g. "As a blind shopper using NVDA, I hear only 'button'" */}
    </section>

    <section>
      <h3>What's wrong</h3>
      <p>{haunting.explanation}</p>
    </section>

    <section>
      <h3>WCAG Criterion</h3>
      {haunting.wcag.map(w => (
        <div key={w.id}>
          <a href={w.url} target="_blank" rel="noopener noreferrer">
            {w.id} {w.title} (Level {w.level})
          </a>
        </div>
      ))}
    </section>

    <section>
      <h3>Offending HTML</h3>
      <pre><code>{haunting.htmlSnippet}</code></pre>
    </section>

    <section>
      <h3>Suggested Fix</h3>
      <p>{haunting.fix.instruction}</p>
      <pre><code>{haunting.fix.codeSnippet}</code></pre>
    </section>

    <footer>
      <button onClick={() => copyKiroPrompt(haunting)}>
        Copy as Kiro prompt
      </button>
    </footer>
  </div>
</FocusTrap>
```

### Kiro Prompt Generation

```typescript
function generateKiroPrompt(haunting: Haunting): string {
  return `Fix this ${haunting.type} haunting:
  
Element: ${haunting.htmlSnippet}

Issue: ${haunting.explanation}

Fix: ${haunting.fix.instruction}

${haunting.fix.codeSnippet}`
}
```

**Copy Button**: Uses `navigator.clipboard.writeText()` and shows a temporary "Copied!" toast.

### Focus Management

- **On open**: Focus moves to the dialog container (`tabindex="-1"`), so a screen reader reads the dialog from its title; the container draws no focus ring because its ecto border already marks it (fix list item 11)
- **While open**: Focus is trapped inside the dialog (cannot Tab outside)
- **On close**: Focus returns to the trigger element (the haunting overlay or sidebar item)
- **Escape key**: Closes the dialog

---

## Whisper Walk

**File**: `apps/web/src/client/components/WhisperWalk.tsx`

### Speech Track Generation

The Whisper Walk reads the **entire page in accessibility-tree order**, not just the hauntings. It uses `@the-unseen/core`'s `announce(node, raw)` function to generate speech for every visible, non-ignored AX node.

**Helper exported by core** (to be added in this spec as a small task):

```typescript
// packages/core/src/classifier/speech.ts
export type SpeechLine = {
  backendDOMNodeId: number // 0 when the AX node has no DOM mapping
  text: string             // from announce(node, raw)
  note?: string            // from announceNote(node), e.g. "name disappears when typing"
  box: BoundingBox | null  // from raw.boundingBoxes
}

export function buildSpeechTrack(raw: RawAudit): SpeechLine[] {
  return raw.axNodes
    .filter(node => !node.ignored)
    .map(node => {
      const text = announce(node, raw)
      if (text === '') return null // skip generic/none/presentation
      
      const box = raw.boundingBoxes.find(b => b.backendDOMNodeId === node.backendDOMNodeId) || null
      
      return {
        backendDOMNodeId: node.backendDOMNodeId,
        text,
        note: announceNote(node),
        box,
      }
    })
    .filter((line): line is SpeechLine => line !== null)
}
```

**UI Component**:

```typescript
import { buildSpeechTrack } from '@the-unseen/core'

type SpeechLine = {
  backendDOMNodeId: number
  text: string
  note?: string
  box: BoundingBox | null
}

function WhisperWalk({ audit }: { audit: ClassifiedAudit }) {
  const { soundEnabled, toggleSound } = useSound()
  const [speechTrack, setSpeechTrack] = useState<SpeechLine[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped')
  const [captionsOnlyMode, setCaptionsOnlyMode] = useState(false)
  const [speed, setSpeed] = useState<0.5 | 0.75 | 1>(1) // Capped to enforce whisper rate
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  }, [])

  useEffect(() => {
    // Build speech track from raw AX tree using core helper
    const track = buildSpeechTrack(audit.raw)
    
    // Override with haunting speech where present
    const enriched = track.map(line => {
      const haunting = audit.hauntings.find(h => h.nodeIds.includes(line.backendDOMNodeId))
      if (haunting?.speech) {
        return {
          ...line,
          text: haunting.speech,
          note: haunting.speechNote,
        }
      }
      return line
    })
    
    setSpeechTrack(enriched)
  }, [audit])

  const speak = (index: number) => {
    const line = speechTrack[index]
    const speech = new SpeechSynthesisUtterance(line.text)
    
    // Whisper effect: pitch ≤ 0.8, rate ≤ 0.85
    speech.pitch = 0.8
    speech.rate = Math.min(0.85, 0.85 * speed) // Speed multiplies, never exceeds 0.85
    
    if (selectedVoice) speech.voice = selectedVoice

    speech.onstart = () => {
      setPlaybackState('playing')
      if (line.box) highlightElement(line.box) // Highlight on screenshot
    }

    speech.onend = () => {
      if (index < speechTrack.length - 1) {
        setCurrentIndex(index + 1)
        speak(index + 1)
      } else {
        setPlaybackState('stopped')
        setCurrentIndex(0)
      }
    }

    speech.onerror = () => {
      // Auto-advance on error (e.g. voice unavailable)
      if (index < speechTrack.length - 1) {
        setCurrentIndex(index + 1)
        speak(index + 1)
      } else {
        setPlaybackState('stopped')
      }
    }

    window.speechSynthesis.speak(speech)
  }

  const advanceCaptionTimer = (index: number) => {
    const line = speechTrack[index]
    const duration = Math.max(1500, line.text.length * 60) // 60ms per character, min 1500ms
    
    setTimeout(() => {
      if (index < speechTrack.length - 1) {
        setCurrentIndex(index + 1)
        advanceCaptionTimer(index + 1)
      } else {
        setPlaybackState('stopped')
        setCurrentIndex(0)
      }
    }, duration)
  }

  const play = () => {
    if (captionsOnlyMode) {
      setPlaybackState('playing')
      advanceCaptionTimer(currentIndex)
    } else {
      if (!soundEnabled) {
        // Pressing Play is the user gesture; enable sound
        toggleSound()
      }
      setPlaybackState('playing')
      speak(currentIndex)
    }
  }

  const pause = () => {
    window.speechSynthesis.cancel()
    setPlaybackState('paused')
  }

  const stepNext = () => {
    window.speechSynthesis.cancel()
    const next = Math.min(currentIndex + 1, speechTrack.length - 1)
    setCurrentIndex(next)
    if (playbackState === 'playing' && !captionsOnlyMode) {
      speak(next)
    }
  }

  const stepPrev = () => {
    window.speechSynthesis.cancel()
    const prev = Math.max(currentIndex - 1, 0)
    setCurrentIndex(prev)
    if (playbackState === 'playing' && !captionsOnlyMode) {
      speak(prev)
    }
  }

  const currentLine = speechTrack[currentIndex]

  return (
    <section className="whisper-walk" aria-label="Whisper walk">
      <h3>Hear What They Hear</h3>
      
      <div
        className="live-caption"
        aria-live={playbackState === 'playing' && !captionsOnlyMode ? 'off' : 'polite'}
      >
        <p className="speech-text">{currentLine?.text}</p>
        {currentLine?.note && <p className="speech-note">{currentLine.note}</p>}
        <p className="speech-counter">{currentIndex + 1} of {speechTrack.length}</p>
      </div>
      
      <div className="controls" role="group" aria-label="Playback controls">
        <button onClick={play} disabled={playbackState === 'playing'} aria-label="Play">
          ▶️ Play
        </button>
        <button onClick={pause} disabled={playbackState !== 'playing'} aria-label="Pause">
          ⏸️ Pause
        </button>
        <button onClick={stepPrev} aria-label="Previous utterance">
          ⏮️ Back
        </button>
        <button onClick={stepNext} aria-label="Next utterance">
          ⏭️ Forward
        </button>
      </div>

      <div className="settings" role="group" aria-label="Whisper walk settings">
        <div className="speed-control">
          <label htmlFor="speed-select">Speed</label>
          <select id="speed-select" value={speed} onChange={e => setSpeed(Number(e.target.value) as 0.5 | 0.75 | 1)}>
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
          </select>
        </div>

        <div className="voice-control">
          <label htmlFor="voice-select">Voice</label>
          <select
            id="voice-select"
            onChange={e => setSelectedVoice(voices[Number(e.target.value)] || null)}
            disabled={voices.length === 0}
          >
            <option value="">Default</option>
            {voices.map((v, i) => (
              <option key={i} value={i}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>

        <div className="captions-toggle">
          <label>
            <input
              type="checkbox"
              checked={captionsOnlyMode}
              onChange={e => setCaptionsOnlyMode(e.target.checked)}
            />
            Captions only (no audio)
          </label>
        </div>
      </div>
    </section>
  )
}

function highlightElement(box: BoundingBox) {
  // Scroll to and highlight the element on the screenshot
  const overlay = document.querySelector(`.haunting-overlay-box[data-node-id="${box.backendDOMNodeId}"]`)
  overlay?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  overlay?.classList.add('highlighted')
  setTimeout(() => overlay?.classList.remove('highlighted'), 2000)
}
```

### Key Design Decisions

1. **Speech track = whole AX tree**: Not just hauntings. Every visible, non-ignored node gets an utterance. Haunted nodes use `haunting.speech` (which may be a Nameless Spirit's role-only announcement or a Whispering Field's "edit text, blank").

2. **One "Hear what they hear" button**: Pressing Play is the user gesture that enables sound if it's off. No separate modal or confirmation.

3. **Captions mirror audio**: A visible caption shows the current utterance text. It has `aria-live="polite"` in captions-only or manual-step mode, and `aria-live="off"` during audio playback (the speech itself is the announcement).

4. **Speed cap**: Speed controls multiply the base rate, but `rate` is clamped to `0.85` (the whisper ceiling). Speeds above 1× shorten pauses between utterances instead.

5. **Caption-only mode**: When enabled, captions advance on a timer (`max(1500 ms, text.length * 60)`). No audio plays. Play, pause, step forward and back all work.

---

## Keyboard Walk

**File**: `apps/web/src/client/components/KeyboardWalk.tsx`

### Ghost Animation Following Real Tab Steps

The Keyboard Walk displays an animated ghost following the actual `TabStep[]` sequence from `audit.raw.tabWalkResult.steps`. Lost Souls (from hauntings with type `LostSoul`) appear behind glass and are skipped by the ghost. Escapable cycles circle once then break free; inescapable Cursed Loops circle until the user stops them.

**Component**:

```typescript
function KeyboardWalk({ audit }: { audit: ClassifiedAudit }) {
  const reducedMotion = useReducedMotion()
  const [currentStep, setCurrentStep] = useState(0)
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped')
  const [speed, setSpeed] = useState(1) // 1× = 300ms per step
  const [lostSoulsRevealed, setLostSoulsRevealed] = useState<Set<number>>(new Set())

  const steps = audit.raw.tabWalkResult.steps
  const lostSoulBoxes = audit.hauntings
    .filter(h => h.type === 'LostSoul')
    .map(h => h.box)
    .filter((box): box is BoundingBox => box !== null)
  
  const cursedLoops = audit.hauntings.filter(h => h.type === 'CursedLoop')
  const escapableCycles = audit.raw.tabWalkResult.cycles.filter(c => c.escapable)

  const play = () => {
    setPlaybackState('playing')
    animateStep(currentStep)
  }

  const pause = () => {
    setPlaybackState('paused')
  }

  const stepNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const stepBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const restart = () => {
    setCurrentStep(0)
    setLostSoulsRevealed(new Set())
    setPlaybackState('stopped')
  }

  const playbackStateRef = useRef(playbackState)
  useEffect(() => {
    playbackStateRef.current = playbackState
  }, [playbackState])

  const animateStep = (index: number) => {
    if (playbackStateRef.current !== 'playing' || index >= steps.length) {
      setPlaybackState('stopped')
      return
    }

    const step = steps[index]
    const box = audit.raw.boundingBoxes.find(b => b.backendDOMNodeId === Number(step.backendDOMNodeId))
    
    // Reveal Lost Souls between previous and current step (reading order)
    if (index > 0) {
      const prevBox = audit.raw.boundingBoxes.find(b => b.backendDOMNodeId === Number(steps[index - 1].backendDOMNodeId))
      if (prevBox && box) {
        const soulsInBetween = lostSoulBoxes.filter(soul => 
          soul.y > prevBox.y && soul.y < box.y ||
          (soul.y === prevBox.y && soul.x > prevBox.x && soul.x < box.x)
        )
        if (soulsInBetween.length > 0) {
          setLostSoulsRevealed(prev => new Set([...prev, ...soulsInBetween.map(s => s.backendDOMNodeId)]))
          announceStatus(`Lost Soul skipped: ${soulsInBetween.length} element(s)`)
        }
      }
    }

    // Check for Cursed Loop
    const inLoop = cursedLoops.find(loop => loop.nodeIds.includes(Number(step.backendDOMNodeId)))
    if (inLoop) {
      // Circle up to 3 times before stopping
      const visitCount = steps.slice(0, index + 1).filter(s => loop.nodeIds.includes(Number(s.backendDOMNodeId))).length
      if (visitCount >= 3) {
        announceStatus('Trapped: keyboard users cannot leave this dialog')
        setPlaybackState('stopped')
        return
      }
    }

    // Check for escapable cycle
    const inEscapableCycle = escapableCycles.find(cycle => 
      cycle.nodeIds.includes(step.backendDOMNodeId)
    )
    if (inEscapableCycle && inEscapableCycle.escapable) {
      // Circle once: when we first return to the cycle start, announce the break
      const cycleStartId = inEscapableCycle.nodeIds[0]
      const isReturning = step.backendDOMNodeId === cycleStartId && index > inEscapableCycle.startStepIndex
      if (isReturning) {
        announceStatus('Escapable cycle: circling once, then breaking free')
      }
    }

    setCurrentStep(index)

    const stepDuration = reducedMotion ? 0 : 300 / speed
    setTimeout(() => animateStep(index + 1), stepDuration)
  }

  const currentBox = audit.raw.boundingBoxes.find(b => b.backendDOMNodeId === Number(steps[currentStep]?.backendDOMNodeId))
  const currentNode = audit.raw.axNodes.find(n => n.backendDOMNodeId === Number(steps[currentStep]?.backendDOMNodeId))
  const currentSpeech = currentNode?.name?.value || 'element'

  return (
    <section className="keyboard-walk" aria-label="Keyboard walk">
      <h1>Keyboard Walk: {new URL(audit.raw.auditedUrl).hostname}</h1>
      
      <div className="walk-stage" style={{ position: 'relative' }}>
        {/* Ghost rendered inside the same SVG overlay layer */}
        <svg
          className="ghost-layer"
          width={scale.scaledWidth}
          height={scale.scaledHeight}
          viewBox={`0 0 ${scale.pngWidth} ${scale.pngHeight}`}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          {/* Lost Souls behind glass */}
          {lostSoulBoxes.map(box => (
            <g
              key={box.backendDOMNodeId}
              className={lostSoulsRevealed.has(box.backendDOMNodeId) ? 'lost-soul-revealed' : 'lost-soul-hidden'}
              opacity={lostSoulsRevealed.has(box.backendDOMNodeId) ? 1 : 0}
              style={{
                transition: reducedMotion ? 'none' : 'opacity 600ms ease-out',
              }}
            >
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill="url(#glass-gradient)"
                opacity={0.6}
              />
              <line x1={box.x} y1={box.y} x2={box.x + box.width} y2={box.y + box.height} stroke="var(--color-mist)" strokeWidth={2} />
              <line x1={box.x + box.width} y1={box.y} x2={box.x} y2={box.y + box.height} stroke="var(--color-mist)" strokeWidth={2} />
            </g>
          ))}
          
          {/* Tab ghost */}
          {currentBox && (
            <GhostIcon
              x={currentBox.x + currentBox.width / 2}
              y={currentBox.y + currentBox.height / 2}
              reducedMotion={reducedMotion}
            />
          )}

          {/* Ember ring for Cursed Loops */}
          {cursedLoops.map(loop => {
            const loopBox = loop.box
            if (!loopBox) return null
            
            // Determine if this is an escapable cycle
            const cycleData = audit.raw.tabWalkResult.cycles.find(c => 
              c.nodeIds.some(id => loop.nodeIds.includes(Number(id)))
            )
            const isEscapable = cycleData?.escapable ?? false
            
            return (
              <ellipse
                key={loop.id}
                cx={loopBox.x + loopBox.width / 2}
                cy={loopBox.y + loopBox.height / 2}
                rx={loopBox.width / 2 + 10}
                ry={loopBox.height / 2 + 10}
                fill="none"
                stroke="var(--color-ember)"
                strokeWidth={3}
                opacity={0.8}
                className={reducedMotion ? '' : (isEscapable ? 'cursed-loop-pulse' : 'cursed-loop-glow')}
              />
            )
          })}
        </svg>
      </div>

      <div className="live-status" aria-live="polite" aria-atomic="true">
        <p>Step {currentStep + 1} of {steps.length}: {currentSpeech}</p>
      </div>
      
      <div className="controls" role="group" aria-label="Keyboard walk controls">
        <button
          onClick={playbackState === 'playing' ? pause : play}
          aria-pressed={playbackState === 'playing'}
          aria-label={playbackState === 'playing' ? 'Pause walk' : 'Play walk'}
        >
          {playbackState === 'playing' ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button onClick={stepBack} disabled={currentStep === 0} aria-label="Step back">
          ⏮️ Back
        </button>
        <button onClick={stepNext} disabled={currentStep === steps.length - 1} aria-label="Step forward">
          ⏭️ Forward
        </button>
        <button onClick={restart} aria-label="Restart from beginning">
          ⏮️ Restart
        </button>
      </div>

      <div className="speed-control">
        <label htmlFor="walk-speed">Speed</label>
        <select id="walk-speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </div>
    </section>
  )
}

function GhostIcon({ x, y, reducedMotion }: { x: number; y: number; reducedMotion: boolean }) {
  return (
    <g
      className="tab-ghost"
      transform={`translate(${x}, ${y})`}
      style={{
        transition: reducedMotion ? 'none' : 'transform 300ms ease-in-out',
      }}
    >
      <circle cx={0} cy={0} r={16} fill="var(--color-ecto)" opacity={0.8} />
      <path
        d="M-6,-4 Q-6,-8 0,-8 Q6,-8 6,-4 L6,4 Q4,8 0,8 Q-4,8 -6,4 Z"
        fill="var(--color-bone)"
      />
    </g>
  )
}

function announceStatus(message: string) {
  const status = document.querySelector('.keyboard-walk .live-status p')
  if (status) {
    status.textContent = message
  }
}

function hasCircledBefore(cycle: TabCycle, currentIndex: number): boolean {
  // Simplified: check if we've visited any cycle member twice already
  // Real implementation would track cycle entry/exit indices
  return false // Placeholder
}
```

### CSS for Cursed Loop Pulse

```css
.cursed-loop-pulse {
  animation: cursed-pulse 2s ease-in-out infinite;
}

@keyframes cursed-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .cursed-loop-pulse {
    animation: none;
    opacity: 0.8;
  }
}
```

### Key Design Decisions

1. **Ghost in the same SVG overlay**: The ghost is a `<g>` element inside the same `<svg viewBox>` as the haunting overlays, so it scales identically and positions never drift.

2. **Lost Souls revealed in reading order**: Before moving from step i to i+1, the walk checks for Lost Soul boxes (from hauntings) between the two positions. If any exist, they fade in with the glass treatment (600ms, instant under reduced motion) and are announced via the live status.

3. **Escapable cycles**: The ghost circles the cycle members once (revisiting them in the Tab sequence), then breaks free and continues. The status announces "Escapable cycle: circling once, then breaking free".

4. **Inescapable Cursed Loops**: When the ghost reaches a node inside a Cursed Loop haunting, the ember ring pulses continuously and the walk stops with status "Cursed Loop: keyboard users cannot leave this dialog". The user must press Restart or manually step forward to continue.

5. **Reduced motion**: Under `prefers-reduced-motion`, the ghost's CSS `transition` is set to `none`, but the step interval is still 300 ms (not 0 ms, which would cause instant completion). Manual step mode (Play/Pause, Back, Forward) is unaffected.

---

## Route Focus and Keyboard Navigation

**File**: `apps/web/src/client/App.tsx` and each view component

### Focus Management on Route Changes

On every route transition, focus must move to the new view's `<h1>` element and the view must be announced to screen readers.

**Implementation**:

```typescript
// App.tsx
function App() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // On route change, focus the h1 inside <main>
    const h1 = mainRef.current?.querySelector('h1')
    if (h1 instanceof HTMLElement) {
      h1.tabIndex = -1 // Allow programmatic focus
      h1.focus()
    }

    // Announce the view change
    const viewName = getViewName(location.pathname)
    announceView(viewName)
  }, [location.pathname])

  return (
    <ReducedMotionProvider>
      <SoundProvider>
        <div className="app-shell">
          <header>
            <SoundToggle />
            <KeyboardHelpButton />
          </header>
          
          <main id="main" ref={mainRef} tabIndex={-1}>
            <Routes>
              <Route path="/" element={<LandingView />} />
              <Route path="/seance/:jobId" element={<SeanceView />} />
              <Route path="/audit/:jobId" element={<SpiritSightView />} />
              <Route path="/sample/:sampleId" element={<SpiritSightView />} />
            </Routes>
          </main>

          <footer>
            <p>THE UNSEEN · WCAG 2.2 accessibility auditor</p>
          </footer>

          <div
            id="app-announcer"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          />
        </div>
      </SoundProvider>
    </ReducedMotionProvider>
  )
}

function getViewName(pathname: string): string {
  if (pathname === '/') return 'The Unseen home'
  if (pathname.startsWith('/seance')) return 'The séance'
  if (pathname.startsWith('/audit') || pathname.startsWith('/sample')) {
    return 'Spirit Sight'
  }
  return 'Page'
}

function announceView(viewName: string) {
  const announcer = document.getElementById('app-announcer')
  if (announcer) {
    // Clear first, then announce (forces re-read)
    announcer.textContent = ''
    setTimeout(() => {
      announcer.textContent = `Navigated to ${viewName}`
    }, 50)
  }
}
```

**Per-View h1 Structure**:

| Route | h1 Text |
|-------|---------|
| `/` | "THE UNSEEN" |
| `/seance/:jobId` | "The séance" |
| `/audit/:jobId` or `/sample/:sampleId` | "Spirit Sight: {hostname}" |

Each h1 receives `tabIndex="-1"` on mount to allow programmatic focus without adding it to the natural Tab order.

### Keyboard Help Dialog

A visible "Keyboard help" button in the app header opens a modal dialog listing all keyboard shortcuts.

**Component**:

```typescript
function KeyboardHelpButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)} aria-label="Keyboard shortcuts help">
        ⌨️ Keyboard help
      </button>

      {isOpen && (
        <FocusTrap>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-help-title"
            className="keyboard-help-dialog"
          >
            <h2 id="keyboard-help-title">Keyboard Shortcuts</h2>
            
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Key</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Skip to main content</td>
                  <td><kbd>Tab</kbd> (from page load)</td>
                </tr>
                <tr>
                  <td>Open Spirit Sight</td>
                  <td><kbd>Enter</kbd> or <kbd>Space</kbd> on the toggle button</td>
                </tr>
                <tr>
                  <td>Navigate hauntings</td>
                  <td><kbd>Tab</kbd> through overlay buttons or sidebar</td>
                </tr>
                <tr>
                  <td>Whisper walk: Play/Pause</td>
                  <td><kbd>Enter</kbd> or <kbd>Space</kbd> on controls</td>
                </tr>
                <tr>
                  <td>Keyboard walk: Play/Pause</td>
                  <td><kbd>Enter</kbd> or <kbd>Space</kbd> on controls</td>
                </tr>
                <tr>
                  <td>Close dialog</td>
                  <td><kbd>Escape</kbd></td>
                </tr>
              </tbody>
            </table>

            <p className="note">
              <strong>Note:</strong> There are no single-character shortcuts. All actions require explicit button activation.
            </p>

            <button onClick={() => setIsOpen(false)} aria-label="Close keyboard help">
              Close
            </button>
          </div>
        </FocusTrap>
      )}
    </>
  )
}
```

### No Single-Character Shortcuts

The app does NOT implement single-character keyboard shortcuts (e.g. pressing `?` to open help, or `s` to toggle sound). All actions are performed via:
- Explicit button activation (`Enter`/`Space` on a focused button)
- Native form controls (`Tab`, `Shift+Tab`, `Escape` for dialogs)
- Standard browser shortcuts (`Ctrl+F` for find, etc.)

**Rationale**: Single-character shortcuts interfere with screen-reader quick-nav keys and form input. WCAG 2.1.4 (Character Key Shortcuts) requires that such shortcuts can be turned off, remapped, or only activate when the component has focus — it's simpler to avoid them entirely.

### Skip Link

Every view SHALL have a skip link as the first focusable element: "Skip to main content" linking to `#main`. On the Spirit Sight view, an additional skip link "Skip to the haunting list" appears first, linking to the sidebar's haunting list.

```tsx
<div className="skip-links">
  <a href="#haunting-list" className="skip-link">Skip to the haunting list</a>
  <a href="#main" className="skip-link">Skip to main content</a>
</div>
```

**CSS** (visually hidden by default, visible on focus):

```css
.skip-link {
  position: absolute;
  top: -9999px;
  left: -9999px;
  z-index: 999;
}

.skip-link:focus {
  position: fixed;
  top: 1rem;
  left: 1rem;
  padding: 0.75rem 1.5rem;
  background: var(--color-ecto);
  color: var(--color-ink);
  text-decoration: none;
  font-weight: 700;
  outline: 3px solid var(--color-bone);
  outline-offset: 2px;
}
```

### Button Accessible Names Include Visible Text

Every button's accessible name (via `aria-label` or the button's text content) SHALL include the button's visible text as a substring.

**Examples**:
- Visible text: "Play" → `aria-label="Play"` or no label (text content is sufficient)
- Visible text: "⏸️ Pause" → `aria-label="Pause walk"` (contains "Pause")
- Visible text: "Open Spirit Sight" → `aria-label="Open Spirit Sight"` (exact match)

**Violation**: Visible text "Export" with `aria-label="Download Markdown report"` (does not contain "Export") would fail WCAG 2.5.3 (Label in Name).

**Implementation Rule**: When a button has an `aria-label`, ensure the visible text (from `textContent` or an `aria-label` on a child icon) is a substring of the `aria-label`. Prefer no `aria-label` when the button's text content is sufficient.

---

## Daylight Mode

**File**: `apps/web/src/client/views/DaylightView.tsx` (rendered at `/audit/:id/daylight` or `/sample/:id/daylight`)

Daylight mode is a calm, high-contrast, motion-free WCAG report view. It groups hauntings by WCAG criterion, lists elements that need manual checks, displays the honest coverage note, and provides Markdown and JSON export. When `prefers-reduced-motion: reduce` is set, the Spirit Sight view defaults to showing the screenshot without automatic fog animation, and playback controls default to manual step mode.

### Layout

```
┌────────────────────────────────────────────────┐
│ h1: Daylight report: {hostname}                │
│ [Export Markdown] [Export JSON]                │
│                                                │
│ ⚠ Important: Automated checks find 30-40% ... │
│                                                │
│ ## Findings by WCAG criterion                  │
│                                                │
│ ### 1.1.1 Non-text Content (A)                 │
│ Hollow Portrait (5 elements, Restless)         │
│ • <img> at [selector]                          │
│ • <img> at [selector]                          │
│ ...                                            │
│                                                │
│ ### 1.3.1 Info and Relationships (A)           │
│ Shattered Order (1 element, Restless)          │
│ • Missing <h1>                                 │
│ Whispering Field (3 elements, Wraith)          │
│ • <input type="email"> at [selector]           │
│ ...                                            │
│                                                │
│ ## Needs manual check                          │
│ • Contrast uncertain (image background)        │
│   <p> at [selector]                            │
│ ...                                            │
└────────────────────────────────────────────────┘
```

### Grouping by WCAG Criterion

**Every** haunting instance is listed under **every** WCAG criterion in its `wcag[]` array (not only the primary). A Nameless Spirit on a button maps to 4.1.2 (primary), 2.4.4 (Link Purpose — if it's a link), and 1.1.1 (if it's an image button). All three sections list that haunting.

**Algorithm**:

```typescript
function groupByWCAG(hauntings: Haunting[]): Map<string, Haunting[]> {
  const groups = new Map<string, Haunting[]>()
  
  for (const haunting of hauntings) {
    for (const criterion of haunting.wcag) {
      if (!groups.has(criterion.id)) {
        groups.set(criterion.id, [])
      }
      groups.get(criterion.id)!.push(haunting)
    }
  }
  
  return groups
}
```

**Rendering**:

```tsx
<section>
  <h2>Findings by WCAG criterion</h2>
  
  {Array.from(groupByWCAG(audit.hauntings)).map(([criterionId, hauntings]) => {
    const criterion = hauntings[0].wcag.find(c => c.id === criterionId)!
    return (
      <section key={criterionId}>
        <h3>
          <a href={criterion.url} target="_blank" rel="noopener noreferrer">
            {criterionId} {criterion.title}
          </a>
          {' '}
          <span className="level-badge" data-level={criterion.level}>
            {criterion.level}
          </span>
        </h3>
        
        {/* Group by haunting type within this criterion */}
        {Object.entries(groupBy(hauntings, h => h.type)).map(([type, instances]) => (
          <div key={type} className="haunting-type-group">
            <h4>
              {hauntingDisplayName(type)} ({instances.length} {instances.length === 1 ? 'element' : 'elements'},
              {' '}
              {mostSevere(instances.map(h => h.severity))})
            </h4>
            <ul>
              {instances.map((h, i) => (
                <li key={i}>
                  <code>{h.htmlSnippet}</code>
                  <p>{h.fix.instruction}</p>
                  <details>
                    <summary>Fix code</summary>
                    <pre><code>{h.fix.codeSnippet}</code></pre>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    )
  })}
</section>
```

### Needs Manual Check

The `audit.needsManualCheck` array lists elements that could not be automatically verified. Display them in a separate section below the WCAG findings.

```tsx
<section>
  <h2>Needs manual check</h2>
  <p>
    These elements could not be automatically verified. Manual inspection is required to confirm
    whether they meet WCAG 2.2 criteria.
  </p>
  
  <ul>
    {audit.needsManualCheck.map((node, i) => (
      <li key={i}>
        <strong>{node.reason === 'contrast-uncertain' ? 'Contrast uncertain' : node.reason}</strong>
        {node.reason === 'contrast-uncertain' && (
          <p>The background is an image, gradient, or semi-transparent layer. Measure contrast manually.</p>
        )}
        <code>{node.htmlSnippet}</code>
      </li>
    ))}
  </ul>
  
  {audit.needsManualCheck.length === 0 && (
    <p><em>No elements flagged for manual review.</em></p>
  )}
</section>
```

### Coverage Disclaimer

Display this note **prominently at the top** of the Daylight report, before the WCAG findings. It is non-dismissible and always visible.

```tsx
<aside className="coverage-disclaimer" role="note" aria-label="Coverage note">
  <strong>Important:</strong> {audit.automatedCoverageNote}
</aside>
```

The `automatedCoverageNote` field (from `ClassifiedAudit`) contains:

> "Automated checks find approximately 30–40% of WCAG issues. Many success criteria require manual testing (reading order, meaningful sequence, error identification, focus order logic, etc.). This tool never claims a site is 'compliant' or 'accessible'."

**Styling**: Use a `--color-ember` left border (4px), `--color-ink` background with 90% opacity, and `--color-bone` text. Font size: `--text-base` (1rem).

### Export Buttons

Two export buttons at the top of the Daylight view: **Export as Markdown** and **Export as JSON**.

**Filename Format**:

```typescript
function generateFilename(audit: ClassifiedAudit, ext: 'md' | 'json'): string {
  const url = new URL(audit.raw.auditedUrl)
  const domain = url.hostname.replace(/\./g, '-')
  const timestamp = new Date(audit.raw.auditedAt).toISOString().slice(0, 19).replace(/:/g, '-')
  return `unseen-audit-${domain}-${timestamp}.${ext}`
}
// Example: unseen-audit-example-com-2026-12-04T15-30-00.md
```

**Markdown Export Structure**:

```markdown
# THE UNSEEN Audit Report

**URL**: {auditedUrl}
**Audited**: {auditedAt in ISO 8601}
**Haunting Score**: {score}/100

## Summary

- {wraith count} Wraith (critical)
- {restless count} Restless (warnings)
- {banished count} Banished (minor)

**Total hauntings detected**: {total}

---

## Coverage Note

{automatedCoverageNote}

---

## Findings by WCAG Criterion

### {criterion.id} {criterion.title} ({criterion.level})

#### {Haunting Display Name} ({count} elements, {severity})

- `{htmlSnippet}`
  **Fix**: {fix.instruction}
  ```html
  {fix.codeSnippet}
  ```

...

---

## Needs Manual Check

- **{reason}**: `{htmlSnippet}`

...

---

Generated by THE UNSEEN | https://the-unseen.app
```

**JSON Export**:

Serialize the full `ClassifiedAudit` object as JSON with 2-space indentation:

```typescript
function exportJSON(audit: ClassifiedAudit): void {
  const json = JSON.stringify(audit, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, generateFilename(audit, 'json'))
}
```

**Download Helper**:

```typescript
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Accessibility

- The Daylight view has `<h1>` "Daylight report: {hostname}"
- Each WCAG criterion is an `<h3>` (under the h2 "Findings by WCAG criterion")
- Each haunting type group is an `<h4>` (under the h3)
- All links to W3C WCAG docs open in a new tab with `rel="noopener noreferrer"`
- Export buttons have accessible names: `aria-label="Export as Markdown"` and `aria-label="Export as JSON"`
- The coverage note uses `role="note"` and `aria-label="Coverage note"` for screen readers



---

## Design System Integration

### CSS Custom Properties

**File**: `apps/web/src/client/styles/tokens.css`

```css
:root {
  /* Colors */
  --color-ink: #0B0A10;
  --color-bone: #ECE6D6;
  --color-ecto: #7CF5C8;
  --color-ember: #FF5A4E;
  --color-candle: #F4B860;
  --color-mist: #8E8AA8;

  /* Typography */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
  --text-display: 3rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Fonts */
  --font-body: 'Atkinson Hyperlegible', sans-serif;
  --font-display: 'Cormorant Garamond', serif;
}
```

### TypeScript Constants

**File**: `apps/web/src/client/tokens.ts`

```typescript
export const COLORS = {
  INK: '#0B0A10',
  BONE: '#ECE6D6',
  ECTO: '#7CF5C8',
  EMBER: '#FF5A4E',
  CANDLE: '#F4B860',
  MIST: '#8E8AA8',
} as const

export const TEXT_SIZES = {
  XS: '0.75rem',
  SM: '0.875rem',
  BASE: '1rem',
  LG: '1.125rem',
  XL: '1.25rem',
  XXL: '1.5rem',
  XXXL: '2rem',
  DISPLAY: '3rem',
} as const

export const SPACING = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem',
} as const
```

### Font Loading

**File**: `apps/web/src/client/main.tsx`

```typescript
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/cormorant-garamond/400.css'
```

No Google Fonts CDN; all fonts self-hosted via `@fontsource` packages.

### Hardcoded Value Detection

**ESLint Rule**: Custom rule or manual review to flag hardcoded hex colors not in `tokens.ts`.

---

## Accessibility Self-Audit

The app audits itself to prove WCAG 2.2 AA compliance. The self-audit test runs against the **production build served by Fastify**, not the Vite dev server.

### Test Strategy

**File**: `apps/web/e2e/self-audit.spec.ts` (Playwright test)

The test:
1. Builds the production app (`npm run build -w apps/web`)
2. Starts the Fastify server serving the production build (`NODE_ENV=production node dist/server/main.js`)
3. Loads a pre-audited sample (`/sample/cursed-shop-index`) to prime the app state
4. Navigates to every route: `/`, `/sample/cursed-shop-index`, `/sample/cursed-shop-index/keyboard`, `/sample/cursed-shop-index/whisper`, `/sample/cursed-shop-index/daylight`
5. For each route:
   - Waits for the view to render (asserts the h1 is present)
   - Checks that overlays/controls specific to that view are present (e.g. haunting buttons in Spirit Sight, Tab ghost in Keyboard walk)
   - Runs `auditAndClassify(url, { allowPrivate: true })` against `http://127.0.0.1:{PORT}`
   - Asserts `audit.hauntings.length === 0` and `audit.score === 0`
   - Asserts `audit.axeCrossCheck.unmapped.length === 0` (no axe violations missed by our classifier)

**Why production build**: The dev server (Vite) injects HMR scripts, source map references, and console logs that may alter the accessibility tree. The self-audit must run against the exact artifact that will be deployed.

### Implementation

```typescript
import { test, expect } from '@playwright/test'
import { auditAndClassify } from '@the-unseen/core'

const ROUTES = [
  { path: '/', h1: 'THE UNSEEN', description: 'Landing view' },
  { path: '/sample/cursed-shop-index', h1: /Spirit Sight:/, description: 'Spirit Sight view', 
    checkElement: 'button[aria-label*="Nameless Spirit"]' }, // Haunting overlay present
  { path: '/sample/cursed-shop-index/keyboard', h1: /Keyboard Walk:/, description: 'Keyboard Walk view',
    checkElement: '.tab-ghost' }, // Tab ghost SVG element present
  { path: '/sample/cursed-shop-index/whisper', h1: /Whisper Walk:/, description: 'Whisper Walk view',
    checkElement: 'button[aria-label="Play"]' }, // Whisper controls present
  { path: '/sample/cursed-shop-index/daylight', h1: /Daylight report:/, description: 'Daylight mode',
    checkElement: 'h2:has-text("Findings by WCAG criterion")' }, // Report section present
]

test.describe('Self-audit: zero hauntings on every route', () => {
  for (const route of ROUTES) {
    test(`${route.description} (${route.path})`, async ({ page }) => {
      // Navigate to the route
      await page.goto(route.path)
      
      // Assert the view rendered (h1 present)
      await expect(page.locator('h1')).toContainText(route.h1)
      
      // Assert the route-specific element is present (overlays, ghost, controls, report)
      if (route.checkElement) {
        await expect(page.locator(route.checkElement).first()).toBeVisible()
      }
      
      // Audit this route with the core engine
      const audit = await auditAndClassify(`http://127.0.0.1:${PORT}${route.path}`, {
        allowPrivate: true,
      })
      
      // Assert zero hauntings
      expect(audit.hauntings, `Hauntings found on ${route.path}:\n${formatHauntings(audit.hauntings)}`).toHaveLength(0)
      expect(audit.score).toBe(0)
      
      // Assert no unmapped axe violations
      expect(audit.axeCrossCheck.unmapped, `Unmapped axe violations on ${route.path}:\n${formatAxe(audit.axeCrossCheck.unmapped)}`).toHaveLength(0)
    })
  }
})

function formatHauntings(hauntings: Haunting[]): string {
  return hauntings.map(h => `  - ${h.type}: ${h.explanation}\n    ${h.htmlSnippet}`).join('\n')
}

function formatAxe(violations: AxeViolation[]): string {
  return violations.map(v => `  - ${v.id}: ${v.description} (${v.nodes.length} nodes)`).join('\n')
}
```

### Running the Test

```bash
# Build the production app
npm run build -w apps/web

# Start the production server in the background
npm run start -w apps/web &
export SERVER_PID=$!

# Run the self-audit test
npx playwright test -w apps/web

# Stop the server
kill $SERVER_PID
```

**CI Integration**: The `playwright.config.ts` for `apps/web` has a `webServer` block that starts the production Fastify server before tests:

```typescript
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  webServer: {
    command: 'npm run start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 10000, // 10s to start
  },
})
```

### Manual Accessibility Checklist

The self-audit test verifies automated checks only. Manual verification is required for:

- **Keyboard navigation**: Tab through every view, verify no traps, logical order
- **Focus indicators**: Visible `--color-ecto` outline with ≥3:1 contrast on every focusable element
- **Screen reader announcements**: NVDA/JAWS/VoiceOver reads all labels, live regions, and state changes correctly
- **Heading hierarchy**: One h1 per view, no skipped levels (checked in the test, but verify manually for semantic correctness)
- **Modal behavior**: Haunting detail dialog traps focus, Escape closes it, focus returns to trigger
- **Reduced motion**: All animations disabled when `prefers-reduced-motion: reduce` is set
- **Sound controls**: Web Speech and ambient drone do not autoplay; explicit user enable required
- **Contrast**: Design token contrast ratios verified in Vitest (see Testing Strategy below)

---

## Correctness Properties

**Not property-tested** (covered by example, integration and e2e tests instead):

- **UI rendering and layout** (React components, SVG overlays, CSS animations)
- **Infrastructure** (Fastify server, job queue, rate limiting)
- **Side-effect operations** (API calls, Web Speech, file downloads)
- **Configuration** (environment variables, server setup)

**Limited PBT scope** (pure helper functions only):

### Property 1: Scale computation is deterministic and proportional

*For any* screenshot dimensions and container dimensions where both are positive, `computeScale` SHALL return the same result on repeated calls, and the scale factor SHALL be the minimum of the width ratio and height ratio.

**Validates: Requirements 8.3, 8.4** (Screenshot and overlay scale together, positions never drift)

### Property 2: Contrast ratio is symmetric and bounded

*For any* two valid hex colors, the contrast ratio SHALL be symmetric (`ratio(A, B) === ratio(B, A)`), bounded between 1 and 21 inclusive, and monotonically increasing with luminance difference.

**Validates: Requirements 21** (Design token contrast test)

### Property 3: Filename sanitization produces valid filenames

*For any* audit URL and timestamp, the generated filename SHALL contain only alphanumeric characters, hyphens, and periods, and SHALL have the correct extension.

**Validates: Requirements 17.3, 17.6** (Export filename generation)

### Property 4: Fog density is bounded and monotonic in contrast deficit

*For any* contrast ratio below the threshold, `computeFogDensity` SHALL return a value in [0, 0.8], and SHALL increase monotonically as contrast ratio decreases.

**Validates: Requirements 9.3** (The Fog visual treatment)

---

**Primary testing strategy**: Unit tests for pure functions, component tests with React Testing Library, Playwright integration tests for full user flows, and a self-audit test verifying zero hauntings.

---

## Testing Strategy

Spirit Sight UI uses three testing layers: **Vitest** for pure functions and design token verification, **Playwright** for end-to-end flows, and a **self-audit test** proving WCAG 2.2 AA compliance.

### Unit Tests (Vitest)

**Location**: `apps/web/src/**/*.test.ts` (co-located with source files)

**Run Command**: `npm run test -w apps/web` (from workspace root) or `npx vitest --run` (from `apps/web`)

**Coverage**:
- Pure helper functions: `computeScale`, `groupBy`, `generateFilename`, `computeFogDensity`
- Design token contrast ratios (see below)
- Haunting grouping and sorting logic
- Markdown/JSON export generation

**Example**:

```typescript
import { describe, it, expect } from 'vitest'
import { computeScale } from './scale'

describe('computeScale', () => {
  it('scales to fit container width', () => {
    const result = computeScale(1280, 900, 640)
    expect(result.scaleFactor).toBe(0.5)
    expect(result.scaledWidth).toBe(640)
    expect(result.scaledHeight).toBe(450)
  })

  it('never scales above 1:1', () => {
    const result = computeScale(800, 600, 1920)
    expect(result.scaleFactor).toBe(1)
    expect(result.scaledWidth).toBe(800)
    expect(result.scaledHeight).toBe(600)
  })
})
```

### Design Token Contrast Test

**File**: `apps/web/src/client/tokens.test.ts`

This test computes the contrast ratio for each token pair in `.kiro/steering/design-system.md` and fails if any pair falls below its required threshold.

```typescript
import { describe, it, expect } from 'vitest'
import { COLORS } from './tokens'

// Import from core (the WCAG 2.x relative luminance formula)
function computeContrastRatio(fg: string, bg: string): number {
  // ... implementation in core (see classifier/contrast.ts)
}

describe('Design token contrast', () => {
  it('bone on ink ≥ 7:1', () => {
    expect(computeContrastRatio(COLORS.BONE, COLORS.INK)).toBeGreaterThanOrEqual(7)
  })

  it('ecto on ink ≥ 7:1', () => {
    expect(computeContrastRatio(COLORS.ECTO, COLORS.INK)).toBeGreaterThanOrEqual(7)
  })

  it('ember on ink ≥ 4.5:1', () => {
    expect(computeContrastRatio(COLORS.EMBER, COLORS.INK)).toBeGreaterThanOrEqual(4.5)
  })

  it('candle on ink ≥ 4.5:1', () => {
    expect(computeContrastRatio(COLORS.CANDLE, COLORS.INK)).toBeGreaterThanOrEqual(4.5)
  })

  it('mist on ink ≥ 4.5:1', () => {
    expect(computeContrastRatio(COLORS.MIST, COLORS.INK)).toBeGreaterThanOrEqual(4.5)
  })
})
```

### End-to-End Tests (Playwright)

**Location**: `apps/web/e2e/**/*.spec.ts`

**Run Command**: `npx playwright test` (from `apps/web`)

**Coverage**:
- Full audit flow: Landing → Séance → Spirit Sight → Keyboard/Whisper walks → Daylight → Export
- Sample loading (click sample card, verify result renders)
- Error states (blocked URL, network error, timeout)
- Keyboard navigation (Tab through every view, verify focus order)
- Reduced motion (toggle preference, verify animations disabled)

**Example**:

```typescript
import { test, expect } from '@playwright/test'

test('Full audit flow with Cursed Shop', async ({ page }) => {
  // 1. Landing page
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('THE UNSEEN')

  // 2. Click Cursed Shop sample card
  await page.click('button[aria-label*="Cursed Shop"]')

  // 3. Spirit Sight view loads immediately (pre-cached sample)
  await expect(page).toHaveURL(/\/sample\/cursed-shop-index/)
  await expect(page.locator('h1')).toContainText('Spirit Sight')
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()

  // 4. Open Spirit Sight (reveal overlays)
  await page.click('button[aria-pressed="false"]:has-text("Open Spirit Sight")')
  await expect(page.locator('button[aria-pressed="true"]')).toBeVisible()
  await expect(page.locator('button[aria-label*="Nameless Spirit"]').first()).toBeVisible()

  // 5. Navigate to Keyboard walk
  await page.click('a[href$="/keyboard"]')
  await expect(page).toHaveURL(/\/keyboard$/)
  await expect(page.locator('h1')).toContainText('Keyboard Walk')
  await expect(page.locator('.tab-ghost')).toBeVisible()

  // 6. Navigate to Daylight mode
  await page.click('a[href$="/daylight"]')
  await expect(page).toHaveURL(/\/daylight$/)
  await expect(page.locator('h1')).toContainText('Daylight report')
  await expect(page.locator('h2:has-text("Findings by WCAG criterion")')).toBeVisible()

  // 7. Export Markdown
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[aria-label="Export as Markdown"]'),
  ])
  expect(download.suggestedFilename()).toMatch(/unseen-audit-.*\.md$/)
})
```

### Self-Audit Test

See **Accessibility Self-Audit** section above. This is a Playwright test that runs `auditAndClassify` against the production build on every route and asserts zero hauntings.

**Run Command**: `npm run test:self-audit -w apps/web`

### Test Commands Summary

| Command | Scope | What it tests |
|---------|-------|--------------|
| `npm run test -w apps/web` | Vitest unit tests | Pure functions, design tokens, utils |
| `npx playwright test` (from `apps/web`) | Playwright e2e | Full user flows, error states, navigation |
| `npm run test:self-audit -w apps/web` | Playwright self-audit | Zero hauntings on every route (production build) |
| `npm run typecheck -w apps/web` | TypeScript | Strict-mode type checking |



---

## Performance Considerations

### Cursed Shop Audit Budget: ≤20s

**Measured from**: `POST /api/audit` to `status: "done"`

**Breakdown**:
- DNS + SSRF pre-check: <1s
- Page load (`page.goto`): 3-5s (cursed-shop is local)
- AX tree + axe: 2-3s
- Tab walk: 4-6s (depends on focusable count)
- Classification: <1s
- **Total**: ~10-15s (well under 20s budget)

### Samples Load Instantly

Samples are pre-cached JSON files loaded at server startup. No re-audit. Response time: <50ms.

### Spirit Sight Render Budget: ≤2s

**Measured from**: Receiving `ClassifiedAudit` to first paint of screenshot + overlays

**Optimization**:
- Base64 PNG decoded by browser (native, fast)
- SVG overlay: single layer, transform-based positioning (GPU-accelerated)
- Avoid DOM reads during render (positions pre-computed from `BoundingBox`)

### Fog Wave Animation: ≥30fps

**Target**: 60fps, minimum 30fps

**Implementation**:
- Use `requestAnimationFrame` (synced to display refresh)
- Avoid layout thrashing: batch DOM reads before writes
- Use CSS `transform` for ghost movement (GPU-accelerated)
- Monitor with `performance.now()` and log frame times in dev

**Fallback**: If canvas performance is poor, use CSS clip-path animation instead.

### SVG Overlay Positioning: Transform-Based

**Problem**: Re-rendering the entire SVG on scroll/zoom is expensive.

**Solution**: Each overlay uses CSS `transform` to position itself. When the scale factor changes, update the `transform` property (not the SVG `x`/`y` attributes).

```css
.haunting-overlay {
  transform: translate(calc(var(--box-x) * var(--scale-factor)), calc(var(--box-y) * var(--scale-factor)));
}
```

This leverages GPU compositing and avoids SVG layout recalculation.

------

## Product States

The app must handle four distinct product states: a clean site (zero hauntings), an audit error, a blocked URL, and timeouts. Each state has a specific UI and messaging treatment.

### Clean Site (Zero Hauntings)

**When**: `audit.score === 0` and `audit.hauntings.length === 0`

**Spirit Sight View**:
- The screenshot is displayed with no overlay elements
- The sidebar shows: **"No hauntings found by automated checks; a manual review is still needed."**
- Display `audit.automatedCoverageNote` verbatim below the message
- The Haunting Score badge shows **"0/100"** in `--color-ecto` (not red)
- No "Open Spirit Sight" toggle (there are no overlays to show)
- Whisper Walk and Keyboard Walk are still available (they show the full AX tree and Tab sequence)
- Daylight mode shows: **"No automated violations found"** with the coverage note

**Séance View** (during the audit):
- Normal progress stages, no special treatment

**Celebration Treatment**:
- **No confetti or animation**; the app stays calm and professional
- A single polite live region announcement: "Audit complete: No hauntings found by automated checks; a manual review is still needed."
- The message emphasizes that manual testing is still required

### Audit Error (Network, DNS, Page Load Failure)

**When**: Job status is `"error"` and `error.code` is `"NETWORK_ERROR"`, `"TIMEOUT"`, or `"RESOURCE_LIMIT"`

**Séance View**:
- Polling stops immediately when `status === "error"`
- An assertive live region announces the error
- Display:
  ```
  ⚠ Audit failed
  
  {error.message}
  
  [Try another URL]
  ```
- The error message is from `error.message` (user-safe, never includes IPs or stack traces)
- The "Try another URL" button navigates to `/`

**Example Messages**:

| Error Code | Message |
|------------|---------|
| `NETWORK_ERROR` | "Could not load the page. Check the URL and try again." |
| `TIMEOUT` | "The audit took too long (60s limit). The page may be too large or slow to load." |
| `RESOURCE_LIMIT` | "The page is too large to audit (50MB limit)." |

**No Retry Button**: The user must start a new audit. Retrying the same failed job is not supported (jobs are immutable once created).

### Blocked URL (SSRF Prevention)

**When**: Job status is `"error"` and `error.code` is `"SSRF_BLOCKED"`, **or** the POST `/api/audit` request returns `403 { "error": "SSRF_BLOCKED" }`

**Landing View** (POST returned 403):
- The form shows an error message inline, below the input field:
  ```
  ⚠ Cannot audit private or internal URLs
  
  THE UNSEEN can only audit public http:// or https:// URLs.
  Private networks, localhost, and cloud metadata endpoints are blocked for security.
  ```
- The input field gains `aria-invalid="true"` and `aria-describedby="url-error"`
- The error message has `id="url-error"` and `role="alert"`
- The user can edit the URL and resubmit without navigating away

**Séance View** (job status is `"error"` with `SSRF_BLOCKED`):
- Same treatment as Audit Error above, but the message is:
  "Cannot audit private or internal URLs for security reasons."

**Rate Limit (429)**: Similar inline error on the Landing view:
```
⚠ Rate limit exceeded

You can audit 5 URLs per minute, or 30 per hour. Please wait {retryAfter} seconds and try again.
```

**Queue Full (503)**: Inline error:
```
⚠ Server is at capacity

The server is currently processing the maximum number of audits. Please try again in a few moments.
```

### Timeout (60s Limit Exceeded)

**When**: Job status is `"error"` and `error.code` is `"TIMEOUT"`

**Séance View**: Same as Audit Error, with the message:
> "The audit took too long (60s limit). The page may be too large or slow to load."

**No Partial Results**: If the timeout occurs mid-audit (e.g. during the Tab walk), the entire audit is marked as failed. No partial `ClassifiedAudit` is returned.

**User Guidance** (in Daylight mode docs or help text):
- "If your audit times out, try auditing a specific page (e.g. `/checkout`) instead of the homepage."
- "Large pages with hundreds of elements, heavy JavaScript, or slow third-party resources may exceed the 60s limit."
- "The local MCP server (`unseen-mcp`) has no timeout and can audit slow pages."

---

## Error Handling

### Client-Side Error Boundaries

**File**: `apps/web/src/client/components/ErrorBoundary.tsx`

```typescript
class ErrorBoundary extends React.Component<PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('React error boundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>Something went wrong</h2>
          <p>Please refresh the page and try again.</p>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### Network Error Handling

All API calls wrapped in try-catch:

```typescript
async function fetchAuditStatus(id: string): Promise<AuditStatusResponse> {
  try {
    const response = await fetch(`/api/audit/${id}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Failed to fetch audit status:', error)
    throw new NetworkError('Could not reach the server. Please check your connection.')
  }
}
```

Display network errors in an `aria-live="assertive"` region.

---

## Data Models

### Client-Side Types

**File**: `apps/web/src/client/types.ts`

```typescript
// Re-export core types
export type { ClassifiedAudit, Haunting, HauntingType, HauntingSeverity, WCAGCriterion, HauntingFix } from '@the-unseen/core'
export type { RawAudit, BoundingBox, TabStep, TabWalkResult, AXNode } from '@the-unseen/core'

// API response types
export type AuditStatusResponse =
  | { status: 'queued' }
  | { status: 'loading' | 'tree' | 'walking' | 'classifying'; stages: Stages }
  | { status: 'done'; result: ClassifiedAudit; stages: Stages }
  | { status: 'error'; error: string; message: string }

export type Stages = {
  loading?: number
  tree?: number
  walking?: number
  classifying?: number
}

export type Sample = {
  id: string
  name: string
  url: string
  result: ClassifiedAudit
}

export type ErrorResponse = {
  error: 'INVALID_URL' | 'SSRF_BLOCKED' | 'RATE_LIMIT' | 'QUEUE_FULL' | 'NETWORK_ERROR' | 'TIMEOUT' | 'RESOURCE_LIMIT'
  message: string
  retryAfter?: number
}
```

### Ambient Drone (Requirement 33)

Optional atmosphere, added in task 3.3. Parameters live in `apps/web/src/client/utils/ambient-drone.ts`; `drone-engine.ts` builds the Web Audio graph and `useAmbientDrone` (mounted once in `App`) starts and stops it.

- Two detuned sine oscillators at 55 Hz and 55.4 Hz, through a 400 Hz lowpass and a soft feedback delay; peak gain 0.04 (hard cap 0.2) so Web Speech stays intelligible.
- 2 s fade-in, a 60 ms fade-out, and the oscillators stop 80 ms after a stop request (well inside the 100 ms "stops immediately" budget).
- **Started only by the header Sound toggle** (33.2). The Whisper walk's Play allows speech through its own gesture and never starts the drone.
- Never plays under `prefers-reduced-motion` (19.6). The preference is in memory only, not `localStorage` (33.3).
- With no Web Audio support the toggle still works and the app stays silent.

---

## Component Testing Strategy

### Test: Landing View

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { LandingView } from './LandingView'

test('renders landing page with URL input', () => {
  render(<LandingView />)
  expect(screen.getByLabelText(/enter a url/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /begin audit/i })).toBeInTheDocument()
})

test('submits URL and navigates to séance', async () => {
  const mockNavigate = vi.fn()
  vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }))
  
  render(<LandingView />)
  
  const input = screen.getByLabelText(/enter a url/i)
  fireEvent.change(input, { target: { value: 'https://example.com' } })
  
  const button = screen.getByRole('button', { name: /begin audit/i })
  fireEvent.click(button)
  
  await waitFor(() => {
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/seance\/.+/))
  })
})
```

### Test: Whisper Walk Controls

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { WhisperWalk } from './WhisperWalk'

test('play button starts speech synthesis', () => {
  const mockSpeak = vi.fn()
  vi.spyOn(window.speechSynthesis, 'speak').mockImplementation(mockSpeak)
  
  render(<WhisperWalk audit={mockAudit} />)
  
  const playButton = screen.getByLabelText(/play/i)
  fireEvent.click(playButton)
  
  expect(mockSpeak).toHaveBeenCalled()
})

test('respects sound disabled state', () => {
  render(
    <SoundProvider value={{ soundEnabled: false }}>
      <WhisperWalk audit={mockAudit} />
    </SoundProvider>
  )
  
  const playButton = screen.getByLabelText(/play/i)
  fireEvent.click(playButton)
  
  // Assert UI feedback for disabled sound (e.g., alert role live region appears)
  expect(screen.getByRole('alert')).toHaveTextContent('Sound is disabled')
})
```

---

## Component File Structure

```
apps/web/src/client/
├── components/
│   ├── ErrorBoundary.tsx
│   ├── HauntingOverlay.tsx       # Renders one haunting on SVG
│   ├── HauntingSidebar.tsx       # Groups + score + expand/collapse
│   ├── HauntingDetailDialog.tsx  # Modal with focus trap
│   ├── WhisperWalk.tsx            # Web Speech controls + caption
│   ├── KeyboardWalk.tsx           # Ghost animation
│   ├── DaylightReport.tsx         # WCAG table + export
│   ├── FogToggle.tsx              # Spirit Sight on/off with animation
│   ├── SampleCard.tsx             # Pre-audited sample thumbnail
│   ├── SeanceProgress.tsx         # Stage indicator + elapsed time
│   └── KeyboardShortcutsDialog.tsx
├── views/
│   ├── LandingView.tsx
│   ├── SeanceView.tsx
│   └── SpiritSightView.tsx
├── hooks/
│   ├── useScale.ts                # Computes scale state from container size
│   ├── usePoll.ts                 # Generic polling hook
│   └── useWebSpeech.ts            # Web Speech API wrapper
├── contexts/
│   ├── ReducedMotionContext.tsx
│   └── SoundContext.tsx
├── utils/
│   ├── scale.ts                   # computeScale function
│   ├── export.ts                  # Markdown/JSON generation
│   ├── filename.ts                # Sanitized filename generation
│   └── contrast.ts                # Re-export from core for token test
├── styles/
│   ├── tokens.css                 # CSS custom properties
│   ├── global.css                 # Reset + base styles
│   └── [Component].module.css     # Scoped component styles
├── tokens.ts                      # TypeScript constants
├── types.ts                       # Client-side type definitions
├── App.tsx                        # Router + providers
└── main.tsx                       # React entry point
```

---

## Summary

The Spirit Sight UI design delivers a production-ready web application that makes accessibility issues visible, audible, and actionable. It balances demo impact (smooth animations, real-time progress, one-click samples) with accessibility compliance (zero hauntings in self-audit, full keyboard support, reduced-motion respect). The architecture is simple (single Docker image, in-memory job store) and optimized for the demo scope, with clear paths to scale (replace in-memory store with Redis, add WebSocket for live updates).

The design meets all 30 requirements from `requirements.md`, references every steering constraint from `.kiro/steering/`, and prioritizes the judging criteria: polish over features, demo walkthrough clarity, and honest WCAG coverage disclaimers.

**Next Steps**: Proceed to task breakdown. This design is ready for implementation.
