import { config } from 'dotenv'
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env' })
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env.local', override: true })

const apiKey = process.env.ZERNIO_API_KEY || process.env.LATER_API_KEY
const baseUrl = process.env.ZERNIO_API_URL || 'https://zernio.com/api/v1'

if (!apiKey) {
  console.error('Missing ZERNIO_API_KEY / LATER_API_KEY')
  process.exit(1)
}

const laterPostId = process.argv[2] || '69e2b74173ed4b2d3b40218b'

console.log(`Fetching Zernio post ${laterPostId} from ${baseUrl}...`)
const resp = await fetch(`${baseUrl}/posts/${laterPostId}`, {
  headers: { Authorization: `Bearer ${apiKey}` }
})
console.log('HTTP:', resp.status, resp.statusText)
const body = await resp.text()
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2))
} catch {
  console.log(body)
}
