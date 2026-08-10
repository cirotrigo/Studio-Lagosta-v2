/**
 * generate-drive-refresh-token.ts
 *
 * One-shot script to (re)generate a Google Drive refresh token with FULL drive scope.
 * This is needed when GOOGLE_DRIVE_REFRESH_TOKEN was created with a narrower scope
 * (e.g. drive.file) and you need to modify files the app did not create — like
 * renaming existing images uploaded by a user.
 *
 * Prerequisites:
 *   1. The Next.js dev server must NOT be running (we need port 3000 free).
 *   2. The redirect URI "http://localhost:3000/google-drive-callback" must be
 *      registered in the Google Cloud Console for this OAuth client.
 *   3. .env must have GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.
 *
 * Usage:
 *   npx tsx scripts/generate-drive-refresh-token.ts
 *
 * After it prints the new refresh token, copy it into .env as:
 *   GOOGLE_DRIVE_REFRESH_TOKEN=<new-token>
 */

import { google } from 'googleapis'
import * as http from 'http'
import { randomBytes } from 'crypto'
import 'dotenv/config'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const REDIRECT_URI = 'http://localhost:3000/google-drive-callback'
const PORT = 3000

async function main() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('✗ Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET in .env')
    process.exit(1)
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  const state = randomBytes(16).toString('hex')

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces refresh_token to be returned even on re-auth
    scope: [DRIVE_SCOPE],
    state,
  })

  console.log('═══════════════════════════════════════════════════')
  console.log('  Google Drive Refresh Token Generator (full scope)')
  console.log('═══════════════════════════════════════════════════\n')
  console.log('1. Make sure Next.js dev server is NOT running on port 3000.')
  console.log('2. Open this URL in your browser and authorize:\n')
  console.log(`   ${authUrl}\n`)
  console.log('3. After authorizing, Google will redirect to localhost:3000.')
  console.log('   This script will capture the code automatically.\n')
  console.log('Waiting for callback...\n')

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return
      const url = new URL(req.url, `http://localhost:${PORT}`)
      if (url.pathname !== '/google-drive-callback') {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const returnedState = url.searchParams.get('state')
      const returnedCode = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<h1>Erro</h1><p>${error}</p>`)
        server.close()
        reject(new Error(`OAuth error: ${error}`))
        return
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>Erro</h1><p>State mismatch</p>')
        server.close()
        reject(new Error('State mismatch'))
        return
      }

      if (!returnedCode) {
        res.writeHead(400)
        res.end('No code')
        server.close()
        reject(new Error('No code returned'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
        <html>
          <head><title>Sucesso</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #10b981;">✓ Autorização concluída!</h1>
            <p>Você pode fechar esta aba e voltar ao terminal.</p>
          </body>
        </html>
      `)
      server.close()
      resolve(returnedCode)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} is already in use. Stop the Next.js dev server (npm run dev) and try again.`))
      } else {
        reject(err)
      }
    })

    server.listen(PORT)
  })

  console.log('✓ Code received, exchanging for refresh token...\n')

  const { tokens } = await oauth2.getToken(code)

  if (!tokens.refresh_token) {
    console.error('✗ No refresh_token returned. This usually means you previously authorized this app and Google did not re-issue one.')
    console.error('  Fix: revoke access at https://myaccount.google.com/permissions, then run this script again.')
    process.exit(1)
  }

  console.log('═══════════════════════════════════════════════════')
  console.log('  ✓ Success!')
  console.log('═══════════════════════════════════════════════════\n')
  console.log('Scopes granted:', tokens.scope)
  console.log('\nCopy this into your .env file:\n')
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`)
  console.log('═══════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message ?? err)
  process.exit(1)
})
