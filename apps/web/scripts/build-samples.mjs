// Generates the pre-audited Cursed Shop samples into apps/web/samples/.
// Run after `npm run build -w @the-unseen/core`: npm run build-samples -w apps/web
// On Windows set UNSEEN_CHROMIUM_CHANNEL=chromium. The recorded URL is the relative
// `/cursed-shop/<page>` path this app serves, or PUBLIC_BASE_URL + that path when it is set.
// UNSEEN_SAMPLES_OUT writes to another directory instead (for comparing a rebuild).
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { auditAndClassify, buildSpeechTrack, getPool } from '@the-unseen/core'
import { sampleDisplayUrl } from './sample-url.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shopRoot = path.resolve(here, '../../cursed-shop')
const samplesDir = process.env.UNSEEN_SAMPLES_OUT
  ? path.resolve(process.env.UNSEEN_SAMPLES_OUT)
  : path.resolve(here, '../samples')
const publicBaseUrl = process.env.PUBLIC_BASE_URL

const SAMPLES = [
  { id: 'cursed-shop-index', page: 'index.html', name: 'Cursed Shop \u2014 Home' },
  { id: 'cursed-shop-product', page: 'product.html', name: 'Cursed Shop \u2014 Product' },
  { id: 'cursed-shop-checkout', page: 'checkout.html', name: 'Cursed Shop \u2014 Checkout' },
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

// Minimal static server for apps/cursed-shop (the shop is static and has no Vite dependency).
function startShopServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const filePath = path.resolve(shopRoot, relative)
      if (filePath !== shopRoot && !filePath.startsWith(shopRoot + path.sep)) {
        res.writeHead(403).end('Forbidden')
        return
      }
      const body = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('Not found')
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine the shop server port'))
        return
      }
      resolve({
        port: address.port,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}

async function buildSample({ id, page, name }, port) {
  const displayUrl = sampleDisplayUrl(page, publicBaseUrl)
  const classified = await auditAndClassify(`http://localhost:${port}/${page}`, { allowPrivate: true })

  classified.raw.auditedUrl = displayUrl
  const speechTrack = buildSpeechTrack(classified.raw)

  const pngBuffer = Buffer.from(classified.raw.screenshotPng, 'base64')
  await writeFile(path.join(samplesDir, `${id}.png`), pngBuffer)

  const thumbnail = await sharp(pngBuffer)
    .resize({ width: 400 })
    .jpeg({ quality: 85 })
    .toBuffer()
  await writeFile(path.join(samplesDir, `${id}-thumb.jpg`), thumbnail)

  classified.raw.screenshotPng = ''
  await writeFile(
    path.join(samplesDir, `${id}.json`),
    JSON.stringify({ id, name, url: displayUrl, result: classified, speechTrack }, null, 2),
  )

  return {
    id,
    name,
    url: displayUrl,
    score: classified.score,
    countsByType: classified.countsByType,
    thumbnailUrl: `/api/samples/${id}/thumbnail.jpg`,
  }
}

await mkdir(samplesDir, { recursive: true })
const shop = await startShopServer()
try {
  const manifest = []
  for (const sample of SAMPLES) {
    const entry = await buildSample(sample, shop.port)
    console.log(`${sample.id}: score ${entry.score}`)
    manifest.push(entry)
  }
  await writeFile(path.join(samplesDir, 'index.json'), JSON.stringify(manifest, null, 2))
  console.log(`Wrote ${manifest.length} samples to ${samplesDir}`)
} finally {
  await shop.close()
  await getPool().close()
}
