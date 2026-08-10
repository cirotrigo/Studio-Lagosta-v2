/**
 * Smoke da tool upload-creative pela superfície real (stdio JSON-RPC):
 * sobe o servidor MCP, manda uma PASTA com 2 PNGs e apaga tudo depois.
 */
import 'dotenv/config'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { del } from '@vercel/blob'
import { db } from '../src/lib/db'

const PROJECT_ID = 8
const DIR = '/tmp/teste-artes-mcp'

function rpc(child: any, id: number, method: string, params: unknown) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
}

async function main() {
  fs.rmSync(DIR, { recursive: true, force: true })
  fs.mkdirSync(DIR, { recursive: true })
  for (const [i, cor] of [{ r: 20, g: 120, b: 200 }, { r: 240, g: 180, b: 40 }].entries()) {
    await sharp({ create: { width: 1080, height: 1350, channels: 3, background: cor } })
      .jpeg()
      .toFile(path.join(DIR, `arte-${i + 1}.jpg`))
  }
  fs.writeFileSync(path.join(DIR, 'ignorar.txt'), 'não é imagem')

  const child = spawn('node_modules/.bin/tsx', ['scripts/mcp-server.ts'], { stdio: ['pipe', 'pipe', 'inherit'] })
  let buf = ''
  const respostas = new Map<number, any>()
  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    const linhas = buf.split('\n')
    buf = linhas.pop() ?? ''
    for (const l of linhas) {
      if (!l.trim()) continue
      const msg = JSON.parse(l)
      if (msg.id !== undefined) respostas.set(msg.id, msg)
    }
  })

  const esperar = async (id: number, timeoutMs = 120_000) => {
    const limite = Date.now() + timeoutMs
    while (Date.now() < limite) {
      if (respostas.has(id)) return respostas.get(id)
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`timeout esperando resposta ${id}`)
  }

  rpc(child, 1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0' },
  })
  await esperar(1)
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

  rpc(child, 2, 'tools/list', {})
  const lista = await esperar(2)
  const tool = lista.result.tools.find((t: any) => t.name === 'upload-creative')
  console.log('TOOL REGISTRADA:', Boolean(tool), '| total de tools:', lista.result.tools.length)

  rpc(child, 3, 'tools/call', {
    name: 'upload-creative',
    arguments: { projectId: PROJECT_ID, filePaths: [DIR, '/tmp/nao-existe.png'], name: 'Smoke MCP', origem: 'smoke upload-creative' },
  })
  const chamada = await esperar(3)
  const texto = chamada.result.content[0].text
  console.log('RESPOSTA DA TOOL:\n', texto)
  child.kill()

  const payload = JSON.parse(texto)
  for (const arte of payload.artes ?? []) {
    await db.generation.delete({ where: { id: arte.generationId } })
    await db.page.delete({ where: { id: arte.pageId } })
    await del(arte.url)
  }
  // O coletor criado no teste some junto (o próximo upload real recria).
  const coletor = await db.template.findFirst({
    where: { projectId: PROJECT_ID, name: 'Arte Enviada — Feed' },
    select: { id: true, Page: { select: { id: true } } },
  })
  if (coletor && coletor.Page.length === 0) await db.template.delete({ where: { id: coletor.id } })
  fs.rmSync(DIR, { recursive: true, force: true })
  console.log('cleanup ok')
}

main()
  .catch((e) => {
    console.error('FALHOU:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
