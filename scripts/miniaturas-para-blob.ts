/**
 * Tira as miniaturas de template de dentro da coluna e as põe no Blob.
 *
 *   npx tsx scripts/miniaturas-para-blob.ts              # dry-run, toda a base
 *   npx tsx scripts/miniaturas-para-blob.ts --projeto 4  # dry-run, um cliente
 *   npx tsx scripts/miniaturas-para-blob.ts --confirmar
 *
 * `Template.thumbnailUrl` guardava a imagem inteira como `data:image/png;base64,…`
 * — medido em 05/09/2026: 129 de 129 miniaturas eram base64, média de 53,8 KB.
 * Como a listagem da aba de Templates devolve a coluna, ela carregava 1.492 KB
 * no projeto 4 e 5,8 MB na seção "Modelos da equipe" da carteira inteira.
 *
 * O caminho no Blob é `templates/thumbnails/<id>.png` — o MESMO que a rota
 * `generate-thumbnail` usa quando conhece o template, então regerar a miniatura
 * pela UI sobrescreve o arquivo em vez de deixar órfão.
 *
 * 🔴 A miniatura NÃO é apagada quando o upload falha: a linha fica como está e
 * o script segue. Rodar de novo retoma só o que sobrou.
 */
import 'dotenv/config'

import { put } from '@vercel/blob'
import { db } from '@/lib/db'

const EXTENSAO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function lerDataUrl(valor: string): { buffer: Buffer; tipo: string; ext: string } | null {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(valor)
  if (!m) return null
  const tipo = m[1].toLowerCase()
  const ext = EXTENSAO[tipo]
  if (!ext) return null
  const buffer = Buffer.from(m[2], 'base64')
  if (!buffer.length) return null
  return { buffer, tipo, ext }
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

async function main() {
  const args = process.argv.slice(2)
  const confirmar = args.includes('--confirmar')
  const i = args.indexOf('--projeto')
  const projectId = i >= 0 ? Number(args[i + 1]) : null
  if (i >= 0 && !Number.isFinite(projectId)) throw new Error('use --projeto <id>')

  if (confirmar && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN ausente — o upload iria falhar em todas as linhas')
  }

  const templates = await db.$queryRawUnsafe<
    Array<{ id: number; name: string; projectId: number; tamanho: number }>
  >(
    `SELECT t.id, t.name, t."projectId", length(t."thumbnailUrl") AS tamanho
       FROM "Template" t
      WHERE t."thumbnailUrl" LIKE 'data:%'
        ${projectId ? `AND t."projectId" = ${projectId}` : ''}
      ORDER BY t."projectId", t.id`,
  )

  const total = templates.reduce((s, t) => s + Number(t.tamanho), 0)
  console.log(
    `${templates.length} miniatura(s) embutida(s)${projectId ? ` no projeto ${projectId}` : ''}` +
      ` — ${kb(total)} na coluna${confirmar ? '' : ' (dry-run)'}`,
  )
  if (!templates.length) return

  let migradas = 0
  let ganho = 0
  const falhas: string[] = []

  for (const t of templates) {
    // A coluna não vem na consulta acima de propósito: são dezenas de KB por
    // linha, e a maioria das rodadas é dry-run.
    const linha = await db.template.findUnique({ where: { id: t.id }, select: { thumbnailUrl: true } })
    const lido = linha?.thumbnailUrl ? lerDataUrl(linha.thumbnailUrl) : null
    if (!lido) {
      falhas.push(`#${t.id} ${t.name}: data URL ilegível ou de tipo desconhecido`)
      continue
    }

    const caminho = `templates/thumbnails/${t.id}.${lido.ext}`
    console.log(
      `  #${t.id} [p${t.projectId}] ${t.name} — ${kb(Number(t.tamanho))} na coluna,` +
        ` ${kb(lido.buffer.length)} de imagem → ${caminho}`,
    )
    if (!confirmar) {
      migradas += 1
      ganho += Number(t.tamanho)
      continue
    }

    try {
      const blob = await put(caminho, lido.buffer, {
        access: 'public',
        contentType: lido.tipo,
        allowOverwrite: true, // retomar a migração não pode falhar no caminho já escrito
      })
      await db.template.update({ where: { id: t.id }, data: { thumbnailUrl: blob.url } })
      migradas += 1
      ganho += Number(t.tamanho) - blob.url.length
    } catch (erro) {
      falhas.push(`#${t.id} ${t.name}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  console.log(
    `\n${migradas} migrada(s), ${falhas.length} falha(s) — ${kb(ganho)} a menos na listagem` +
      `${confirmar ? '' : ' (nada foi gravado)'}`,
  )
  for (const f of falhas) console.log(`  ⚠️  ${f}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
