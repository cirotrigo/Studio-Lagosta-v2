#!/usr/bin/env node

/**
 * Reindex knowledge base entry via API
 * Usage: node scripts/api-reindex.js <entry-id>
 */

const entryId = process.argv[2] || 'cmgzpldc80000jf04kwhwi0b8'

console.log(`🔄 Reindexing entry: ${entryId}\n`)

// Note: This script should be run from a browser console or with authentication
console.log(`
To reindex via API, run this in your browser console while logged in:

fetch('/api/admin/knowledge/${entryId}/reindex', {
  method: 'POST'
}).then(r => r.json()).then(console.log)

Or use curl with your auth cookie:

curl -X POST http://localhost:3000/api/admin/knowledge/${entryId}/reindex \\
  -H "Cookie: YOUR_AUTH_COOKIE_HERE"
`)
