# Design Document: Spirit Sight UI

## Overview

Spirit Sight UI (`apps/web`) is a full-stack web application that makes accessibility issues visible and audible. It combines a React + Vite single-page application with a Fastify API server in a single Docker image deployable to any Node hosting platform. Users paste a URL, see a real-time audit progress séance, then explore hauntings through three lenses: Spirit Sight (visual overlay), Whisper Walk (audio experience), and Keyboard Walk (animated Tab sequence). The app exports to Daylight mode (calm WCAG report) and meets WCAG 2.2 AA itself—it audits itself with zero hauntings.

The design prioritizes demo impact: one obvious user path (≤2 clicks between views), complete polish over proof-of-concept, and performance budgets that keep audits fast. The app serves as its own accessibility proof by passing `auditUrl('http://localhost:PORT')` with zero hauntings.

### Key Design Principles

1. **Single Source of Truth**: `@the-unseen/core` produces `ClassifiedAudit`; the UI renders it faithfully
2. **Deterministic Rendering**: Screenshot and overlays scale together; positions never drift
3. **Accessibility First**: The app itself demonstrates WCAG 2.2 AA compliance
4. **Respect Preferences**: `prefers-reduced-motion` disables all animations; sound is off by default
5. **Performance Budget**: Cursed Shop audit ≤20s, Spirit Sight render ≤2s, animations ≥30fps

---

## Architecture

### Monorepo Structure

```
apps/web/
├── src/
│   ├── client/              # React SPA (Vite)
│   │   ├── components/      # Reusable UI components
│   │   ├── views/           # Route-level views (Landing, Séance, SpiritSight, Daylight)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── contexts/        # React contexts (ReducedMotion, Sound, Audit)
│   │   ├── utils/           # Pure helper functions (scaling, positioning)
│   │   ├── tokens.ts        # Design system constants
│   │   ├── main.tsx         # React entry point
│   │   └── App.tsx          # Router and context providers
│   └── server/              # Fastify API
│       ├── routes/          # API route handlers
│       │   ├── audit.ts     # POST /api/audit, GET /api/audit/:id
│       │   ├── samples.ts   # GET /api/samples
│       │   └── health.ts    # GET /health
│       ├── jobs/            # Audit job queue and storage
│       │   ├── store.ts     # In-memory job store with TTL
│       │   ├── queue.ts     # Concurrency-limited job queue
│       │   └── worker.ts    # Audit execution with progress callbacks
│       ├── middleware/      # Fastify middleware
│       │   ├── rate-limit.ts   # Per-IP token bucket
│       │   └── error-handler.ts
│       ├── samples/         # Pre-audited JSON files (cursed-shop/*.json)
│       └── server.ts        # Fastify app factory
├── public/                  # Static assets (favicon, samples metadata)
├── Dockerfile
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── tsconfig.json
```

### Single Deployable Image

The Docker image bundles both the React SPA and the Fastify API:
- **Base**: `mcr.microsoft.com/playwright` (official image with Chromium pre-installed)
- **Build**: `npm ci` → `npm run build` in `apps/web` → Vite compiles SPA to `dist/client/`
- **Runtime**: Fastify serves the compiled SPA from `dist/client/` at `/` and handles API routes at `/api/*`
- **Environment**: Reads `PORT` (default 3000), `UNSEEN_MAX_CONCURRENCY` (default 2), `NODE_ENV`

### Development vs Production

| Mode | Vite | Fastify | Behavior |
|------|------|---------|----------|
| **Development** | Runs on `:5173` | Runs on `:3000`, proxies `/api/*` to itself | Hot reload, source maps |
| **Production** | Built to `dist/client/` | Serves static files from `dist/client/` at `/`, API at `/api/*` | Single server, no proxy |

---

## Components and Interfaces

### Core Package Interfaces

**From `@the-unseen/core`**:

```typescript
// Primary audit function
export function auditUrl(url: string, options: AuditOptions): Promise<RawAudit>

// Classification function
export function classify(raw: RawAudit): ClassifiedAudit

// SSRF policies
export class RestrictiveSafeFetchPolicy implements SafeFetchPolicy
export class PermissiveSafeFetchPolicy implements SafeFetchPolicy

// Type exports
export type {
  RawAudit,
  ClassifiedAudit,
  Haunting,
  HauntingType,
  HauntingSeverity,
  BoundingBox,
  TabWalkResult,
  AXNode,
}
```

### Server Components

**Fastify Server Factory**:
```typescript
// apps/web/src/server/server.ts
export function createServer(options?: ServerOptions): FastifyInstance

type ServerOptions = {
  logger?: boolean | LoggerOptions
  maxConcurrency?: number
  port?: number
}
```

**Job Store Interface**:
```typescript
// apps/web/src/server/jobs/store.ts
export class JobStore {
  set(job: Job): void
  get(id: string): Job | undefined
  update(id: string, patch: Partial<Job>): void
  delete(id: string): void
  startCleanup(): NodeJS.Timeout
}

export type Job = {
  id: string
  url: string
  status: JobStatus
  stages: Stages
  result?: ClassifiedAudit
  error?: ErrorResponse
  createdAt: number
  updatedAt: number
}
```

**Job Queue Interface**:
```typescript
// apps/web/src/server/jobs/queue.ts
export class JobQueue {
  constructor(maxConcurrency: number, jobStore: JobStore)
  enqueue(jobId: string): void
  getQueueDepth(): number
}
```

**Route Handlers**:
```typescript
// apps/web/src/server/routes/audit.ts
export function auditRoutes(
  server: FastifyInstance,
  options: FastifyPluginOptions
): Promise<void>

// POST /api/audit
type AuditRequest = { url: string }
type AuditResponse = { id: string } | ErrorResponse

// GET /api/audit/:id
type AuditStatusParams = { id: string }
type AuditStatusResponse = /* see Data Models section */
```

```typescript
// apps/web/src/server/routes/samples.ts
export function samplesRoutes(
  server: FastifyInstance,
  options: FastifyPluginOptions
): Promise<void>

// GET /api/samples
type Sample = {
  id: string
  name: string
  url: string
  result: ClassifiedAudit
}
```

### Client Components

**React Component API**:

```typescript
// Landing View
export function LandingView(): JSX.Element

// Séance View
export function SeanceView(): JSX.Element
// Props from route params: { id: string }

// Spirit Sight View
export function SpiritSightView(): JSX.Element
// Props from route params: { id: string }

// Haunting Overlay
export function HauntingOverlay(props: {
  haunting: Haunting
  onClick: () => void
}): JSX.Element

// Haunting Sidebar
export function HauntingSidebar(props: {
  audit: ClassifiedAudit
  onHauntingClick: (haunting: Haunting) => void
}): JSX.Element

// Haunting Detail Dialog
export function HauntingDetailDialog(props: {
  haunting: Haunting | null
  isOpen: boolean
  onClose: () => void
}): JSX.Element

// Whisper Walk
export function WhisperWalk(props: {
  audit: ClassifiedAudit
}): JSX.Element

// Keyboard Walk
export function KeyboardWalk(props: {
  audit: ClassifiedAudit
}): JSX.Element

// Daylight Report
export function DaylightReport(props: {
  audit: ClassifiedAudit
}): JSX.Element
```

**React Contexts**:

```typescript
// Reduced Motion Context
export const ReducedMotionContext: React.Context<ReducedMotionContextValue>
export function ReducedMotionProvider(props: PropsWithChildren): JSX.Element
export function useReducedMotion(): boolean

type ReducedMotionContextValue = {
  reducedMotion: boolean
}

// Sound Context
export const SoundContext: React.Context<SoundContextValue>
export function SoundProvider(props: PropsWithChildren): JSX.Element
export function useSound(): SoundContextValue

type SoundContextValue = {
  soundEnabled: boolean
  toggleSound: () => void
}
```

**Custom Hooks**:

```typescript
// Scale calculation hook
export function useScale(
  screenshotWidth: number,
  screenshotHeight: number,
  containerRef: RefObject<HTMLElement>
): ScaleState

type ScaleState = {
  screenshotWidth: number
  screenshotHeight: number
  containerWidth: number
  containerHeight: number
  scaleFactor: number
  scaledWidth: number
  scaledHeight: number
}

// Polling hook
export function usePoll<T>(
  fetcher: () => Promise<T>,
  interval: number,
  shouldStop: (data: T) => boolean
): { data: T | null; error: Error | null }

// Web Speech hook
export function useWebSpeech(props: {
  utterances: string[]
  pitch?: number
  rate?: number
  voice?: SpeechSynthesisVoice | null
}): {
  currentIndex: number
  playbackState: 'stopped' | 'playing' | 'paused'
  play: () => void
  pause: () => void
  stepNext: () => void
  stepPrev: () => void
}
```

**Utility Functions**:

```typescript
// Scale computation (pure)
export function computeScale(
  screenshotWidth: number,
  screenshotHeight: number,
  containerWidth: number,
  containerHeight: number
): ScaleState

// Haunting grouping (pure)
export function groupHauntings(hauntings: Haunting[]): HauntingGroup[]
export function groupByWCAG(hauntings: Haunting[]): WCAGGroup[]

// Export generation (pure)
export function generateMarkdownReport(audit: ClassifiedAudit): string
export function generateJSONReport(audit: ClassifiedAudit): string
export function generateFilename(audit: ClassifiedAudit, ext: 'md' | 'json'): string

// Fog density calculation (pure)
export function computeFogDensity(contrastRatio: number, isLargeText: boolean): number

// Kiro prompt generation (pure)
export function generateKiroPrompt(haunting: Haunting): string
```

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
              │       → navigates to /spirit-sight/:id when done
              │
              └─ <SpiritSightView>
                  ├─ useScale(containerRef)
                  ├─ <img> (screenshot)
                  ├─ <svg> (overlay)
                  │   └─ <HauntingOverlay> (×N hauntings)
                  ├─ <HauntingSidebar>
                  │   └─ groupHauntings(audit.hauntings)
                  ├─ <HauntingDetailDialog> (focus trap)
                  ├─ <WhisperWalk>
                  │   └─ useWebSpeech(utterances)
                  ├─ <KeyboardWalk>
                  │   └─ Tab ghost animation
                  └─ <DaylightReport>
                      ├─ groupByWCAG(audit.hauntings)
                      └─ Export buttons
```

---

## API Layer Design

### Fastify Server Factory

**File**: `apps/web/src/server/server.ts`

```typescript
export function createServer(options?: ServerOptions): FastifyInstance {
  const server = fastify({
    logger: NODE_ENV === 'production' 
      ? { level: 'info' }
      : { level: 'debug', prettyPrint: true }
  })

  // Security: Helmet with strict CSP
  server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...VITE_HASHES], // Vite-generated inline hashes only
        styleSrc: ["'self'", "'unsafe-inline'"], // Vite requires inline styles
        fontSrc: ["'self'"], // Self-hosted @fontsource only
        imgSrc: ["'self'", "data:"], // base64 screenshots
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      }
    }
  })

  // Rate limiting (production only)
  if (NODE_ENV === 'production') {
    server.register(rateLimitPlugin)
  }

  // Routes
  server.register(auditRoutes, { prefix: '/api' })
  server.register(samplesRoutes, { prefix: '/api' })
  server.register(healthRoutes)

  // Static file serving (production only)
  if (NODE_ENV === 'production') {
    server.register(fastifyStatic, {
      root: path.join(__dirname, '../../dist/client'),
      prefix: '/',
    })
    server.setNotFoundHandler((req, reply) => {
      reply.sendFile('index.html') // SPA fallback
    })
  }

  return server
}
```

### Route: POST /api/audit

**File**: `apps/web/src/server/routes/audit.ts`

**Request**:
```json
{ "url": "https://example.com" }
```

**Flow**:
1. Validate URL format (`http://` or `https://`, well-formed)
2. SSRF pre-check: resolve DNS, check against blocked ranges (`.kiro/steering/security.md`)
3. Check concurrency limit and queue depth
4. Create job with unique ID (`crypto.randomUUID()`)
5. Return `202 Accepted { "id": "uuid" }` immediately
6. Enqueue job for async execution

**Response Status Codes**:
- `202`: Job accepted and queued
- `400`: Invalid URL format
- `403`: SSRF blocked (private IP or metadata endpoint)
- `429`: Rate limit exceeded (per-IP: 5/min, 30/hour)
- `503`: Queue full (20 waiting jobs)

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
  | { status: 'queued' }
  | { status: 'loading' | 'tree' | 'walking' | 'classifying'; stages: Stages }
  | { status: 'done'; result: ClassifiedAudit; stages: Stages }
  | { status: 'error'; error: string; message: string }

type Stages = {
  loading?: number    // epoch ms
  tree?: number
  walking?: number
  classifying?: number
}
```

**Polling**: Client polls every 500ms while `status` is queued/loading/tree/walking/classifying.

### Route: GET /api/samples

**File**: `apps/web/src/server/routes/samples.ts`

**Response**:
```typescript
type Sample = {
  id: string           // e.g. "cursed-shop-index"
  name: string         // "Cursed Shop: Home"
  url: string          // The original URL audited
  result: ClassifiedAudit
}

type SamplesResponse = Sample[]
```

Samples are loaded from `apps/web/src/server/samples/*.json` at server startup and cached in memory. No re-audit at request time.

### Route: GET /health

**File**: `apps/web/src/server/routes/health.ts`

**Response**: `200 { "status": "ok" }`

Used by Docker health checks and load balancers.

---

## Audit Job Queue

### Job Store

**File**: `apps/web/src/server/jobs/store.ts`

In-memory Map with TTL:
```typescript
type Job = {
  id: string
  url: string
  status: JobStatus
  stages: Stages
  result?: ClassifiedAudit
  error?: { code: string; message: string }
  createdAt: number  // epoch ms
  updatedAt: number
}

type JobStatus = 'queued' | 'loading' | 'tree' | 'walking' | 'classifying' | 'done' | 'error'

class JobStore {
  private jobs = new Map<string, Job>()
  private TTL = 60 * 60 * 1000 // 1 hour

  set(job: Job): void
  get(id: string): Job | undefined
  update(id: string, patch: Partial<Job>): void
  
  // Cleanup: runs every 5 minutes, removes jobs older than TTL
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
async function executeJob(jobId: string): Promise<void> {
  const job = jobStore.get(jobId)
  if (!job) return

  try {
    const result = await auditUrl(job.url, {
      allowPrivate: false, // Hosted mode: block private IPs
      safeFetchPolicy: new RestrictiveSafeFetchPolicy(),
      timeoutMs: 60000,
      
      // Progress callback updates job status and stages
      onProgress: (stage: 'loading' | 'tree' | 'walking' | 'classifying') => {
        jobStore.update(jobId, {
          status: stage,
          stages: { ...job.stages, [stage]: Date.now() }
        })
      }
    })

    const classified = classify(result)

    jobStore.update(jobId, {
      status: 'done',
      result: classified
    })
  } catch (error) {
    const errorResponse = mapErrorToResponse(error)
    jobStore.update(jobId, {
      status: 'error',
      error: errorResponse
    })
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
          <Route path="/spirit-sight/:id" element={<SpiritSightView />} />
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

### Routing

| Path | View | Purpose |
|------|------|---------|
| `/` | `LandingView` | URL input + sample cards |
| `/seance/:id` | `SeanceView` | Real-time audit progress (polls `/api/audit/:id`) |
| `/spirit-sight/:id` | `SpiritSightView` | Screenshot overlay + sidebar + Whisper/Keyboard walks + Daylight toggle |

**Navigation Flow**:
1. User enters URL or clicks sample → POST `/api/audit` → navigate to `/seance/:id`
2. Séance polls until `status: 'done'` → auto-navigate to `/spirit-sight/:id`
3. Spirit Sight toggles to Daylight mode (same route, state change)

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

**Click behavior**: Navigate directly to `/spirit-sight/:id` with the cached `ClassifiedAudit` (no network request).

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

### Screenshot + Overlay Architecture

**Problem**: Overlay positions must match screenshot elements exactly, never drift on resize/zoom.

**Solution**: Both screenshot and SVG overlay scale by the **same factor** from the same render.

```typescript
type ScaleState = {
  screenshotWidth: number      // Raw screenshot width from ClassifiedAudit
  screenshotHeight: number     // Raw screenshot height
  containerWidth: number       // Available width in viewport
  containerHeight: number      // Available height in viewport
  scaleFactor: number          // Min of (containerW/screenshotW, containerH/screenshotH)
  scaledWidth: number          // screenshotWidth * scaleFactor
  scaledHeight: number         // screenshotHeight * scaleFactor
}

function computeScale(
  screenshotWidth: number,
  screenshotHeight: number,
  containerWidth: number,
  containerHeight: number
): ScaleState {
  const scaleFactor = Math.min(
    containerWidth / screenshotWidth,
    containerHeight / screenshotHeight
  )
  return {
    screenshotWidth,
    screenshotHeight,
    containerWidth,
    containerHeight,
    scaleFactor,
    scaledWidth: screenshotWidth * scaleFactor,
    scaledHeight: screenshotHeight * scaleFactor,
  }
}
```

**Rendering**:
```tsx
<div className="spirit-sight-container" ref={containerRef}>
  <img
    src={`data:image/png;base64,${audit.raw.screenshotPng}`}
    alt="Audited page screenshot"
    width={scale.scaledWidth}
    height={scale.scaledHeight}
  />
  <svg
    className="haunting-overlay"
    width={scale.scaledWidth}
    height={scale.scaledHeight}
    viewBox={`0 0 ${scale.screenshotWidth} ${scale.screenshotHeight}`}
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      pointerEvents: 'none', // Overlays are focusable via Tab, not click
    }}
  >
    {audit.hauntings.map(h => (
      <HauntingOverlay
        key={h.id}
        haunting={h}
        onClick={() => openDialog(h)}
      />
    ))}
  </svg>
</div>
```

**Resize Handler**:
```typescript
useEffect(() => {
  const observer = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect
    setScale(computeScale(
      audit.raw.viewportWidth,
      audit.raw.viewportHeight,
      width,
      height
    ))
  })
  observer.observe(containerRef.current!)
  return () => observer.disconnect()
}, [audit])
```

**Key invariant**: Screenshot `<img>` and SVG overlay always have the same `width` and `height` props. SVG `viewBox` matches the raw screenshot dimensions, so coordinates in the SVG (from `BoundingBox`) map 1:1 to screenshot pixels.

---

## Haunting Overlays (All 10 Types)

**File**: `apps/web/src/client/components/HauntingOverlay.tsx`

Each haunting type renders a distinct visual treatment inside the SVG overlay. All positions are in raw screenshot coordinates (SVG `viewBox` handles scaling).

### 1. Nameless Spirit

**Visual**: Faceless translucent ghost with faded label text

```tsx
<g className="nameless-spirit">
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    fill="url(#ghost-gradient)"
    opacity={0.7}
  />
  <text
    x={box.x + box.width / 2}
    y={box.y + box.height / 2}
    textAnchor="middle"
    fill="var(--color-mist)"
    opacity={0.3}
    fontSize={14}
  >
    {/* Faded role name */}
    button
  </text>
  {/* Defs for ghost-gradient elsewhere */}
</g>
```

### 2. Hollow Portrait

**Visual**: Hollow-eyed and desaturated image

```tsx
<g className="hollow-portrait">
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
  {/* Eye sockets: two circles */}
  <circle cx={box.x + box.width * 0.33} cy={box.y + box.height * 0.4} r={8} fill="var(--color-ink)" />
  <circle cx={box.x + box.width * 0.67} cy={box.y + box.height * 0.4} r={8} fill="var(--color-ink)" />
</g>
```

### 3. The Fog

**Visual**: Fog overlay with density proportional to contrast deficit

```tsx
<rect
  x={box.x}
  y={box.y}
  width={box.width}
  height={box.height}
  fill="url(#fog-pattern)"
  opacity={fogDensity} // 0.3 to 0.8 based on contrast ratio gap
  style={{ mixBlendMode: 'multiply' }}
/>
```

**Fog Density Calculation**:
```typescript
function computeFogDensity(contrastRatio: number, isLargeText: boolean): number {
  const target = isLargeText ? 3.0 : 4.5
  const deficit = target - contrastRatio
  // Map deficit [0, target] to opacity [0, 0.8]
  return Math.max(0, Math.min(0.8, deficit / target))
}
```

### 4. Lost Soul

**Visual**: Soul trapped behind glass (frosted overlay + "X" mark)

```tsx
<g className="lost-soul">
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
```

### 5. Cursed Loop

**Visual**: Glowing red circle around the trapped region

```tsx
<ellipse
  cx={box.x + box.width / 2}
  cy={box.y + box.height / 2}
  rx={box.width / 2 + 10}
  ry={box.height / 2 + 10}
  fill="none"
  stroke="var(--color-ember)"
  strokeWidth={3}
  opacity={0.8}
  className={haunting.cycle?.escapable ? 'pulsing' : 'glowing'}
/>

// CSS:
.glowing {
  animation: glow 2s ease-in-out infinite;
}
.pulsing {
  animation: pulse 1s ease-in-out 2; // 2 cycles for escapable
}
```

### 6. Invisible Wanderer

**Visual**: Ghost footsteps with no light

```tsx
<g className="invisible-wanderer">
  {/* Footprint icons */}
  <path d="M..." transform={`translate(${box.x}, ${box.y})`} fill="var(--color-mist)" opacity={0.4} />
  <path d="M..." transform={`translate(${box.x + 20}, ${box.y + 15})`} fill="var(--color-mist)" opacity={0.4} />
</g>
```

### 7. Whispering Field

**Visual**: Form field with ghostly mouth and no words

```tsx
<g className="whispering-field">
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
  {/* Ghostly mouth: wavy path */}
  <path
    d={`M ${box.x + 10} ${box.y + box.height - 10} Q ${box.x + box.width/2} ${box.y + box.height - 20} ${box.x + box.width - 10} ${box.y + box.height - 10}`}
    fill="none"
    stroke="var(--color-mist)"
    strokeWidth={1.5}
  />
</g>
```

### 8. Silent Tongue

**Visual**: Page-level banner (not tied to a specific box)

```tsx
<text
  x={viewportWidth / 2}
  y={30}
  textAnchor="middle"
  fill="var(--color-ember)"
  fontSize={18}
  fontWeight={700}
>
  ⚠️ The spirits speak a garbled tongue
</text>
```

### 9. Shattered Order

**Visual**: Broken gravestone headings (rendered in sidebar outline panel, not overlay)

No overlay rendering; handled in the sidebar.

### 10. The Veiled

**Visual**: Thick impenetrable fog (distinct from contrast fog)

```tsx
<rect
  x={box.x}
  y={box.y}
  width={box.width}
  height={box.height}
  fill="url(#thick-fog-pattern)"
  opacity={0.9}
  style={{ mixBlendMode: 'darken' }}
/>
```

---

## Keyboard-Accessible Overlays

Each overlay is wrapped in a focusable `<button>` element (foreignObject in SVG):

```tsx
<foreignObject x={box.x} y={box.y} width={box.width} height={box.height}>
  <button
    className="haunting-trigger"
    aria-label={`${haunting.type}: ${haunting.explanation}, ${haunting.severity}`}
    onClick={() => openDialog(haunting)}
    style={{
      width: '100%',
      height: '100%',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
    }}
  >
    {/* Visual treatment rendered here */}
  </button>
</foreignObject>
```

**Focus Style**:
```css
.haunting-trigger:focus-visible {
  outline: 2px solid var(--color-ecto);
  outline-offset: 2px;
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

- **On open**: Focus moves to the close button or the first focusable element inside the dialog
- **While open**: Focus is trapped inside the dialog (cannot Tab outside)
- **On close**: Focus returns to the trigger element (the haunting overlay or sidebar item)
- **Escape key**: Closes the dialog

---

## Whisper Walk

**File**: `apps/web/src/client/components/WhisperWalk.tsx`

### Web Speech API Integration

```typescript
function WhisperWalk({ audit }: { audit: ClassifiedAudit }) {
  const { soundEnabled } = useSound()
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped')
  const [speed, setSpeed] = useState(1.0)
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    // Load voices (fires async on some browsers)
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  }, [])

  useEffect(() => {
    // Build utterances from audit.hauntings
    const utts: Utterance[] = audit.hauntings
      .filter(h => h.speech) // Skip hauntings with no speech
      .map((h, i) => ({
        id: h.id,
        text: h.speech!,
        nodeIds: h.nodeIds,
        index: i,
      }))
    setUtterances(utts)
  }, [audit])

  const speak = (index: number) => {
    if (!soundEnabled) {
      alert('Sound is disabled. Enable sound in the header to use Whisper Walk.')
      return
    }

    const utt = utterances[index]
    const speech = new SpeechSynthesisUtterance(utt.text)
    
    // Whisper effect: low pitch, slow rate
    speech.pitch = 0.8
    speech.rate = 0.85 * speed
    
    if (selectedVoice) {
      speech.voice = selectedVoice
    }

    speech.onstart = () => {
      setPlaybackState('playing')
      highlightElement(utt.nodeIds[0]) // Highlight on screenshot
    }

    speech.onend = () => {
      if (index < utterances.length - 1) {
        setCurrentIndex(index + 1)
        speak(index + 1) // Auto-advance
      } else {
        setPlaybackState('stopped')
        setCurrentIndex(0)
      }
    }

    window.speechSynthesis.speak(speech)
  }

  const play = () => speak(currentIndex)
  const pause = () => {
    window.speechSynthesis.cancel()
    setPlaybackState('paused')
  }
  const stepNext = () => {
    window.speechSynthesis.cancel()
    const next = Math.min(currentIndex + 1, utterances.length - 1)
    setCurrentIndex(next)
    speak(next)
  }
  const stepPrev = () => {
    window.speechSynthesis.cancel()
    const prev = Math.max(currentIndex - 1, 0)
    setCurrentIndex(prev)
    speak(prev)
  }

  return (
    <div className="whisper-walk">
      <div className="live-caption" aria-live="polite">
        {utterances[currentIndex]?.text}
      </div>
      
      <div className="controls">
        <button onClick={play} disabled={playbackState === 'playing'} aria-label="Play">
          ▶️
        </button>
        <button onClick={pause} disabled={playbackState !== 'playing'} aria-label="Pause">
          ⏸️
        </button>
        <button onClick={stepPrev} aria-label="Previous">
          ⏮️
        </button>
        <button onClick={stepNext} aria-label="Next">
          ⏭️
        </button>
      </div>

      <div className="speed-control">
        <label htmlFor="speed-select">Speed</label>
        <select id="speed-select" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
          <option value={0.5}>0.5x</option>
          <option value={0.75}>0.75x</option>
          <option value={1.0}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
        </select>
      </div>

      <div className="voice-control">
        <label htmlFor="voice-select">Voice</label>
        <select id="voice-select" onChange={e => setSelectedVoice(voices[Number(e.target.value)])}>
          {voices.map((v, i) => (
            <option key={i} value={i}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
```

### Caption Synchronization

The live caption displays the current utterance text in an `aria-live="polite"` region. It updates immediately when `currentIndex` changes (< 100ms offset from speech start).

---

## Keyboard Walk

**File**: `apps/web/src/client/components/KeyboardWalk.tsx`

### Ghost Animation

```typescript
function KeyboardWalk({ audit }: { audit: ClassifiedAudit }) {
  const reducedMotion = useReducedMotion()
  const [currentStep, setCurrentStep] = useState(0)
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing'>('stopped')
  const [speed, setSpeed] = useState(1.0) // 1x = 300ms per step

  const steps = audit.raw.tabWalkResult.steps
  const lostSouls = new Set(
    audit.hauntings
      .filter(h => h.type === 'LostSoul')
      .flatMap(h => h.nodeIds)
  )
  const cursedLoops = audit.hauntings.filter(h => h.type === 'CursedLoop')

  const play = () => {
    setPlaybackState('playing')
    animateStep(0)
  }

  const animateStep = (index: number) => {
    if (index >= steps.length) {
      setPlaybackState('stopped')
      return
    }

    setCurrentStep(index)

    const step = steps[index]
    const box = audit.raw.boundingBoxes.find(b => b.backendDOMNodeId === Number(step.backendDOMNodeId))

    if (box) {
      positionGhost(box)
    }

    // Check if this step is inside a Cursed Loop
    const inLoop = cursedLoops.some(loop => loop.nodeIds.includes(Number(step.backendDOMNodeId)))
    if (inLoop) {
      // Ghost gets stuck: circle animation
      showCursedCircle(box!)
    }

    // Check if we just passed a Lost Soul
    if (lostSouls.has(Number(step.backendDOMNodeId))) {
      showLostSoulGlass(box!)
    }

    setTimeout(() => animateStep(index + 1), (reducedMotion ? 0 : 300) / speed)
  }

  return (
    <div className="keyboard-walk">
      <svg className="ghost-layer" {...}>
        <GhostIcon x={ghostX} y={ghostY} />
      </svg>
      
      <div className="controls">
        <button onClick={play} disabled={playbackState === 'playing'}>
          ▶️ Play
        </button>
        <label>
          Speed:
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5x</option>
            <option value={1.0}>1x</option>
            <option value={2.0}>2x</option>
          </select>
        </label>
      </div>
    </div>
  )
}
```

### Ghost Positioning

```typescript
function GhostIcon({ x, y }: { x: number; y: number }) {
  const reducedMotion = useReducedMotion()
  
  return (
    <g
      className="ghost"
      transform={`translate(${x}, ${y})`}
      style={{
        transition: reducedMotion ? 'none' : 'transform 300ms ease-in-out',
      }}
    >
      <path d="M..." fill="var(--color-ecto)" opacity={0.8} />
    </g>
  )
}
```

### Cursed Loop Handling

When the ghost enters a Cursed Loop:
- **Inescapable**: Ghost circles indefinitely (manual stop required)
- **Escapable**: Ghost circles twice, then breaks free (from `cycle.escapable` flag)

---

## Daylight Mode

**File**: `apps/web/src/client/components/DaylightReport.tsx`

### Toggle Behavior

```typescript
function SpiritSightView() {
  const reducedMotion = useReducedMotion()
  const [mode, setMode] = useState<'spirit-sight' | 'daylight'>(() => {
    return reducedMotion ? 'daylight' : 'spirit-sight'
  })

  return mode === 'spirit-sight' 
    ? <SpiritSightCanvas audit={audit} />
    : <DaylightReport audit={audit} />
}
```

### WCAG Table Structure

```tsx
<table className="daylight-table">
  <thead>
    <tr>
      <th>WCAG Criterion</th>
      <th>Level</th>
      <th>Affected Elements</th>
      <th>Severity</th>
    </tr>
  </thead>
  <tbody>
    {groupedByWCAG.map(group => (
      <tr key={group.criterionId}>
        <td>
          <a href={group.url} target="_blank" rel="noopener">
            {group.criterionId} {group.title}
          </a>
        </td>
        <td>{group.level}</td>
        <td>{group.count}</td>
        <td style={{ color: SEVERITY_COLORS[group.severity] }}>
          {group.severity}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

**Grouping Logic**:
```typescript
function groupByWCAG(hauntings: Haunting[]): WCAGGroup[] {
  const groups = new Map<string, Haunting[]>()
  
  for (const h of hauntings) {
    const primary = h.wcag[0] // First WCAG criterion is primary
    if (!groups.has(primary.id)) groups.set(primary.id, [])
    groups.get(primary.id)!.push(h)
  }

  return Array.from(groups.entries())
    .map(([id, hauntings]) => ({
      criterionId: id,
      title: hauntings[0].wcag[0].title,
      level: hauntings[0].wcag[0].level,
      url: hauntings[0].wcag[0].url,
      count: hauntings.length,
      severity: mostSevere(hauntings.map(h => h.severity)),
    }))
    .sort((a, b) => a.criterionId.localeCompare(b.criterionId))
}
```

### Manual Check Section

```tsx
<section className="manual-check">
  <h3>Needs Manual Check</h3>
  <p>The following elements could not be automatically verified:</p>
  <ul>
    {audit.needsManualCheck.map((node, i) => (
      <li key={i}>
        {node.reason === 'contrast-uncertain' && 'Contrast uncertain (image or gradient background)'}
        {node.reason === 'focus-style-unavailable' && 'Focus indicator could not be measured'}
        {node.reason === 'off-screen-content' && 'Content positioned off-screen'}
        <pre><code>{node.htmlSnippet}</code></pre>
      </li>
    ))}
  </ul>
</section>
```

### Coverage Disclaimer

```tsx
<aside className="coverage-note" role="note">
  <strong>Important:</strong> {audit.automatedCoverageNote}
  <p>This tool never claims a site is "compliant".</p>
</aside>
```

Styled prominently at the top of the report with `--color-ember` border.

### Export Buttons

```typescript
function exportMarkdown(audit: ClassifiedAudit): void {
  const md = generateMarkdownReport(audit)
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = generateFilename(audit, 'md')
  a.click()
  URL.revokeObjectURL(url)
}

function exportJSON(audit: ClassifiedAudit): void {
  const json = JSON.stringify(audit, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = generateFilename(audit, 'json')
  a.click()
  URL.revokeObjectURL(url)
}

function generateFilename(audit: ClassifiedAudit, ext: string): string {
  const url = new URL(audit.raw.auditedUrl)
  const domain = url.hostname.replace(/\./g, '-')
  const timestamp = new Date(audit.raw.auditedAt).toISOString().slice(0, 19).replace(/:/g, '-')
  return `unseen-audit-${domain}-${timestamp}.${ext}`
}
```

**Markdown Report Structure**:
```markdown
# THE UNSEEN Audit Report

**URL**: https://example.com
**Audited**: 2026-12-04T15:30:00Z
**Haunting Score**: 42/100

## Summary

- 5 Wraith (critical)
- 12 Restless (warnings)
- 8 Banished (minor)

## Findings by WCAG Criterion

### 4.1.2 Name, Role, Value (Level A)

**Severity**: Wraith
**Affected Elements**: 5

...
```

---

## Spirit Sight Fog Toggle Animation

**File**: `apps/web/src/client/components/FogToggle.tsx`

### Animation Implementation

```typescript
function FogToggle() {
  const reducedMotion = useReducedMotion()
  const [spiritSightEnabled, setSpiritSightEnabled] = useState(false)

  const toggle = () => {
    if (reducedMotion) {
      // Instant toggle
      setSpiritSightEnabled(prev => !prev)
    } else {
      // 800ms wave from top to bottom
      setSpiritSightEnabled(prev => !prev)
      triggerFogWave()
    }
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={spiritSightEnabled}
      aria-label="Toggle Spirit Sight"
    >
      {spiritSightEnabled ? '👁️ Spirit Sight' : '🌫️ Normal View'}
    </button>
  )
}

function triggerFogWave() {
  const canvas = document.getElementById('spirit-sight-canvas') as HTMLCanvasElement
  if (!canvas) return

  const ctx = canvas.getContext('2d')!
  const height = canvas.height
  const duration = 800
  const startTime = performance.now()

  function animate(time: number) {
    const elapsed = time - startTime
    const progress = Math.min(elapsed / duration, 1)
    const waveY = height * progress

    // Clear and redraw with fog mask
    ctx.clearRect(0, 0, canvas.width, height)
    ctx.fillStyle = 'rgba(142, 138, 168, 0.3)' // --color-mist with alpha
    ctx.fillRect(0, 0, canvas.width, waveY)

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }

  requestAnimationFrame(animate)
}
```

**CSS Alternative** (if canvas is not used):
```css
@keyframes fog-wave {
  from {
    clip-path: inset(100% 0 0 0);
  }
  to {
    clip-path: inset(0 0 0 0);
  }
}

.fog-overlay {
  animation: fog-wave 800ms ease-in-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  .fog-overlay {
    animation: none;
  }
}
```

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

### Playwright Test

**File**: `apps/web/playwright.config.ts`

```typescript
export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
})
```

**Test File**: `apps/web/tests/self-audit.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { auditUrl } from '@the-unseen/core'
import { classify } from '@the-unseen/core/classifier'

test('The app audits itself with zero hauntings', async ({ page }) => {
  // Navigate to running dev server
  await page.goto('/')

  // Run the full audit against localhost
  const rawAudit = await auditUrl('http://localhost:3000', {
    allowPrivate: true, // localhost is private
  })

  const classified = classify(rawAudit)

  // Assert zero hauntings
  expect(classified.hauntings).toHaveLength(0)
  expect(classified.score).toBe(0)

  // If this fails, the test output will show which hauntings were found
  if (classified.hauntings.length > 0) {
    console.error('Hauntings found in self-audit:')
    for (const h of classified.hauntings) {
      console.error(`- ${h.type}: ${h.explanation}`)
      console.error(`  HTML: ${h.htmlSnippet}`)
    }
  }
})
```

### Accessibility Checklist

The app must pass all WCAG 2.2 AA criteria. Manual verification required for:

- **Keyboard navigation**: All interactive elements reachable via Tab, no traps
- **Focus indicators**: Visible `--color-ecto` outline ≥2px with ≥3:1 contrast
- **Labels**: All inputs, buttons, and icons have accessible names
- **Heading hierarchy**: One `<h1>` per page, no skipped levels
- **Alt text**: All images (use `alt=""` for decorative)
- **Semantic HTML**: `<button>`, `<a href>`, `<nav>`, `<main>`, landmarks
- **Live regions**: Séance progress and error messages announced
- **Modal focus trap**: Haunting detail dialog traps focus, returns to trigger on close
- **Reduced motion**: All animations disabled when preference is set
- **Sound controls**: Off by default, explicit enable required
- **Contrast**: All text meets 4.5:1 (or 3:1 for large text)

---

## Docker Deployment

### Dockerfile

**File**: `apps/web/Dockerfile`

```dockerfile
# Base: Official Playwright image (Chromium pre-installed)
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Set working directory
WORKDIR /app

# Install Node.js 22 (if not already in Playwright image)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Copy workspace root package files
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/web/package.json ./apps/web/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/core ./packages/core
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

# Build @the-unseen/core
RUN cd packages/core && npm run build

# Build React SPA
RUN cd apps/web && npm run build

# Expose port (read from env at runtime)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV UNSEEN_MAX_CONCURRENCY=2

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start Fastify server
CMD ["node", "apps/web/dist/server/server.js"]
```

### Build Command

```bash
docker build -t the-unseen:latest .
```

**Expected image size**: < 2.5GB uncompressed (Playwright base is ~2GB; app adds ~300MB)

### Run Command

```bash
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e UNSEEN_MAX_CONCURRENCY=2 \
  -e NODE_ENV=production \
  the-unseen:latest
```

---

## Correctness Properties

**Property-based testing is not the primary testing approach for this feature.**

This is a full-stack web application combining UI rendering, infrastructure (Fastify server, Docker deployment), and side-effect-heavy operations (browser automation, Web Speech API, network requests). According to the workflow guidance, PBT is **not appropriate** for:

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

### PBT Applicability Assessment

Property-based testing is **not the primary testing approach** for this feature because:

1. **UI Rendering**: Most components render HTML/SVG based on input data. These are UI concerns best tested with snapshot tests and visual regression tests, not universal properties.

2. **Infrastructure**: The Fastify server, job queue, and Docker deployment are infrastructure concerns. These require integration tests with concrete examples, not property-based tests.

3. **External Dependencies**: Web Speech API, Playwright browser contexts, and network requests are side-effect-heavy operations that cannot be meaningfully property-tested.

4. **User Interactions**: Click handlers, focus management, and keyboard navigation are event-driven behaviors best verified with example-based integration tests.

**Where PBT IS appropriate** (limited scope):
- **Pure helper functions**: `computeScale`, `groupHauntings`, `computeFogDensity`, filename sanitization
- **Design token contrast**: Generate random color pairs and verify contrast ratio properties (monotonic, symmetric, bounded)

**Primary testing approach**:
- **Unit tests** for pure functions
- **Component tests** with React Testing Library for UI behavior
- **Integration tests** with Playwright for end-to-end flows
- **Self-audit test** to verify zero hauntings

This aligns with the workflow guidance: "PBT IS NOT appropriate for UI rendering and layout, infrastructure, simple CRUD operations, and side-effect-only operations."

### Unit Tests (Vitest)

**File**: `apps/web/vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
})
```

**Coverage**:
- Pure helper functions (scaling, positioning, filename generation)
- Design token contrast ratios
- Haunting grouping and sorting logic
- Markdown/JSON export generation

**Example Test**: `apps/web/src/client/utils/scale.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { computeScale } from './scale'

describe('computeScale', () => {
  it('scales proportionally to fit container', () => {
    const result = computeScale(1280, 900, 640, 450)
    expect(result.scaleFactor).toBe(0.5)
    expect(result.scaledWidth).toBe(640)
    expect(result.scaledHeight).toBe(450)
  })

  it('maintains aspect ratio when container is wider', () => {
    const result = computeScale(1280, 900, 1920, 450)
    expect(result.scaleFactor).toBe(0.5) // Limited by height
    expect(result.scaledWidth).toBe(640)
    expect(result.scaledHeight).toBe(450)
  })
})
```

### Property Tests (fast-check)

**Example**: Overlay positioning is deterministic and bounded

```typescript
import fc from 'fast-check'

describe('overlay positioning', () => {
  it('always produces valid SVG coordinates', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: 0, max: 10000 }),
          y: fc.integer({ min: 0, max: 10000 }),
          width: fc.integer({ min: 1, max: 1000 }),
          height: fc.integer({ min: 1, max: 1000 }),
        }),
        fc.float({ min: 0.1, max: 2.0 }), // scale factor
        (box, scale) => {
          const scaled = scaleBox(box, scale)
          expect(scaled.x).toBeGreaterThanOrEqual(0)
          expect(scaled.y).toBeGreaterThanOrEqual(0)
          expect(scaled.width).toBeGreaterThan(0)
          expect(scaled.height).toBeGreaterThan(0)
        }
      )
    )
  })
})
```

### Design Token Contrast Test

**File**: `apps/web/tests/contrast.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { COLORS } from '../src/client/tokens'
import { computeContrastRatio } from '@the-unseen/core/classifier/contrast'

describe('Design token contrast', () => {
  it('bone on ink meets 7:1 (AAA)', () => {
    const ratio = computeContrastRatio(COLORS.BONE, COLORS.INK)
    expect(ratio).toBeGreaterThanOrEqual(7)
  })

  it('ecto on ink meets 7:1', () => {
    const ratio = computeContrastRatio(COLORS.ECTO, COLORS.INK)
    expect(ratio).toBeGreaterThanOrEqual(7)
  })

  it('ember on ink meets 4.5:1 (AA)', () => {
    const ratio = computeContrastRatio(COLORS.EMBER, COLORS.INK)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('candle on ink meets 4.5:1', () => {
    const ratio = computeContrastRatio(COLORS.CANDLE, COLORS.INK)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('mist on ink meets 4.5:1', () => {
    const ratio = computeContrastRatio(COLORS.MIST, COLORS.INK)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})
```

### End-to-End Tests (Playwright)

**File**: `apps/web/tests/e2e/full-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('Full audit flow: paste URL → séance → Spirit Sight → export', async ({ page }) => {
  // 1. Landing page
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('THE UNSEEN')

  // 2. Enter URL
  await page.fill('input[type="url"]', 'http://localhost:8080/cursed-shop/index.html')
  await page.click('button[type="submit"]')

  // 3. Séance view (wait for completion)
  await expect(page).toHaveURL(/\/seance\/[a-f0-9-]+/)
  await expect(page.locator('text=Classifying hauntings')).toBeVisible({ timeout: 30000 })

  // 4. Auto-navigate to Spirit Sight
  await expect(page).toHaveURL(/\/spirit-sight\/[a-f0-9-]+/, { timeout: 25000 })

  // 5. Spirit Sight view renders
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
  await expect(page.locator('text=Haunting Score')).toBeVisible()

  // 6. Click a haunting overlay
  await page.click('.haunting-trigger:first-of-type')
  await expect(page.locator('role=dialog')).toBeVisible()

  // 7. Close dialog
  await page.keyboard.press('Escape')
  await expect(page.locator('role=dialog')).not.toBeVisible()

  // 8. Toggle to Daylight mode
  await page.click('button[aria-label*="Daylight"]')
  await expect(page.locator('table.daylight-table')).toBeVisible()

  // 9. Export Markdown
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export as Markdown")'),
  ])
  expect(download.suggestedFilename()).toMatch(/unseen-audit-.*\.md/)

  // 10. Export JSON
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export as JSON")'),
  ])
  expect(download2.suggestedFilename()).toMatch(/unseen-audit-.*\.json/)
})
```

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
export type { ClassifiedAudit, Haunting, HauntingType, HauntingSeverity } from '@the-unseen/core/classifier/types'
export type { RawAudit, BoundingBox } from '@the-unseen/core/types'

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
  const mockAlert = vi.spyOn(window, 'alert').mockImplementation(() => {})
  
  render(
    <SoundProvider value={{ soundEnabled: false }}>
      <WhisperWalk audit={mockAudit} />
    </SoundProvider>
  )
  
  const playButton = screen.getByLabelText(/play/i)
  fireEvent.click(playButton)
  
  expect(mockAlert).toHaveBeenCalledWith(expect.stringContaining('Sound is disabled'))
})
```

---

## Keyboard Shortcuts

**File**: `apps/web/src/client/components/KeyboardShortcutsDialog.tsx`

| Key | Action |
|-----|--------|
| `Tab` | Navigate forward through interactive elements |
| `Shift+Tab` | Navigate backward |
| `Enter` / `Space` | Activate focused element (button, link) |
| `Escape` | Close dialog or modal |
| `?` | Open keyboard shortcuts help dialog |

**Implementation**:
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      openShortcutsDialog()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

**WCAG 2.1.4 Compliance**: No single-character shortcuts hijack typing. Only `?` (a punctuation key) is used, and it does not interfere with form inputs.

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
