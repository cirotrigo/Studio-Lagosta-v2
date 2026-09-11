/**
 * Prova o compositor montando peças com os ARRANJOS de páginas de assinatura
 * que ainda estão em espera — sem gravar nada (`provar: true`, só renderiza).
 *
 * Nasceu com os modelos do Quintal recriados no editor (template 448, 11/09/2026):
 * grupos com elementos (ícones, filete, a logo ao lado do serviço), manchete com
 * segunda voz e serviço em duas linhas. É o que se roda antes de mover páginas
 * para o template "Assinatura", onde a usina de produção passa a usá-las.
 *
 *   npx tsx scripts/provar-combinacoes-no-compositor.ts [--saida <pasta>] [--so <caso>]
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { db } from '@/lib/db'
import { comporPeca } from '@/lib/compositor/compor'
import type { SpecDePeca } from '@/lib/compositor/spec'

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const ALMOCO = '30603bb5-b178-448b-a554-b4cdcbf702ae'
const CONVITE = '9d449c7d-0b59-4e02-adfe-cc82ea67c572'
const DIA = 'e543493d-62eb-46e5-ad23-08a85284cf73'

interface Caso {
  nome: string
  pagina: string
  foto: string
  blocos: SpecDePeca['blocos']
}

const CASOS: Caso[] = [
  {
    nome: 'almoco-executivo',
    pagina: ALMOCO,
    foto: '1vYhEoXUKBlgkk9qTSawOcVGL-ozOp6ue',
    blocos: [
      { papel: 'headline', linhas: ['Almoço', 'executivo'] },
      { papel: 'apoio', linhas: ['Direto da parrilla', 'para o seu prato.'] },
      { papel: 'servico', linhas: ['Seg a sex das 11h às 16h ·', 'Praia do Canto, Vitória-ES'] },
    ],
  },
  {
    nome: 'almoco-sem-servico',
    pagina: ALMOCO,
    foto: '1vYhEoXUKBlgkk9qTSawOcVGL-ozOp6ue',
    blocos: [
      { papel: 'headline', linhas: ['Almoço', '[executivo] hoje'] },
      { papel: 'apoio', linhas: ['Picanha, arroz e farofa.'] },
    ],
  },
  {
    nome: 'convite-do-dia',
    pagina: CONVITE,
    foto: '1al6QmDGFsEqO0x3nvAosZewquuh2671E',
    blocos: [
      { papel: 'headline', linhas: ['Sexta', 'é dia de', 'quintal'] },
      { papel: 'apoio', linhas: ['Da hora do almoço', 'até o último brinde.'] },
      { papel: 'servico', linhas: ['Sexta, [das 11h às 00h] · Praia do Canto, Vitória-ES'] },
      { papel: 'cta', linhas: ['Bora pro quintal?'] },
    ],
  },
  {
    nome: 'dia-no-quintal',
    pagina: DIA,
    foto: '1ro_HncFU1X677HQ3EOvG4UrxpZII6_bz',
    blocos: [
      { papel: 'headline', linhas: ['Sábado no', 'Quintal'] },
      { papel: 'servico', linhas: ['Sábado, das 11h às 00h', 'Rua Aleixo Netto, 1158, Praia do Canto'] },
    ],
  },
  {
    nome: 'dia-so-horario',
    pagina: DIA,
    foto: '1ro_HncFU1X677HQ3EOvG4UrxpZII6_bz',
    blocos: [
      { papel: 'headline', linhas: ['Domingo no', 'Quintal'] },
      { papel: 'servico', linhas: ['Domingo, das 11h às 18h'] },
    ],
  },
]

async function main() {
  const saida = argumento('--saida') ?? path.join(process.cwd(), '.tmp-provas-combinacoes')
  const so = argumento('--so')
  await fs.mkdir(saida, { recursive: true })

  const arquivos: string[] = []
  for (const caso of CASOS.filter((c) => !so || c.nome === so)) {
    const spec: SpecDePeca = { projectId: 2, formato: 'story', foto: { driveFileId: caso.foto }, blocos: caso.blocos, nome: caso.nome }
    try {
      const r = await comporPeca(spec, { provar: true, paginasDeAssinatura: [caso.pagina] })
      const arquivo = path.join(saida, `${caso.nome}.png`)
      await fs.writeFile(arquivo, r.prova!)
      arquivos.push(arquivo)
      const d = r.diagnostico
      console.log(`\n✓ ${caso.nome}`)
      console.log(`  arranjos: ${(d.arranjos ?? []).map((a) => `${a.grupo} → ${a.nome} (${a.motivo})`).join(' | ')}`)
      console.log(`  posição: ${d.posicao.ancora}/${d.posicao.alinha} · logo: ${d.logo ? d.logo.canto : 'no arranjo ou nenhuma'}`)
      console.log(`  elementos: ${r.layers.filter((l) => (l.metadata as { compositor?: { elementoDe?: string } } | undefined)?.compositor?.elementoDe).map((l) => `${l.name}@${Math.round(l.position.x)},${Math.round(l.position.y)}`).join(', ') || 'nenhum'}`)
      if (d.avisos.length > 0) console.log(`  avisos: ${d.avisos.join(' · ')}`)
    } catch (erro) {
      console.log(`\n✗ ${caso.nome}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  if (arquivos.length > 0) {
    const largura = 360
    const altura = 640
    const miniaturas = await Promise.all(arquivos.map((a) => sharp(a).resize(largura, altura).png().toBuffer()))
    const folha = await sharp({ create: { width: (largura + 16) * miniaturas.length + 16, height: altura + 32, channels: 3, background: '#222222' } })
      .composite(miniaturas.map((input, i) => ({ input, left: 16 + i * (largura + 16), top: 16 })))
      .png()
      .toFile(path.join(saida, 'folha.png'))
    console.log(`\nFolha: ${path.join(saida, 'folha.png')} (${folha.width}x${folha.height}) — ${arquivos.map((a) => path.basename(a, '.png')).join(', ')}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
