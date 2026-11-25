#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CLI_COMMANDS, runCli } from './cli.js'
import { createUnseenServer } from './server-core.js'

const STDIN_IDLE_MS = 2_000

/** Reads hook JSON from stdin. A terminal or a pipe that never closes yields what arrived so far. */
function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve('')
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    const finish = (): void => {
      clearTimeout(timer)
      process.stdin.pause()
      resolve(Buffer.concat(chunks).toString('utf8'))
    }
    const timer = setTimeout(finish, STDIN_IDLE_MS)
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', finish)
    process.stdin.on('error', finish)
  })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const first = args[0]
  if (first !== undefined && CLI_COMMANDS.has(first)) {
    // Output is flushed by write callbacks; exitCode (not exit()) lets the event loop drain.
    const code = await runCli(args, {
      stdout: (text) => void process.stdout.write(text),
      stderr: (text) => void process.stderr.write(text),
      readStdin,
    })
    process.exitCode = code
    return
  }
  // Server mode: stdout carries only protocol frames. Logs go to stderr.
  const server = createUnseenServer()
  await server.connect(new StdioServerTransport())
  console.error('unseen-mcp: ready on stdio')
}

main().catch((error: unknown) => {
  console.error(`unseen-mcp: fatal: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
