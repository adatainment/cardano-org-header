#!/usr/bin/env node

/**
 * Generates nodes.js and edges.js from a GitHub repository's file tree.
 *
 * Usage:
 *   node scripts/generate-data.js <owner/repo> [branch]
 *
 * Examples:
 *   node scripts/generate-data.js cardano-foundation/cardano-org
 *   node scripts/generate-data.js IntersectMBO/cardano-ledger main
 *
 * Requires: GITHUB_TOKEN env var (optional, but recommended for rate limits)
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const [repoArg, branch] = process.argv.slice(2)

if (!repoArg) {
  console.error('Usage: node scripts/generate-data.js <owner/repo> [branch]')
  process.exit(1)
}

const [owner, repo] = repoArg.split('/')
if (!owner || !repo) {
  console.error('Invalid repo format. Use: owner/repo')
  process.exit(1)
}

function ghFetch(urlPath) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'medusa-data-generator',
      'Accept': 'application/vnd.github.v3+json',
    }
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`
    }

    https.get({
      hostname: 'api.github.com',
      path: urlPath,
      headers,
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API ${res.statusCode}: ${data}`))
          return
        }
        resolve(JSON.parse(data))
      })
    }).on('error', reject)
  })
}

async function getDefaultBranch() {
  const repoData = await ghFetch(`/repos/${owner}/${repo}`)
  return repoData.default_branch
}

async function main() {
  const ref = branch || await getDefaultBranch()
  console.log(`Fetching tree for ${owner}/${repo} @ ${ref} ...`)

  const treeData = await ghFetch(`/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`)

  if (treeData.truncated) {
    console.warn('Warning: tree was truncated by GitHub API (repo too large)')
  }

  console.log(`Got ${treeData.tree.length} entries`)

  // Build nodes
  const nodes = []
  const dirMap = new Map() // path -> node index

  // Root node
  nodes.push({ t: 'r', p: '/', id: 0 })
  dirMap.set('', 0)

  let nextId = 1

  // Sort: directories first, then files, alphabetically
  const entries = treeData.tree.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  // First pass: create all directory nodes
  for (const entry of entries) {
    if (entry.type !== 'tree') continue
    const id = nextId++
    const parentPath = path.dirname(entry.path)
    const parentKey = parentPath === '.' ? '' : parentPath
    const parentIdx = dirMap.get(parentKey)

    const node = { t: 'd', p: entry.path, id }
    if (parentIdx !== undefined && parentIdx !== 0) {
      node.pid = String(nodes[parentIdx].id)
    }

    dirMap.set(entry.path, nodes.length)
    nodes.push(node)
  }

  // Second pass: create all file nodes
  for (const entry of entries) {
    if (entry.type !== 'blob') continue
    const id = nextId++
    const parentPath = path.dirname(entry.path)
    const parentKey = parentPath === '.' ? '' : parentPath
    const parentIdx = dirMap.get(parentKey)

    const node = { t: 'f', p: entry.path, id }
    if (parentIdx !== undefined && parentIdx !== 0) {
      node.pid = String(nodes[parentIdx].id)
    }

    nodes.push(node)
  }

  // Build edges as flat array of [childIndex, parentIndex] pairs
  const edges = []
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i]
    const parentPath = path.dirname(node.p)
    const parentKey = parentPath === '.' ? '' : parentPath
    const parentIdx = dirMap.get(parentKey)

    if (parentIdx !== undefined) {
      edges.push(i, parentIdx)
    }
  }

  // Limit to 2500 nodes (GPU tier max) — keep all directories, trim files
  const MAX_NODES = 2500
  if (nodes.length > MAX_NODES) {
    console.log(`Trimming from ${nodes.length} to ${MAX_NODES} nodes`)
    nodes.length = MAX_NODES
    // Rebuild edges for the trimmed node set
    edges.length = 0
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i]
      const parentPath = path.dirname(node.p)
      const parentKey = parentPath === '.' ? '' : parentPath
      const parentIdx = dirMap.get(parentKey)
      if (parentIdx !== undefined && parentIdx < nodes.length) {
        edges.push(i, parentIdx)
      }
    }
  }

  console.log(`Generated ${nodes.length} nodes, ${edges.length / 2} edges`)

  // Write nodes.js
  const nodesContent = 'export const nodes = [\n  [\n' +
    nodes.map((n) => '    ' + JSON.stringify(n)).join(',\n') +
    '\n  ]\n]\n'

  // Write edges.js
  const edgesContent = 'export const edges = [' + edges.join(', ') + ']\n'

  const dataDir = path.join(__dirname, '..', 'src', 'data')
  fs.writeFileSync(path.join(dataDir, 'nodes.js'), nodesContent)
  fs.writeFileSync(path.join(dataDir, 'edges.js'), edgesContent)

  console.log(`Written to src/data/nodes.js (${nodes.length} nodes) and src/data/edges.js (${edges.length / 2} edges)`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
