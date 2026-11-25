// Finishes the replay build after `vite build --config vite.replay.config.ts`:
//   - copies the pre-recorded samples into <out>/replay-data/ (index, audits with their speech tracks,
//     screenshots, thumbnails), so the static site needs no API;
//   - writes 404.html (a copy of index.html: GitHub Pages serves it for unknown paths, so deep links
//     such as /unseen/sample/cursed-shop-index/daylight load the app);
//   - writes .nojekyll so Pages serves every file as is.
// Never re-audits anything: it only copies what apps/web/samples already holds.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The ids listed in samples/index.json. Throws when the index is malformed. */
export async function readSampleIds(samplesDir) {
  const index = JSON.parse(await readFile(path.join(samplesDir, 'index.json'), 'utf8'))
  if (!Array.isArray(index) || index.length === 0 || !index.every((entry) => isRecord(entry) && typeof entry.id === 'string')) {
    throw new Error('samples/index.json is not a non-empty list of samples')
  }
  return index.map((entry) => entry.id)
}

export async function assembleReplay({ samplesDir, outDir }) {
  const ids = await readSampleIds(samplesDir)
  const dataDir = path.join(outDir, 'replay-data')
  await mkdir(dataDir, { recursive: true })
  await copyFile(path.join(samplesDir, 'index.json'), path.join(dataDir, 'index.json'))
  for (const id of ids) {
    for (const file of [`${id}.json`, `${id}.png`, `${id}-thumb.jpg`]) {
      await copyFile(path.join(samplesDir, file), path.join(dataDir, file))
    }
  }
  await copyFile(path.join(outDir, 'index.html'), path.join(outDir, '404.html'))
  await writeFile(path.join(outDir, '.nojekyll'), '')
  return ids
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = await assembleReplay({
    samplesDir: path.resolve(here, '../samples'),
    outDir: path.resolve(here, '../dist-replay'),
  })
  console.log(`Replay build ready: ${ids.length} samples in dist-replay/replay-data`)
}
