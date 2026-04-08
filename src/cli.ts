#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import getPort from 'get-port'
import { isGitRepo } from './git.js'
import { startServer } from './server.js'

const { values, positionals } = parseArgs({
  options: {
    port: { type: 'string', short: 'p' },
    host: { type: 'string' },
    'no-open': { type: 'boolean', default: false },
    help: { type: 'boolean' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(`diffx - Local code review tool for git diffs

Usage: diffx [options] [-- <git diff args>]

Options:
  -p, --port <port>  Port to run the server on (default: random available port)
  --host <host>      Host address to bind to (default: 127.0.0.1). Pass
                     0.0.0.0 to expose the server to the local network.
  --no-open          Don't open the browser automatically
  -v, --version      Show version number
  -h, --help         Show this help message

Examples:
  diffx                        Review uncommitted changes
  diffx -- --staged            Review staged changes
  diffx -- HEAD~3              Review last 3 commits
  diffx -- main..feature       Compare branches
  diffx --host 0.0.0.0         Allow other machines on the LAN to review`)
  process.exit(0)
}

if (values.version) {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'))
  console.log(pkg.version)
  process.exit(0)
}

// Everything after -- becomes custom git diff args
const customDiffArgs = positionals.length > 0 ? positionals : undefined

if (!isGitRepo()) {
  console.error('Error: not inside a git repository')
  process.exit(1)
}

const port = await getPort(values.port ? { port: parseInt(values.port, 10) } : undefined)
const host = values.host ?? '127.0.0.1'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDir = resolve(__dirname, 'client')
const { existsSync } = await import('node:fs')
const resolvedClientDir = existsSync(clientDir)
  ? clientDir
  : resolve(process.cwd(), 'dist/client')

const { port: actualPort } = await startServer({ port, host, clientDir: resolvedClientDir, customDiffArgs })

const localUrl = `http://${host}:${actualPort}`

console.log(`diffx server running at ${localUrl}`)

if (!values['no-open']) {
  const openHost = host === '0.0.0.0' ? '127.0.0.1' : host
  const openUrl = `http://${openHost}:${actualPort}`
  const openModule = await import('open')
  openModule.default(openUrl)
}

process.on('SIGINT', () => {
  console.log('\nShutting down...')
  process.exit(0)
})
