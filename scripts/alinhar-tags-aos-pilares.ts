/**
 * Põe o SLUG DO PILAR nas tags dos modelos que descreviam o tema com palavra
 * própria (16/08/2026).
 *
 * `scripts/taguear-modelos-sem-tema.ts` deu tema aos modelos lendo a copy de
 * cada arte — e produziu vocabulário próprio (`almoco`, `ribs`,
 * `prato-do-dia`). Os pilares aprovados de cada cliente são a taxonomia
 * oficial, então os dois vocabulários ficaram divergindo: pedir o pilar
 * "Cardápio Rock" não achava a arte de ribs.
 *
 * ACRESCENTA, nunca substitui. Alinhar não é empobrecer: `ribs` e `barbecue`
 * continuam, porque alguém vai pedir "o story de ribs" e `prepareCreative`
 * casa por `includes` — as duas portas passam a levar à mesma arte.
 *
 * 🔴 Os 6 "Story base (3 layouts)" (TERO e Wine Vix) ficam DE FORA de
 * propósito. Eles são CURINGA da semana (`escolherModeloDoDia`), genéricos por
 * desenho; dar tema a eles os prenderia a um assunto — exatamente o erro que a
 * tag `quinta` cometia e que acabou de ser desfeito.
 *
 * O mapa é declarado item a item, com a copy que o justifica. Nada é inferido
 * por semelhança de string. Precedente: `scripts/corrigir-crivo-importado.ts`.
 *
 *   npx tsx scripts/alinhar-tags-aos-pilares.ts              # dry-run
 *   npx tsx scripts/alinhar-tags-aos-pilares.ts --confirmar
 *   npx tsx scripts/alinhar-tags-aos-pilares.ts --desfazer
 */
import { db } from '@/lib/db'

type Alinhamento = {
  pageId: string
  cliente: string
  pagina: string
  /** O que a arte diz — a evidência. */
  copy: string
  /** Slug do pilar APROVADO deste cliente. */
  pilar: string
  porque: string
}

const ALINHAR: Alinhamento[] = [
  {
    pageId: 'cmgi4drbk0001jp04jdk5t30p',
    cliente: 'Real Gelateria',
    pagina: 'Página 2',
    copy: '"Quarta do Crepe!" / "Na compra do primeiro, ganhe 50% off no segundo"',
    pilar: 'promocoes-e-eventos',
    porque: 'a peça é uma oferta com mecânica de desconto, não a apresentação do produto',
  },
  {
    pageId: 'cmhtfdnka0003sw4vw6vqfx44',
    cliente: 'Real Gelateria',
    pagina: 'Pag.05',
    copy: '"Pão de Quiejo" / "Quentinho" / "Aquele café delicioso para sua tarde de domingo"',
    pilar: 'pausas-e-aconchego',
    porque: 'café da tarde e aconchego — é o pilar da pausa, não o do sabor assinatura',
  },
  {
    pageId: 'cmlpbexrv003nl8040zd0kyuj',
    cliente: 'TERO',
    pagina: 'Pag.08',
    copy: '"Nhoque ao mar" / "Clássicos tero"',
    pilar: 'experiencias-gastronomicas',
    porque: 'prato assinatura da casa; não é o almoço executivo, que tem pilar próprio',
  },
  {
    pageId: 'cmksfi9ti000rkz04vcjwyatu',
    cliente: 'By Rock',
    pagina: 'Página 8',
    copy: '"Sabor No volume máximo" / "Ribs barbecue"',
    pilar: 'cardapio-rock',
    porque: 'prato do cardápio da casa',
  },
  {
    pageId: 'cmjcbziqj0001ji04s45as0vy',
    cliente: 'By Rock',
    pagina: 'Pag.02',
    copy: '"ALMOÇO" (modelo de sábado)',
    pilar: 'almoco-em-familia',
    porque: 'almoço de fim de semana; o executivo é de segunda a sexta e tem pilar próprio',
  },
  {
    pageId: 'cmhz1mkkt0001lg04btppiwqp',
    cliente: 'By Rock',
    pagina: 'Pag.09',
    copy: '"Seu almoço" / "de domingo"',
    pilar: 'almoco-em-familia',
    porque: 'almoço de domingo, mesma razão do anterior',
  },
  {
    pageId: 'cmsg9o2e20007swsumyp3bpkj',
    cliente: 'By Rock',
    pagina: 'Modelo reutilizável — agenda musical',
    copy: '"MÚSICA" / "AO VIVO" / "nesta semana" / grade de 4 artistas',
    pilar: 'shows-e-musica-ao-vivo',
    porque: 'a tag própria era `musica-ao-vivo` — o mesmo conceito com outro nome, que é o balde duplicado que os pilares vieram evitar',
  },
]

/**
 * Sem pilar correspondente no cliente. Ficam como estão — inventar encaixe
 * seria pior que a divergência, e a taxonomia é fechada por decisão da F2.
 */
const SEM_CORRESPONDENCIA = [
  'By Rock · "Delivery - Layout 2" (tag `delivery`) — não há pilar de delivery na taxonomia dele',
  'Wine Vix · "Página 1" (tag `promocao`) — a copy é genérica ("Promoção de exclusiva") e nenhum pilar cobre promoção',
  'O Quintal · "Pag.01" (tag `sobremesa`) — já tem `almoco-executivo`; o cliente não tem pilar de sobremesa',
  'TERO · "Pag.08" (tag `prato-do-dia`) — preservada ao lado do pilar novo',
]

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const desfazer = process.argv.includes('--desfazer')
  console.log(desfazer ? '=== DESFAZER ===' : confirmar ? '=== APLICANDO ===' : '=== DRY-RUN (use --confirmar) ===')

  // Guarda: o slug tem de ser um pilar APROVADO daquele cliente. Sem isto, um
  // erro de digitação vira tag órfã que nenhuma busca por pilar alcança.
  let mudados = 0
  for (const item of ALINHAR) {
    const page = await db.page.findUnique({
      where: { id: item.pageId },
      select: { id: true, name: true, tags: true, isTemplate: true, Template: { select: { projectId: true } } },
    })
    if (!page) {
      console.log(`\n!! ${item.cliente} · "${item.pagina}" — página não existe mais; pulando.`)
      continue
    }
    if (!page.isTemplate) {
      console.log(`\n!! ${item.cliente} · "${item.pagina}" — não é mais modelo; pulando.`)
      continue
    }
    const pilar = await db.contentPillar.findFirst({
      where: { projectId: page.Template.projectId, slug: item.pilar, aprovado: true },
      select: { slug: true, nome: true },
    })
    if (!pilar) {
      console.log(`\n!! ${item.cliente} · "${item.pagina}" — "${item.pilar}" não é pilar APROVADO deste cliente; pulando.`)
      continue
    }

    const atuais = page.tags ?? []
    const alvo = desfazer
      ? atuais.filter((t) => t.toLowerCase() !== item.pilar)
      : Array.from(new Set([...atuais, item.pilar]))
    const igual = alvo.length === atuais.length && alvo.every((t, i) => t === atuais[i])

    console.log(`\n${item.cliente} · "${page.name}"`)
    console.log(`   copy:   ${item.copy}`)
    console.log(`   pilar:  ${pilar.slug}  ("${pilar.nome}") — ${item.porque}`)
    console.log(`   antes:  [${atuais.join(', ') || '—'}]`)
    console.log(`   depois: [${alvo.join(', ') || '—'}]${igual ? '  (sem mudança)' : ''}`)

    if (igual || !(confirmar || desfazer)) continue
    await db.page.update({ where: { id: page.id }, data: { tags: alvo } })
    mudados++
  }

  console.log('\n── sem pilar correspondente (mantidos como estão) ──')
  for (const s of SEM_CORRESPONDENCIA) console.log(`   · ${s}`)

  console.log(
    `\n${confirmar || desfazer ? `${mudados} modelo(s) atualizado(s).` : 'Nada foi gravado (dry-run).'}`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
