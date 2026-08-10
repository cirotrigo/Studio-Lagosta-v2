/**
 * Varre templates e páginas atrás de cor hex malformada e conserta.
 *
 * O canvas do navegador IGNORA em silêncio uma cor inválida, então o editor
 * desenha normalmente; o napi-rs do render server-side LANÇA e derruba a arte
 * INTEIRA. Um `#0000000` (sete dígitos) digitado no campo de sombra do
 * template 213 deixou o story das 10:00 de 09/08/2026 do Seu Quinto em
 * RENDER_FAILED — terminal depois de 3 tentativas — e o post iria ao ar sem
 * arte nenhuma.
 *
 * O render já não quebra mais por isso (`RenderEngine.sanitizeColor`), mas ele
 * DESCARTA a cor ruim. Este script recupera a intenção: o hex é truncado para
 * a forma válida mais próxima (`#0000000` → `#000000`), que é quase sempre o
 * que a pessoa quis digitar.
 *
 *   npx tsx scripts/reparar-cores-invalidas.ts            # dry-run
 *   npx tsx scripts/reparar-cores-invalidas.ts --aplicar
 *
 * Posts SCHEDULED cuja página foi consertada e que estão em RENDER_FAILED
 * voltam para a fila (PENDING, tentativas zeradas). Post já entregue ao
 * publicador (`laterPostId`) não é tocado — a arte dele já saiu do nosso
 * alcance.
 */
import { db } from '../src/lib/db'

const APLICAR = process.argv.includes('--aplicar')

const HEX_VALIDO = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const PARECE_HEX = /^#[0-9a-f]*$/i

/** `#0000000` → `#000000`; `#00` → null (curto demais para adivinhar). */
function consertarHex(valor: string): string | null {
  const bruto = valor.trim()
  if (!PARECE_HEX.test(bruto) || HEX_VALIDO.test(bruto)) return null
  const corpo = bruto.slice(1)
  for (const tamanho of [8, 6, 4, 3]) {
    if (corpo.length > tamanho) return `#${corpo.slice(0, tamanho)}`
  }
  return null
}

interface Achado {
  caminho: string
  de: string
  para: string
}

/** Reescreve in-place e devolve o que mudou. */
function repararEmArvore(no: unknown, caminho: string, achados: Achado[]): void {
  if (no === null || typeof no !== 'object') return

  for (const [chave, valor] of Object.entries(no as Record<string, unknown>)) {
    const filho = `${caminho}.${chave}`
    if (typeof valor === 'string') {
      const corrigido = consertarHex(valor)
      if (corrigido) {
        achados.push({ caminho: filho, de: valor, para: corrigido })
        ;(no as Record<string, unknown>)[chave] = corrigido
      }
    } else {
      repararEmArvore(valor, filho, achados)
    }
  }
}

/** `Page.layers` é JSON com codificação dupla em parte das linhas. */
function desserializar(valor: unknown): { dados: unknown; niveis: number } {
  let dados = valor
  let niveis = 0
  while (typeof dados === 'string' && niveis < 3) {
    try {
      dados = JSON.parse(dados)
      niveis += 1
    } catch {
      break
    }
  }
  return { dados, niveis }
}

function reserializar(dados: unknown, niveis: number): unknown {
  let saida: unknown = dados
  for (let i = 0; i < niveis; i += 1) saida = JSON.stringify(saida)
  return saida
}

async function main() {
  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== DRY-RUN (use --aplicar) ===\n')

  const paginasCorrigidas: string[] = []

  const templates = await db.template.findMany({
    select: { id: true, name: true, projectId: true, designData: true },
  })
  for (const template of templates) {
    const { dados, niveis } = desserializar(template.designData)
    const achados: Achado[] = []
    repararEmArvore(dados, 'designData', achados)
    if (!achados.length) continue

    console.log(`TEMPLATE ${template.id} "${template.name}" (projeto ${template.projectId})`)
    for (const a of achados) console.log(`   ${a.caminho}: ${a.de} → ${a.para}`)
    if (APLICAR) {
      await db.template.update({
        where: { id: template.id },
        data: { designData: reserializar(dados, niveis) as never },
      })
    }
  }

  const paginas = await db.page.findMany({ select: { id: true, name: true, templateId: true, layers: true } })
  for (const pagina of paginas) {
    const { dados, niveis } = desserializar(pagina.layers)
    const achados: Achado[] = []
    repararEmArvore(dados, 'layers', achados)
    if (!achados.length) continue

    paginasCorrigidas.push(pagina.id)
    console.log(`PÁGINA ${pagina.id} "${pagina.name}" (template ${pagina.templateId})`)
    for (const a of achados) console.log(`   ${a.caminho}: ${a.de} → ${a.para}`)
    if (APLICAR) {
      await db.page.update({
        where: { id: pagina.id },
        data: { layers: reserializar(dados, niveis) as never },
      })
    }
  }

  if (!paginasCorrigidas.length) {
    console.log('\nNenhuma página com cor inválida.')
    return
  }

  // Só o que falhou POR ISSO volta para a fila. Post já RENDERED tem arte
  // válida no Blob; refazer sem necessidade arriscaria trocar a arte por
  // uma versão diferente da que foi aprovada.
  const presos = await db.socialPost.findMany({
    where: {
      pageId: { in: paginasCorrigidas },
      renderStatus: 'RENDER_FAILED',
      laterPostId: null,
      status: { in: ['DRAFT', 'SCHEDULED'] },
    },
    select: { id: true, scheduledDatetime: true, projectId: true },
  })

  console.log(`\nPosts a devolver para a fila de render: ${presos.length}`)
  for (const post of presos) {
    console.log(`   ${post.id} | projeto ${post.projectId} | ${post.scheduledDatetime?.toISOString()}`)
    if (APLICAR) {
      await db.socialPost.update({
        where: { id: post.id },
        data: {
          renderStatus: 'PENDING',
          renderAttempts: 0,
          renderError: null,
          nextRenderAt: new Date(),
        },
      })
    }
  }
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
