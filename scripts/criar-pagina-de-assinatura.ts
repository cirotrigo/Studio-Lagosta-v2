/**
 * Cria (ou atualiza) a PÁGINA DE ASSINATURA de um projeto — o kit que o
 * compositor lê (§8 do plano editor-como-usina).
 *
 *   npx tsx scripts/criar-pagina-de-assinatura.ts --projeto 8            # dry-run
 *   npx tsx scripts/criar-pagina-de-assinatura.ts --projeto 8 --confirmar
 *
 * Template "Assinatura" com uma página por formato (story e feed), tag
 * `assinatura`, camadas de texto chamadas pelo PAPEL (pre, headline, apoio,
 * cta, servico) com o estilo da marca, e a logo com a largura da assinatura.
 * A posição das camadas é ilustrativa: o compositor lê o ESTILO e compõe a
 * posição pela foto. Os NÚMEROS (margens, safe area, faixa do halo) vão em
 * `Project.assinatura`.
 *
 * O kit de cada projeto está em `KITS_DE_ASSINATURA` abaixo — LIDO do
 * PADRAO.md do canvas de design de cada cliente, nunca inventado. Projeto
 * sem kit aqui não é criado: a assinatura de uma marca nova é uma leitura das
 * peças aprovadas dela, não um default.
 *
 * ⚠️ Roda contra o banco do `.env` (produção): é curadoria, como `/modelos`.
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import type { Layer } from '@/types/template'
import { normalizarCamadas } from '@/lib/creatives/layer-contract'
import { NOME_DO_TEMPLATE_DE_ASSINATURA, TAG_DA_ASSINATURA, type NumerosDaAssinatura } from '@/lib/compositor/assinatura'
import { DIMENSOES, type Formato } from '@/lib/compositor/spec'

interface PapelDoKit {
  fontFamily: string
  fontSize: number
  lineHeight: number
  /** em → px é feito aqui, no tamanho do papel. */
  trackingEm?: number
  textTransform?: 'uppercase'
  color: string
  exemplo: string
}

interface KitDeAssinatura {
  formatos: Partial<Record<Formato, Record<'pre' | 'headline' | 'apoio' | 'cta' | 'servico', PapelDoKit | null>>>
  logo: { largura: number } | null
  fundo: string
  numeros: Partial<NumerosDaAssinatura> & { geometria?: Partial<Record<Formato, Partial<NumerosDaAssinatura['geometria']['story']>>> }
}

const LARANJA = '#FF6B00'
const BRANCO = '#FFFFFF'
const CINZA = '#CFCFCF'

/**
 * Lagosta Criativa — `design-canvas/lagosta-padrao/PADRAO.md` §3 e §5.
 * Pré-título Yanone Bold caixa alta tracking 0,22em · headline Lobster Title
 * Case laranja · apoio Coolvetica Rg branca · CTA Yanone Bold caixa alta com
 * "→" · logo a 236px (22% do quadro, MEDIDO nas três artes aprovadas).
 * A faixa de tinta (0,26–0,58 texto, 0,12–0,30 marca) é a decisão do Ciro de
 * 02/09/2026 (§5.0): a mancha nunca vira marcação.
 */
const lagosta = (escala: number) => ({
  pre: { fontFamily: 'YanoneKaffeesatz Bold', fontSize: Math.round(30 * escala), lineHeight: 1.05, trackingEm: 0.22, textTransform: 'uppercase' as const, color: LARANJA, exemplo: 'Produção de conteúdo' },
  headline: { fontFamily: 'Lobster', fontSize: Math.round(96 * escala), lineHeight: 0.94, color: LARANJA, exemplo: 'Foto Nova a Cada\nQuinze Dias' },
  apoio: { fontFamily: 'Coolvetica Rg', fontSize: Math.round(42 * escala), lineHeight: 1.14, color: BRANCO, exemplo: 'O executivo muda de cardápio,\na produção acompanha.' },
  cta: { fontFamily: 'YanoneKaffeesatz Bold', fontSize: Math.round(32 * escala), lineHeight: 1.05, trackingEm: 0.1, textTransform: 'uppercase' as const, color: LARANJA, exemplo: '→ Conheça nossos pacotes' },
  servico: { fontFamily: 'Coolvetica Rg', fontSize: Math.round(30 * escala), lineHeight: 1.1, trackingEm: 0.04, color: CINZA, exemplo: 'lagostacriativa.com.br · @lagostacriativa' },
})

const KITS_DE_ASSINATURA: Record<number, KitDeAssinatura> = {
  8: {
    formatos: { story: lagosta(1), feed: lagosta(84 / 96) },
    logo: { largura: 236 },
    fundo: '#0B0B0B',
    numeros: {
      mancha: '#0B0B0B',
      fundo: '#0B0B0B',
      halo: { faixaTexto: [0.26, 0.58], faixaMarca: [0.12, 0.3], raioTexto: 190, raioMarca: 96 },
      logo: { largura: 236 },
      geometria: {
        story: { margemH: 92, safeTopo: 188, safeRodape: 224, gapEntreBlocos: 14, escalaDeFonte: 1 },
        feed: { margemH: 92, safeTopo: 96, safeRodape: 104, gapEntreBlocos: 14, escalaDeFonte: 84 / 96 },
        quadrado: { margemH: 92, safeTopo: 96, safeRodape: 104, gapEntreBlocos: 12, escalaDeFonte: 0.85 },
      },
    },
  },
}

function camadaDePapel(papel: string, k: PapelDoKit, y: number, ordem: number, mancha: string): Layer {
  return {
    id: papel,
    name: papel,
    type: 'text',
    visible: true,
    locked: false,
    order: ordem,
    isDynamic: true,
    position: { x: 92, y },
    size: { width: 896, height: Math.ceil(k.fontSize * k.lineHeight * (k.exemplo.split('\n').length)) + 12 },
    rotation: 0,
    content: k.exemplo,
    style: {
      fontFamily: k.fontFamily,
      fontSize: k.fontSize,
      lineHeight: k.lineHeight,
      letterSpacing: Math.round((k.trackingEm ?? 0) * k.fontSize * 100) / 100,
      ...(k.textTransform ? { textTransform: k.textTransform } : {}),
      color: k.color,
      textAlign: 'left',
    },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: k.lineHeight } },
    effects: { shadow: { enabled: true, shadowColor: mancha, shadowBlur: 10, shadowOffsetX: 0, shadowOffsetY: 1, shadowOpacity: 0.65 } },
  }
}

async function main() {
  const args = process.argv.slice(2)
  const confirmar = args.includes('--confirmar')
  const i = args.indexOf('--projeto')
  const projectId = i >= 0 ? Number(args[i + 1]) : NaN
  if (!Number.isFinite(projectId)) throw new Error('use --projeto <id>')
  const kit = KITS_DE_ASSINATURA[projectId]
  if (!kit) throw new Error(`Projeto ${projectId} não tem kit de assinatura neste script — leia o PADRAO.md dele e cadastre.`)

  const projeto = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, userId: true, Logo: { where: { isProjectLogo: true }, take: 1, select: { fileUrl: true } }, CustomFont: { select: { fontFamily: true } } },
  })
  if (!projeto) throw new Error('projeto não encontrado')
  const fontes = new Set(projeto.CustomFont.map((f) => f.fontFamily))
  const logoUrl = projeto.Logo[0]?.fileUrl ?? null

  const paginas: Array<{ formato: Formato; nome: string; camadas: Layer[] }> = []
  for (const [formato, papeis] of Object.entries(kit.formatos) as Array<[Formato, NonNullable<KitDeAssinatura['formatos'][Formato]>]>) {
    const dims = DIMENSOES[formato]
    const camadas: Layer[] = []
    let y = 200
    let ordem = 0
    for (const [papel, k] of Object.entries(papeis)) {
      if (!k) continue
      if (!fontes.has(k.fontFamily)) throw new Error(`fonte "${k.fontFamily}" não está cadastrada no projeto ${projectId}`)
      const camada = camadaDePapel(papel, k, y, ordem++, kit.numeros.mancha ?? '#111111')
      camadas.push(camada)
      y += camada.size.height + 24
    }
    if (kit.logo && logoUrl) {
      const largura = Math.round(kit.logo.largura * (formato === 'story' ? 1 : (papeis.headline?.fontSize ?? 96) / 96))
      camadas.push({
        id: 'logo', name: 'Logo', type: 'logo', visible: true, locked: false, order: ordem++, rotation: 0,
        position: { x: dims.width - 92 - largura, y: dims.height - 224 - Math.round(largura * 0.41) },
        size: { width: largura, height: Math.round(largura * 0.41) },
        fileUrl: logoUrl, style: { objectFit: 'contain' },
      })
    }
    const n = normalizarCamadas(camadas)
    paginas.push({ formato, nome: `Assinatura — ${formato}`, camadas: n.camadas })
  }

  console.log(`Projeto ${projeto.name} (#${projectId}) — ${paginas.length} página(s) de assinatura: ${paginas.map((p) => p.nome).join(', ')}`)
  console.log(`Logo: ${logoUrl ?? '(nenhuma marcada como do projeto)'}`)
  console.log(`Números: ${JSON.stringify(kit.numeros)}`)
  if (!confirmar) {
    console.log('\nDry-run. Use --confirmar para gravar.')
    return
  }

  const template =
    (await db.template.findFirst({ where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA } })) ??
    (await db.template.create({
      data: { name: NOME_DO_TEMPLATE_DE_ASSINATURA, type: 'STORY', dimensions: '1080x1920', designData: {}, projectId, createdBy: projeto.userId, tags: [TAG_DA_ASSINATURA], category: 'assinatura' },
    }))

  for (const [i, p] of paginas.entries()) {
    const dims = DIMENSOES[p.formato]
    const existente = await db.page.findFirst({ where: { templateId: template.id, isTemplate: true, tags: { has: TAG_DA_ASSINATURA }, name: p.nome } })
    const data = { name: p.nome, width: dims.width, height: dims.height, layers: JSON.stringify(p.camadas), background: kit.fundo, isTemplate: true, tags: [TAG_DA_ASSINATURA, p.formato], order: i }
    const page = existente
      ? await db.page.update({ where: { id: existente.id }, data })
      : await db.page.create({ data: { ...data, templateId: template.id } })
    console.log(`  ${existente ? 'atualizada' : 'criada'}: ${page.name} (${page.id})`)
  }

  await db.project.update({ where: { id: projectId }, data: { assinatura: kit.numeros as never } })
  console.log('Project.assinatura gravado.')
  console.log(`Editor: ${process.env.NEXT_PUBLIC_APP_URL ?? ''}/templates/${template.id}/editor`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
