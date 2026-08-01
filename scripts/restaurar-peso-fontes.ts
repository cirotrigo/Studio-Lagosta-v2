/**
 * Desfaz o `normalizar-peso-fontes.ts` a partir do backup que ele grava.
 *
 * O backup guarda o `layers` / `designData` EXATO de antes da escrita, então a
 * restauração é uma cópia de volta — não uma reversão calculada. Rodar duas
 * vezes dá no mesmo.
 *
 *   npx tsx scripts/restaurar-peso-fontes.ts backup-peso-fontes-2026-07-31_22-22.json
 *   npx tsx scripts/restaurar-peso-fontes.ts <arquivo> --aplicar
 *
 * Dry-run por padrão, igual ao script que ele desfaz.
 */

import { readFileSync } from 'node:fs'
import { db } from '@/lib/db'

type Registro =
  | { tipo: 'page'; id: string; layers: unknown }
  | { tipo: 'template'; id: number; designData: unknown }

const APLICAR = process.argv.includes('--aplicar')
const ARQUIVO = process.argv.slice(2).find((a) => !a.startsWith('--'))

async function main() {
  if (!ARQUIVO) {
    console.error('uso: npx tsx scripts/restaurar-peso-fontes.ts <backup.json> [--aplicar]')
    process.exit(1)
  }

  const registros = JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Registro[]
  console.log(APLICAR ? '⚠️  MODO APLICAR\n' : '🔍 DRY-RUN (use --aplicar para gravar)\n')
  console.log(`${registros.length} registros no backup`)

  let paginas = 0
  let templates = 0
  let ausentes = 0

  for (const registro of registros) {
    if (registro.tipo === 'page') {
      const existe = await db.page.findUnique({ where: { id: registro.id }, select: { id: true } })
      if (!existe) {
        // Página apagada depois do backup: restaurar recriaria lixo
        ausentes++
        continue
      }
      paginas++
      if (APLICAR) {
        await db.page.update({ where: { id: registro.id }, data: { layers: registro.layers as never } })
      }
    } else {
      const existe = await db.template.findUnique({ where: { id: registro.id }, select: { id: true } })
      if (!existe) {
        ausentes++
        continue
      }
      templates++
      if (APLICAR) {
        await db.template.update({
          where: { id: registro.id },
          data: { designData: registro.designData as never },
        })
      }
    }
  }

  console.log(`\npáginas: ${paginas} | templates: ${templates}`)
  if (ausentes) console.log(`${ausentes} registros já não existem no banco — ignorados`)
  if (!APLICAR) console.log('\nNada foi gravado. Rode com --aplicar para valer.')
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
  .then(() => process.exit(0))
