import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assembleReplay, readSampleIds } from './build-replay.mjs'

let root
let samplesDir
let outDir

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'unseen-replay-'))
  samplesDir = path.join(root, 'samples')
  outDir = path.join(root, 'out')
  await mkdir(samplesDir)
  await mkdir(outDir)
  await writeFile(path.join(outDir, 'index.html'), '<!doctype html><title>app</title>')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function writeSample(id) {
  await writeFile(path.join(samplesDir, `${id}.json`), JSON.stringify({ id }))
  await writeFile(path.join(samplesDir, `${id}.png`), 'png')
  await writeFile(path.join(samplesDir, `${id}-thumb.jpg`), 'jpg')
}

describe('assembleReplay', () => {
  it('copies the index, each audit, screenshot and thumbnail, plus 404.html and .nojekyll', async () => {
    await writeFile(path.join(samplesDir, 'index.json'), JSON.stringify([{ id: 'a' }, { id: 'b' }]))
    await writeSample('a')
    await writeSample('b')
    expect(await assembleReplay({ samplesDir, outDir })).toEqual(['a', 'b'])
    expect((await readdir(path.join(outDir, 'replay-data'))).sort()).toEqual(
      ['a-thumb.jpg', 'a.json', 'a.png', 'b-thumb.jpg', 'b.json', 'b.png', 'index.json'],
    )
    expect(await readFile(path.join(outDir, '404.html'), 'utf8')).toBe('<!doctype html><title>app</title>')
    expect(await readdir(outDir)).toContain('.nojekyll')
  })

  it('fails when a listed sample has a missing file', async () => {
    await writeFile(path.join(samplesDir, 'index.json'), JSON.stringify([{ id: 'a' }]))
    await writeFile(path.join(samplesDir, 'a.json'), '{}')
    await expect(assembleReplay({ samplesDir, outDir })).rejects.toThrow()
  })

  it('rejects an empty or malformed index', async () => {
    for (const body of ['[]', '{}', '[{"name":"x"}]']) {
      await writeFile(path.join(samplesDir, 'index.json'), body)
      await expect(readSampleIds(samplesDir)).rejects.toThrow('not a non-empty list')
    }
  })
})
