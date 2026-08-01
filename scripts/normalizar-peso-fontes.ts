/**
 * Devolve as camadas de texto ao peso REAL do arquivo da fonte.
 *
 * ## O problema
 *
 * Toda fonte de projeto é registrada com UMA face só — `font-manager.ts`
 * chama `addFontFace(family, url)` e o parâmetro `fontWeight` cai no default
 * `normal`. Quando a camada pede 700, não existe face 700: navegador e
 * napi-rs **sintetizam** o negrito, engrossando o traço ~20% sem trocar o
 * desenho nem as métricas. É negrito falso, não a tipografia da marca.
 *
 * O peso pedido só é honrado quando o ARQUIVO tem aquele peso. Como cada
 * `CustomFont` carrega um arquivo, o peso real de uma família é o
 * `OS/2.usWeightClass` do arquivo dela — e qualquer outro valor na camada é
 * mentira que o motor disfarça.
 *
 * ## O que o script faz
 *
 * Para cada projeto: lê o peso real de cada `CustomFont` (baixando o arquivo e
 * lendo a tabela OS/2) e reescreve `style.fontWeight` das camadas que usam
 * aquela família para esse peso. Mexe em `Page.layers` e em
 * `Template.designData.layers`.
 *
 * **Fontes que NÃO são do projeto ficam intactas** (Google, sistema): lá o
 * peso pedido costuma existir de verdade, e zerar seria estragar.
 *
 * ## Uso
 *
 *   npx tsx scripts/normalizar-peso-fontes.ts                 # dry-run (padrão)
 *   npx tsx scripts/normalizar-peso-fontes.ts --aplicar       # grava
 *   npx tsx scripts/normalizar-peso-fontes.ts --projeto 4     # limita a um projeto
 *
 * Dry-run por padrão de propósito: a mudança é visual, atinge template já
 * aprovado, e não há como desfazer sem backup.
 */

import { writeFileSync } from 'node:fs'
import { db } from '@/lib/db'

const APLICAR = process.argv.includes('--aplicar')
const projetoArg = process.argv.indexOf('--projeto')
const PROJETO = projetoArg >= 0 ? Number(process.argv[projetoArg + 1]) : null

// ---------------------------------------------------------------- fonte

const NOMES_PESO: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
}

/** Lê `OS/2.usWeightClass` do arquivo. É o peso que o desenho realmente tem. */
function lerPesoDoArquivo(buf: Buffer): { peso: number; variavel: boolean } | null {
  try {
    const numTables = buf.readUInt16BE(4)
    let os2: number | null = null
    let variavel = false
    for (let i = 0; i < numTables; i++) {
      const off = 12 + i * 16
      const tag = buf.toString('ascii', off, off + 4)
      if (tag === 'OS/2') os2 = buf.readUInt32BE(off + 8)
      if (tag === 'fvar') variavel = true
    }
    if (os2 == null) return null
    return { peso: buf.readUInt16BE(os2 + 4), variavel }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- camadas

/** `Page.layers` é JSON às vezes dupla-codificado — ver CLAUDE.md. */
function parseLayers(raw: unknown): { layers: any[]; profundidade: number } | null {
  let valor: any = raw
  let profundidade = 0
  for (let i = 0; i < 3 && typeof valor === 'string'; i++) {
    try { valor = JSON.parse(valor); profundidade++ } catch { return null }
  }
  return Array.isArray(valor) ? { layers: valor, profundidade } : null
}

function reempacota(layers: any[], profundidade: number): unknown {
  let valor: unknown = layers
  for (let i = 0; i < profundidade; i++) valor = JSON.stringify(valor)
  return valor
}

function normalizaPeso(valor: unknown): number | null {
  if (valor == null) return null
  if (typeof valor === 'number') return valor
  const texto = String(valor).trim().toLowerCase()
  if (texto === 'normal') return 400
  if (texto === 'bold') return 700
  const n = Number(texto)
  return Number.isFinite(n) ? n : null
}

/**
 * Percorre a camada e os segmentos de rich-text. Devolve quantos pesos foram
 * corrigidos. Rich-text carrega negrito em `fontStyle` ('bold', 'italic bold'),
 * e ali o faux-bold é desenhado à mão com stroke — some junto.
 */
/**
 * Limiar do negrito sintético, medido (não deduzido) em Chrome e napi-rs:
 * o motor engrossa quando o peso PEDIDO é >= 600 e o do ARQUIVO é < 600.
 * É liga/desliga — 600, 700 e 900 dão exatamente a mesma tinta (+18~21%),
 * e qualquer pedido abaixo de 600 desenha o arquivo como ele é.
 */
const LIMIAR_SINTESE = 600

function sintetiza(pedido: number, arquivo: number): boolean {
  return pedido >= LIMIAR_SINTESE && arquivo < LIMIAR_SINTESE
}

interface Contagem {
  /** O motor estava engrossando: corrigir MUDA a arte. */
  visual: number
  /** Já desenhava o arquivo como ele é: corrigir só arruma o dado. */
  cosmetico: number
}

function corrigeCamada(
  layer: any,
  pesoReal: number,
  familias: Set<string>,
  conta: Contagem,
): number {
  let mudou = 0
  const familia = layer?.style?.fontFamily
  if (typeof familia !== 'string' || !familias.has(familia)) return 0

  const registra = (atual: number) => {
    if (sintetiza(atual, pesoReal)) conta.visual++
    else conta.cosmetico++
    mudou++
  }

  const atual = normalizaPeso(layer.style?.fontWeight)
  if (atual !== null && atual !== pesoReal) {
    layer.style.fontWeight = pesoReal
    registra(atual)
  }

  const segmentos = layer.richTextStyles ?? layer.style?.richTextStyles
  if (Array.isArray(segmentos)) {
    for (const seg of segmentos) {
      // Segmento pode ter família própria
      const famSeg = seg?.fontFamily ?? familia
      if (!familias.has(famSeg)) continue
      const pesoSeg = normalizaPeso(seg?.fontWeight)
      if (pesoSeg !== null && pesoSeg !== pesoReal) {
        seg.fontWeight = pesoReal
        registra(pesoSeg)
      }
      // Negrito de rich-text mora em fontStyle, e ali o faux-bold é desenhado
      // à mão com stroke (konva-multi-styled-text) — sempre visual
      if (typeof seg?.fontStyle === 'string' && /bold/i.test(seg.fontStyle)) {
        const limpo = seg.fontStyle.replace(/bold/gi, '').trim().replace(/\s+/g, ' ')
        seg.fontStyle = limpo || 'normal'
        conta.visual++
        mudou++
      }
    }
  }

  return mudou
}

// ---------------------------------------------------------------- execução

async function main() {
  console.log(APLICAR ? '⚠️  MODO APLICAR — vai gravar no banco\n' : '🔍 DRY-RUN (use --aplicar para gravar)\n')

  const projetos = await db.project.findMany({
    where: PROJETO ? { id: PROJETO } : undefined,
    select: { id: true, name: true, CustomFont: { select: { fontFamily: true, fileUrl: true } } },
    orderBy: { id: 'asc' },
  })

  const conta: Contagem = { visual: 0, cosmetico: 0 }
  let totalPaginas = 0
  let totalTemplates = 0
  /** Estado ANTES de cada escrita — é o desfazer. Sem isso a mudança é
   *  irreversível, e ela mexe em template já aprovado. */
  const backup: Array<
    | { tipo: 'page'; id: string; layers: unknown }
    | { tipo: 'template'; id: number; designData: unknown }
  > = []

  for (const projeto of projetos) {
    if (projeto.CustomFont.length === 0) continue

    // peso real por família
    const pesoPorFamilia = new Map<string, number>()
    for (const fonte of projeto.CustomFont) {
      if (pesoPorFamilia.has(fonte.fontFamily)) continue
      try {
        const resposta = await fetch(fonte.fileUrl)
        if (!resposta.ok) {
          console.log(`   ⚠️  ${fonte.fontFamily}: HTTP ${resposta.status} — pulando`)
          continue
        }
        const info = lerPesoDoArquivo(Buffer.from(await resposta.arrayBuffer()))
        if (!info) {
          console.log(`   ⚠️  ${fonte.fontFamily}: OS/2 ilegível — pulando`)
          continue
        }
        if (info.variavel) {
          console.log(`   ⚠️  ${fonte.fontFamily}: fonte VARIÁVEL — pulando (o eixo de peso é real no navegador)`)
          continue
        }
        pesoPorFamilia.set(fonte.fontFamily, info.peso)
      } catch (erro) {
        console.log(`   ⚠️  ${fonte.fontFamily}: falha ao baixar (${(erro as Error).message}) — pulando`)
      }
    }
    if (pesoPorFamilia.size === 0) continue

    const familias = new Set(pesoPorFamilia.keys())
    const linhasProjeto: string[] = []
    const antesDoProjeto = { visual: conta.visual, cosmetico: conta.cosmetico }

    const templates = await db.template.findMany({
      where: { projectId: projeto.id },
      select: { id: true, name: true, designData: true, Page: { select: { id: true, name: true, layers: true } } },
    })

    for (const template of templates) {
      // 1. Páginas
      for (const pagina of template.Page) {
        const parsed = parseLayers(pagina.layers)
        if (!parsed) continue
        let mudou = 0
        for (const layer of parsed.layers) {
          const familia = layer?.style?.fontFamily
          const peso = typeof familia === 'string' ? pesoPorFamilia.get(familia) : undefined
          if (peso === undefined) continue
          mudou += corrigeCamada(layer, peso, familias, conta)
        }
        if (mudou > 0) {
          totalPaginas++
          linhasProjeto.push(`   #${template.id} ${template.name} / ${pagina.name}: ${mudou}`)
          if (APLICAR) {
            backup.push({ tipo: 'page', id: pagina.id, layers: pagina.layers })
            await db.page.update({
              where: { id: pagina.id },
              data: { layers: reempacota(parsed.layers, parsed.profundidade) as never },
            })
          }
        }
      }

      // 2. designData legado do próprio template
      const design: any = template.designData
      const designOriginal = design ? JSON.parse(JSON.stringify(design)) : null
      if (design && Array.isArray(design.layers)) {
        let mudou = 0
        for (const layer of design.layers) {
          const familia = layer?.style?.fontFamily
          const peso = typeof familia === 'string' ? pesoPorFamilia.get(familia) : undefined
          if (peso === undefined) continue
          mudou += corrigeCamada(layer, peso, familias, conta)
        }
        if (mudou > 0) {
          totalTemplates++
          linhasProjeto.push(`   #${template.id} ${template.name} / designData: ${mudou}`)
          if (APLICAR) {
            backup.push({ tipo: 'template', id: template.id, designData: designOriginal })
            await db.template.update({ where: { id: template.id }, data: { designData: design } })
          }
        }
      }
    }

    if (linhasProjeto.length) {
      const resumo = [...pesoPorFamilia].map(([f, p]) => `${f}=${p} (${NOMES_PESO[p] ?? '?'})`).join(', ')
      console.log(`\n📁 ${projeto.id} ${projeto.name}`)
      const v = conta.visual - antesDoProjeto.visual
      const c = conta.cosmetico - antesDoProjeto.cosmetico
      console.log(`   peso real: ${resumo}`)
      console.log(`   ${v} mudam a arte | ${c} só arrumam o dado`)
      linhasProjeto.forEach((l) => console.log(l))
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`pesos corrigidos: ${conta.visual + conta.cosmetico}`)
  console.log(`  ${conta.visual} pediam MAIS que o arquivo entrega  → tira o negrito falso, MUDA a arte`)
  console.log(`  ${conta.cosmetico} pediam menos ou igual            → já desenhava certo, só arruma o dado`)
  console.log(`páginas afetadas: ${totalPaginas} | designData afetados: ${totalTemplates}`)
  if (APLICAR && backup.length) {
    const arquivo = `backup-peso-fontes-${process.env.BACKUP_STAMP ?? 'sem-data'}.json`
    writeFileSync(arquivo, JSON.stringify(backup, null, 1))
    console.log(`\n💾 backup de ${backup.length} registros em ${arquivo}`)
    console.log('   (restaurar = gravar layers/designData de volta a partir desse arquivo)')
  }
  if (!APLICAR) console.log('\nNada foi gravado. Rode com --aplicar para valer.')
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
  .then(() => process.exit(0))
