/**
 * Cria (ou atualiza) a PÁGINA DE ASSINATURA de um projeto — o kit que o
 * compositor lê (§8 do plano editor-como-usina).
 *
 *   npx tsx scripts/criar-pagina-de-assinatura.ts --projeto 8            # dry-run
 *   npx tsx scripts/criar-pagina-de-assinatura.ts --projeto 8 --confirmar
 *   npx tsx scripts/criar-pagina-de-assinatura.ts --todos --confirmar      # todo projeto com kit
 *
 * Template "Assinatura" com uma página por formato (story e feed), tag
 * `assinatura`, camadas de texto chamadas pelo PAPEL (pre, headline, apoio,
 * cta, servico) com o estilo da marca, e a logo com a largura da assinatura.
 * A posição das camadas é ilustrativa: o compositor lê o ESTILO e compõe a
 * posição pela foto. Os NÚMEROS (margens, safe area, faixa do halo) vão em
 * `Project.assinatura`.
 *
 * O kit de cada projeto está em `scripts/lib/kits-de-assinatura.ts` — LIDO do
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
import { NOME_DO_TEMPLATE_DE_ASSINATURA, TAG_DA_ASSINATURA } from '@/lib/compositor/assinatura'
import { KITS_DE_ASSINATURA, type KitDeAssinatura, type PapelDoKit } from './lib/kits-de-assinatura'
import { DIMENSOES, type Formato } from '@/lib/compositor/spec'

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
      textAlign: k.align ?? 'left',
    },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: k.lineHeight } },
    effects: {
      shadow: { enabled: k.sombra !== false, shadowColor: mancha, shadowBlur: 10, shadowOffsetX: 0, shadowOffsetY: 1, shadowOpacity: 0.65 },
      ...(k.fundo
        ? { background: { enabled: true, backgroundColor: k.fundo.cor, baseColor: k.fundo.cor, tone: 0, fit: k.fundo.fit, opacity: k.fundo.opacidade, padding: k.fundo.padding, blur: k.fundo.blur, borderRadius: k.fundo.raio ?? (k.fundo.fit === 'texto' ? 60 : 0), offsetX: 0, offsetY: 0 } }
        : {}),
    },
  }
}

async function main() {
  const args = process.argv.slice(2)
  const confirmar = args.includes('--confirmar')
  const i = args.indexOf('--projeto')
  const ids = args.includes('--todos')
    ? Object.keys(KITS_DE_ASSINATURA).map(Number)
    : [i >= 0 ? Number(args[i + 1]) : NaN]
  if (ids.some((id) => !Number.isFinite(id))) throw new Error('use --projeto <id> ou --todos')
  for (const projectId of ids) {
    await criarAssinatura(projectId, confirmar)
    console.log('')
  }
}

async function criarAssinatura(projectId: number, confirmar: boolean) {
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
      // Montserrat vem embutida no render (CanvasRenderer registra 8 pesos).
      if (!fontes.has(k.fontFamily) && !/^Montserrat/.test(k.fontFamily)) throw new Error(`fonte "${k.fontFamily}" não está cadastrada no projeto ${projectId}`)
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
