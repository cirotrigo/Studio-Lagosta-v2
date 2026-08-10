/**
 * E2E do fluxo de foto via chat (lib-level, prod DB, cleanup completo).
 */
import sharp from 'sharp'
import { db } from '@/lib/db'
import { runMcpTool } from '@/lib/mcp/tools'
import { receberFoto } from '@/lib/creatives/chat-upload'

const service = { kind: 'service' as const }
let falhas = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? '  ✓' : '  ✗ FALHOU'} — ${label}`)
  if (!cond) falhas++
}
function parse(r: any) {
  const text = r.content.find((c: any) => c.type === 'text')?.text ?? ''
  if (r.isError) throw new Error(text)
  return JSON.parse(text)
}

async function main() {
  const criados: string[] = []
  try {
    console.log('\n[1] pedir-foto via tool')
    const pedido = parse(await runMcpTool('pedir-foto', { projectId: 8 }, service))
    criados.push(pedido.uploadId)
    check(pedido.url.includes(`/envio/${pedido.uploadId}`), `link: ${pedido.url}`)

    console.log('\n[2] ver-foto-enviada antes do envio')
    const antes = parse(await runMcpTool('ver-foto-enviada', { projectId: 8, uploadId: pedido.uploadId }, service))
    check(antes.situacao === 'aguardando', `situacao: ${antes.situacao}`)

    console.log('\n[3] receber foto (JPEG deitado com EXIF de rotação)')
    // Foto 800x600 com EXIF orientation 6 (90°): o recebimento deve auto-orientar → 600x800
    const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 30, b: 30 } } })
      .jpeg({ quality: 80 })
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const recebida = await receberFoto(pedido.uploadId, foto)
    check(recebida.fotoUrl.includes('chat-uploads/8/'), `fotoUrl: ${recebida.fotoUrl.slice(0, 90)}`)
    check(recebida.width === 600 && recebida.height === 800, `EXIF auto-orientado: ${recebida.width}x${recebida.height} (esperado 600x800)`)

    const depois = parse(await runMcpTool('ver-foto-enviada', { projectId: 8, uploadId: pedido.uploadId }, service))
    check(depois.situacao === 'recebida' && depois.fotoUrl === recebida.fotoUrl, 'ver-foto-enviada → recebida com a URL')

    console.log('\n[4] reenvio dentro da validade substitui')
    const foto2 = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 30, g: 30, b: 200 } } }).jpeg().toBuffer()
    const recebida2 = await receberFoto(pedido.uploadId, foto2)
    check(recebida2.fotoUrl === recebida.fotoUrl && recebida2.width === 400, 'mesma URL, conteúdo novo')

    console.log('\n[5] recusas')
    try { await receberFoto('token-inexistente', foto2); check(false, 'token inválido deveria recusar') }
    catch (e: any) { check(e?.code === 'ENVIO_NAO_ENCONTRADO', `token inválido: ${e?.code}`) }
    try { await receberFoto(pedido.uploadId, Buffer.from('não sou imagem')); check(false, 'não-imagem deveria recusar') }
    catch (e: any) { check(e?.code === 'ARQUIVO_INVALIDO', `não-imagem: ${e?.code}`) }
    await db.chatUpload.update({ where: { id: pedido.uploadId }, data: { expiresAt: new Date(Date.now() - 60_000) } })
    try { await receberFoto(pedido.uploadId, foto2); check(false, 'expirado deveria recusar') }
    catch (e: any) { check(e?.code === 'ENVIO_EXPIRADO', `expirado: ${e?.code}`) }
    const expirado = parse(await runMcpTool('ver-foto-enviada', { projectId: 8, uploadId: pedido.uploadId }, service))
    // Já recebida vence a expiração no ver (a foto está lá) — regra da lib
    check(expirado.situacao === 'recebida', `ver após expirar com foto recebida: ${expirado.situacao}`)
    const alheio = await runMcpTool('ver-foto-enviada', { projectId: 7, uploadId: pedido.uploadId }, service)
    check(alheio.isError === true, 'outro projeto não enxerga o pedido')
  } finally {
    console.log('\n[cleanup]')
    const del = await db.chatUpload.deleteMany({ where: { id: { in: criados } } })
    console.log(`  uploads apagados: ${del.count}`)
    await db.$disconnect()
  }
  console.log(falhas === 0 ? '\n✅ E2E passou' : `\n❌ ${falhas} falha(s)`)
  process.exit(falhas ? 1 : 0)
}
main().catch((e) => { console.error('💥', e); process.exit(1) })
