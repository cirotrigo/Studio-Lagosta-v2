/**
 * Recompõe, SEM GRAVAR NADA (`provar: true`), as últimas peças reais do
 * compositor de cada cliente com o código deste checkout e a spec que a usina
 * gravou. É a prova de regressão do compositor e da assinatura: a variante sai
 * do template "Assinatura" de hoje, como na usina.
 *
 *   npx tsx scripts/recompor-pecas-reais.ts [--projetos 1,6] [--limite 5] [--saida <pasta>]
 *
 * Rode antes e depois de uma mudança, em duas pastas, e compare as folhas peça a
 * peça. Foi assim que apareceram, em 11/09/2026, as manchetes do TERO em caixa
 * mista depois da troca da assinatura e a logo da Real por cima do título — a
 * prova dos modelos, que compõe com a copy da própria página, não pegava nenhuma
 * das duas. Recusa esperada: copy com um papel que a variante de hoje não tem
 * (a página mudou depois da peça), e imagem que o Blob recusa com 403 quando há
 * outra prova rodando junto — refaça só aquela.
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

async function main() {
  const projetos = (argumento('--projetos') ?? '1,2,3,4,5,6,7,8,11,12').split(',').map(Number)
  const limite = Number(argumento('--limite') ?? 5)
  const saida = argumento('--saida') ?? path.join(process.cwd(), '.tmp-recompor-pecas-reais')
  await fs.mkdir(saida, { recursive: true })
  let total = 0
  let falhas = 0
  const arquivos: string[] = []

  for (const projectId of projetos) {
    const linhas = (await db.$queryRawUnsafe(
      `SELECT id, "fieldValues"->'spec' AS spec, "fieldValues"->'composicao'->'assinatura'->>'variante' AS variante
         FROM "Generation"
        WHERE "projectId" = $1 AND "fieldValues"->>'source' = 'compositor' AND status = 'COMPLETED' AND "fieldValues" ? 'spec'
        ORDER BY "createdAt" DESC LIMIT $2`,
      projectId,
      limite,
    )) as Array<{ id: string; spec: SpecDePeca; variante: string | null }>
    console.log(`\n===== projeto ${projectId}: ${linhas.length} peça(s)`)
    for (const g of linhas) {
      total++
      const copy = g.spec.blocos.map((b) => `${b.papel}(${b.linhas.length})`).join(' ')
      try {
        const r = await comporPeca(g.spec, { provar: true })
        // O nome do arquivo é o fim do id da geração: a mesma peça cai no mesmo nome antes e depois
        const arquivo = path.join(saida, `${projectId}-${g.id.slice(-6)}.png`)
        await fs.writeFile(arquivo, r.prova!)
        arquivos.push(arquivo)
        const d = r.diagnostico
        const graves = d.avisos.filter((a) => /sobrep|não coube|faltou|sem papel|não tem|encostava/i.test(a))
        console.log(`✓ ${g.id.slice(-6)} ${g.spec.formato} ${copy} · ${d.posicao.ancora}/${d.posicao.alinha}${graves.length ? ` · ${graves.join(' · ').slice(0, 220)}` : ''}`)
      } catch (erro) {
        falhas++
        console.log(`✗ ${g.id.slice(-6)} ${g.spec.formato} ${copy} · variante "${g.variante ?? '?'}" · ${(erro instanceof Error ? erro.message : String(erro)).slice(0, 260)}`)
      }
    }
  }

  if (arquivos.length > 0) {
    const largura = 216
    const altura = 384
    const porLinha = 10
    const miniaturas = await Promise.all(arquivos.map((a) => sharp(a).resize(largura, altura, { fit: 'contain', background: '#222222' }).png().toBuffer()))
    await sharp({
      create: { width: (largura + 8) * Math.min(porLinha, arquivos.length) + 8, height: (altura + 8) * Math.ceil(arquivos.length / porLinha) + 8, channels: 3, background: '#222222' },
    })
      .composite(miniaturas.map((input, i) => ({ input, left: 8 + (i % porLinha) * (largura + 8), top: 8 + Math.floor(i / porLinha) * (altura + 8) })))
      .png()
      .toFile(path.join(saida, 'folha.png'))
  }
  console.log(`\n${total - falhas} de ${total} recomposta(s) sem erro · folha em ${path.join(saida, 'folha.png')}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
