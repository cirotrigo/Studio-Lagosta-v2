/**
 * Variantes de assinatura do Espeto Gaúcho (projeto 6, template "Assinatura" 389).
 *
 *   npx tsx scripts/criar-variantes-assinatura-espeto.ts              # dry-run
 *   npx tsx scripts/criar-variantes-assinatura-espeto.ts --confirmar  # grava (cria ou ATUALIZA pelo nome)
 *
 * Criadas em 04/09/2026 depois de o Ciro comparar a semana 1 (canvas, 3
 * arranjos + peça de promoção com preço) com a semana 2 (compositor, tudo no
 * mesmo arranjo). Cada variante é uma PÁGINA clonada da "Assinatura — story"
 * que ele ajustou em 03/09 — halo, sombra e tracking vêm de lá — mudando só o
 * que o arranjo pede:
 *   - Promoção: pre + headline (+ headline2 VERMELHA) no topo; no rodapé o
 *     `apoio` vira a DESCRIÇÃO (Barlow Condensed 38, branco) e o `servico`
 *     vira o PREÇO (Bevan 62, amarelo). A copy dessa variante põe o preço no
 *     servico, nunca "a partir das 17h" ali.
 *   - Rodapé: bloco único embaixo, logo no topo.
 *   - Topo: bloco único em cima, logo no rodapé.
 * O compositor escolhe pela mensagem (tags) e roda entre as de arranjo.
 * ⚠️ Rodar de novo SOBRESCREVE as três páginas pelo nome — ajustes feitos no
 * editor nelas se perdem. Ajuste fino é no editor, não aqui.
 */
import 'dotenv/config'
import { db } from '@/lib/db'
const ORIGEM = 'cmtkwor2i000jswfo39u5dwet'
const TEMPLATE = 389
const VERMELHO = '#F4301A', AMARELO = '#FDC700', BRANCO = '#FFFFFF'
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function ler(layers: any): any[] { let l = layers; try { l = JSON.parse(l); if (typeof l === 'string') l = JSON.parse(l) } catch {} return l }
function porId(camadas: any[], id: string) { const c = camadas.find((l) => l.id === id); if (!c) throw new Error('camada ' + id); return c }

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const projeto = await db.project.findUnique({ where: { id: 6 }, select: { userId: true, CustomFont: { select: { fontFamily: true } } } })
  const fontes = new Set(projeto!.CustomFont.map((f) => f.fontFamily))
  const barlow = fontes.has('Barlow Condensed') ? 'Barlow Condensed' : 'Barlow Condensed SemiBold'
  console.log('fontes do projeto:', [...fontes].filter((f) => /Barlow|Bevan|Caveat/.test(f)).join(', '), '| descrição em', barlow)
  const origem = await db.page.findUnique({ where: { id: ORIGEM }, select: { layers: true, background: true, width: true, height: true } })
  const base = ler(origem!.layers)

  const grupoTopo = 'grupo-topo-' + Math.random().toString(36).slice(2, 10)
  const grupoRodape = 'grupo-rodape-' + Math.random().toString(36).slice(2, 10)

  function empilhar(camadas: any[], yInicio: number, gap = 12) {
    let y = yInicio
    for (const c of camadas) { c.position.y = y; y += c.size.height + gap }
    return y
  }
  function headline2De(headline: any) {
    const h2 = clone(headline)
    h2.id = 'headline2'; h2.name = 'headline2'; h2.content = 'EM VERMELHO'; h2.style.color = VERMELHO
    h2.size.height = 80
    return h2
  }
  function ordenar(camadas: any[]) { camadas.forEach((c, i) => { c.order = i }); return camadas }

  // ── A. Promoção: badge + manchete (2ª linha vermelha) no topo; descrição, PREÇO e assinatura no rodapé
  const promo = (() => {
    const pre = clone(porId(base, 'pre')), headline = clone(porId(base, 'headline')), apoio = clone(porId(base, 'apoio')), cta = clone(porId(base, 'cta')), servico = clone(porId(base, 'servico')), logo = clone(porId(base, 'logo'))
    headline.content = 'COSTELA\nNO BAFO'; headline.size.height = 80
    const h2 = headline2De(headline); h2.content = 'NO BAFO'
    for (const c of [pre, headline, h2]) c.metadata = { groupId: grupoTopo }
    empilhar([pre, headline, h2], 175, 8)
    // apoio vira a DESCRIÇÃO (Barlow branco, como a semana 1); servico vira o PREÇO (Bevan amarelo)
    apoio.style = { ...apoio.style, fontFamily: barlow, fontSize: 38, lineHeight: 1.12, color: BRANCO, letterSpacing: 0 }
    apoio.textboxConfig = { ...apoio.textboxConfig, autoWrap: { ...apoio.textboxConfig.autoWrap, lineHeight: 1.12 } }
    apoio.content = '1kg com creme de aipim, farofa\ne vinagrete · a partir das 17h'; apoio.size = { width: 896, height: 88 }
    servico.style = { ...servico.style, fontFamily: 'Bevan', fontSize: 62, lineHeight: 1.0, color: AMARELO, letterSpacing: 0, textTransform: 'none' }
    servico.textboxConfig = { ...servico.textboxConfig, autoWrap: { ...servico.textboxConfig.autoWrap, lineHeight: 1.0 } }
    servico.content = 'R$ 104,90'; servico.size = { width: 751, height: 70 }
    cta.content = 'Vem se servir!'; cta.size = { width: 751, height: 74 }
    for (const c of [apoio, servico, cta]) c.metadata = { groupId: grupoRodape }
    const fim = empilhar([apoio, servico, cta], 1804 - (88 + 70 + 74 + 2 * 12), 12)
    logo.position = { x: 843, y: 1804 - 160 }
    return { nome: 'Promoção — story', tags: ['assinatura', 'story', 'promocao', 'promo', 'oferta', 'preco', 'rodizio', 'marmitex'], camadas: ordenar([pre, headline, h2, apoio, servico, cta, logo]), fim }
  })()

  // ── B. Rodapé: bloco único embaixo, foto livre em cima; manchete com 2ª linha vermelha
  const rodape = (() => {
    const pre = clone(porId(base, 'pre')), headline = clone(porId(base, 'headline')), apoio = clone(porId(base, 'apoio')), cta = clone(porId(base, 'cta')), servico = clone(porId(base, 'servico')), logo = clone(porId(base, 'logo'))
    headline.content = 'CASA CHEIA\nTODO DIA'; headline.size.height = 80
    const h2 = headline2De(headline); h2.content = 'TODO DIA'
    apoio.content = 'a mesa tá posta, tchê'; apoio.size.height = 62
    servico.content = 'SEG A QUI · DAS 16H À MEIA-NOITE'
    const bloco = [pre, headline, h2, apoio, cta, servico]
    for (const c of bloco) c.metadata = { groupId: grupoRodape }
    const altura = bloco.reduce((s, c) => s + c.size.height, 0) + 10 * (bloco.length - 1)
    empilhar(bloco, 1804 - altura, 10)
    logo.position = { x: 843, y: 175 }
    return { nome: 'Rodapé — story', tags: ['assinatura', 'story', 'rodape'], camadas: ordenar([pre, headline, h2, apoio, cta, servico, logo]) }
  })()

  // ── C. Topo: bloco único em cima, foto livre embaixo; logo no rodapé
  const topo = (() => {
    const pre = clone(porId(base, 'pre')), headline = clone(porId(base, 'headline')), apoio = clone(porId(base, 'apoio')), cta = clone(porId(base, 'cta')), servico = clone(porId(base, 'servico')), logo = clone(porId(base, 'logo'))
    headline.content = 'CHOPP GELADO\nE PAPO SOLTO'; headline.size.height = 80
    const h2 = headline2De(headline); h2.content = 'E PAPO SOLTO'
    apoio.content = 'sexta à noite pede resenha'; apoio.size.height = 62
    servico.content = 'SEX · DAS 10H À MEIA-NOITE'
    const bloco = [pre, headline, h2, apoio, cta, servico]
    for (const c of bloco) c.metadata = { groupId: grupoTopo }
    empilhar(bloco, 175, 10)
    logo.position = { x: 843, y: 1804 - 160 }
    return { nome: 'Topo — story', tags: ['assinatura', 'story', 'topo'], camadas: ordenar([pre, headline, h2, apoio, cta, servico, logo]) }
  })()

  for (const p of [promo, rodape, topo]) {
    console.log('==', p.nome, p.tags.join(','))
    for (const c of p.camadas) console.log('  ', c.id, c.position.y, c.size.height, c.style?.fontFamily ?? '', c.style?.fontSize ?? '', c.style?.color ?? '', c.metadata?.groupId?.slice(0, 12) ?? '')
  }
  if (!confirmar) { console.log('dry-run'); await db.$disconnect(); return }
  const existentes = await db.page.count({ where: { templateId: TEMPLATE } })
  for (const [i, p] of [promo, rodape, topo].entries()) {
    const ja = await db.page.findFirst({ where: { templateId: TEMPLATE, name: p.nome } })
    const data = { name: p.nome, width: 1080, height: 1920, layers: JSON.stringify(p.camadas), background: origem!.background, isTemplate: true, tags: p.tags, order: existentes + i }
    const page = ja ? await db.page.update({ where: { id: ja.id }, data }) : await db.page.create({ data: { ...data, templateId: TEMPLATE } })
    console.log(ja ? 'atualizada' : 'criada', page.id, page.name)
  }
  await db.$disconnect()
}
main().catch((e) => { console.error('ERRO', e); process.exit(1) })
