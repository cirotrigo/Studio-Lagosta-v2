/**
 * Creates 21 DRAFT posts for TERO week 07-13 April 2026
 * Template 148: TERO — Semana Temática
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

interface StoryDef {
  day: string
  date: string
  time: string // BRT
  pageId: string
  driveImageId: string
  caption: string
  slotValues: Record<string, string>
}

// Page IDs from template 148
const PAGES = {
  rwAlmoco: 'cmniayvjj0001swrlg7vmjo94',
  rwJantar: 'cmniayvrk0003swrl9rtpeagv',
  executivo: 'cmniayvvk0005swrlbke0bcy1',
  happyWine: 'cmniayvzm0007swrls80bqym8',
  classicos: 'cmniayw3m0009swrl8haa0986',
  parrilla: 'cmniayw7o000bswrlvzlrzcla',
  domingo: 'cmniaywbp000dswrlxzznvi27',
}

const stories: StoryDef[] = [
  // === SEGUNDA 07/04 ===
  {
    day: 'Seg', date: '2026-04-07', time: '18:33',
    pageId: PAGES.rwJantar,
    driveImageId: '174xg29vef6zRTPuHNlW4cx-yjk_4ObKW',
    caption: 'A final de 2022 começa na entrada. Empanada Salteña com recheio generoso de carne, azeitonas, ovo caipira e batata cozida — selada na brasa e servida com chimichurri caseiro. 🇦🇷🔥 Jantar Restaurant Week R$115. Até 26 de abril. #Tero #RestaurantWeek #EmpanadaSalteña #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'A EMPANADA QUE ABRIU', 'Titulo': 'A FINAL', 'Subtitulo': 'Carne, azeitonas e ovo caipira com chimichurri da parrilla', 'Rodape-1': 'Restaurant Week — Jantar R$115', 'CTA': 'Reserve sua mesa' },
  },
  {
    day: 'Seg', date: '2026-04-07', time: '19:27',
    pageId: PAGES.domingo,
    driveImageId: '1NagYBQVVFWmkGz2gNWSA1fBL2YuOV6bz',
    caption: 'Tem semana que pede um recomeço diferente. Mesa posta, taça de vinho, brasa acesa. O Tero te espera das 18h30. ✨🍷 #Tero #SegundaNoTero #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'SEGUNDA À NOITE', 'Titulo': 'TEM ESSE SILÊNCIO BOM', 'Subtitulo': 'Velas, vinho e o som da brasa ao fundo', 'Rodape-1': 'Segunda 18h30 às 23h30', 'CTA': 'Venha nos visitar' },
  },
  {
    day: 'Seg', date: '2026-04-07', time: '20:41',
    pageId: PAGES.rwJantar,
    driveImageId: '18PK3Xuw2RirgalgmH7J5KYs1pvVUVof2',
    caption: 'Copa 2022, entrada da França: croissant artesanal recheado com salmão e alho-poró. Crocante por fora, cremoso por dentro. 🇫🇷🥐 Restaurant Week Tero — jantar R$115. #Tero #RestaurantWeek #CroissantSalmao #GastronomiaFrancesa #Vitoria',
    slotValues: { 'Pre-titulo': 'A FRANÇA TROUXE', 'Titulo': 'O CROISSANT', 'Subtitulo': 'Recheado com salmão e alho-poró — a entrada que vale ouro', 'Rodape-1': 'Restaurant Week — Jantar R$115', 'CTA': 'Faça sua reserva' },
  },

  // === TERÇA 08/04 ===
  {
    day: 'Ter', date: '2026-04-08', time: '10:33',
    pageId: PAGES.rwAlmoco,
    driveImageId: '14moa1BLm2swcd_qeh80L_G-pihN4ShLB',
    caption: 'Final de 1994, segundo tempo: cubos de cupim prensado com polenta sobre caldo de carne e molho de queijo. O Brasil no prato. 🇧🇷⚽ Almoço Restaurant Week R$95. #Tero #RestaurantWeek #CupimPresado #CulinariaBrasileira #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'O BRASIL JOGA COM', 'Titulo': 'CUPIM PRENSADO', 'Subtitulo': 'Polenta, caldo de carne e molho de queijo — final de 94', 'Rodape-1': 'Restaurant Week — Almoço R$95', 'CTA': 'Venha provar' },
  },
  {
    day: 'Ter', date: '2026-04-08', time: '12:07',
    pageId: PAGES.executivo,
    driveImageId: '1rFZr3eaoecD6L9lhEwRKoTQTEQfpbXjW',
    caption: 'Terça-feira combina com um almoço que respeita o seu ritmo. Ancho com manteiga de chimichurri e dois acompanhamentos do nosso cardápio executivo. 🥩🌿 #Tero #AlmocoExecutivo #Ancho #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'ALMOÇO DO SEU JEITO', 'Titulo': 'ANCHO COM CHIMICHURRI', 'Subtitulo': 'Manteiga de ervas, dois acompanhamentos à sua escolha', 'Rodape-1': 'Executivo — Terça a Sábado', 'CTA': 'Venha almoçar' },
  },
  {
    day: 'Ter', date: '2026-04-08', time: '17:13',
    pageId: PAGES.happyWine,
    driveImageId: '1FaPEjWNza8lLkShqkd4QQEle92FsZzmH',
    caption: 'Happy Wine no Tero: vinhos e espumantes à vontade por R$79,90. De terça a sexta, das 16h às 20h. Aos sábados, das 12h às 16h. A melhor desculpa pra sair mais cedo. 🍷✨ #Tero #HappyWine #VinhoAVontade #PraiaDoCanto #Vitoria',
    slotValues: { 'Pre-titulo': 'TERÇA PEDE', 'Titulo': 'VINHO À VONTADE', 'Subtitulo': 'Vinhos e espumantes — R$79,90 por pessoa', 'Rodape-1': 'Terça a Sexta 16h-20h | Sábado 12h-16h', 'CTA': 'Reserve agora' },
  },

  // === QUARTA 09/04 ===
  {
    day: 'Qua', date: '2026-04-09', time: '10:41',
    pageId: PAGES.rwAlmoco,
    driveImageId: '1n_ZPmgzwTf13B25abiTBxKckf6hTwcQF',
    caption: 'Final de 94, segundo tempo da Itália: Linguini à Carbonara Tero. Barriga suína, parmesão e gema servida na casca do ovo. Classe pura. 🇮🇹🍝 Almoço RW R$95. #Tero #RestaurantWeek #Carbonara #CulinariaItaliana #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'A ITÁLIA RESPONDEU', 'Titulo': 'COM CARBONARA', 'Subtitulo': 'Linguini com barriga suína, parmesão e gema na casca', 'Rodape-1': 'Restaurant Week — Almoço R$95', 'CTA': 'Experimente' },
  },
  {
    day: 'Qua', date: '2026-04-09', time: '12:23',
    pageId: PAGES.classicos,
    driveImageId: '10zoPNEpOZeWT9C0eYZPilRMWsP-onRIF',
    caption: 'Nhoque ao Mar: camarões e polvo sobre nhoques tostados. Um clássico Tero que fala por si. 🦐🐙 #Tero #NhoqueAoMar #ClassicoTero #Gastronomia #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'CAMARÕES E POLVO', 'Titulo': 'SOBRE NHOQUES TOSTADOS', 'Subtitulo': 'O clássico Tero que não precisa de apresentação', 'Rodape-1': 'Clássicos Tero', 'CTA': 'Reserve sua mesa' },
  },
  {
    day: 'Qua', date: '2026-04-09', time: '17:47',
    pageId: PAGES.rwAlmoco,
    driveImageId: '1fJJgNzLCJL8ORjE3WC04Wk2408GDSBG8',
    caption: '⏳ Restam duas semanas de Restaurant Week no Tero. Quatro seleções inspiradas nas grandes finais de Copa: Brasil, Itália, Argentina e França. Almoço R$95, jantar R$115. Até 26 de abril. #Tero #RestaurantWeek #UltimasSemanas #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'DUAS SEMANAS', 'Titulo': 'QUATRO SELEÇÕES', 'Subtitulo': 'Uma experiência que não se repete — até 26 de abril', 'Rodape-1': 'Almoço R$95 | Jantar R$115', 'CTA': 'Garanta sua mesa' },
  },

  // === QUINTA 10/04 ===
  {
    day: 'Qui', date: '2026-04-10', time: '10:22',
    pageId: PAGES.executivo,
    driveImageId: '1TlzGaby85_NF_aenzzAwUf19mLK55deM',
    caption: 'Quinta-feira pede leveza. Salmão braseado com dois acompanhamentos do nosso executivo. 🐟🔥 #Tero #AlmocoExecutivo #SalmãoBraseado #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'LEVE E SABOROSO', 'Titulo': 'SALMÃO BRASEADO', 'Subtitulo': 'No ponto, com dois acompanhamentos à sua escolha', 'Rodape-1': 'Executivo — Terça a Sábado', 'CTA': 'Venha almoçar' },
  },
  {
    day: 'Qui', date: '2026-04-10', time: '18:07',
    pageId: PAGES.rwJantar,
    driveImageId: '1LEIG7SkC4ideXibUKNGWte7SZJu7hSSv',
    caption: 'Copa 2022, prato principal da Argentina: Chorizo na Parrilla com batatas na brasa, mix de legumes grelhados e chimichurri caseiro. A brasa no seu melhor. 🇦🇷🔥 Jantar RW R$115. #Tero #RestaurantWeek #ChorizoNaParrilla #Parrilla #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'CHORIZO NA PARRILLA', 'Titulo': 'A ARGENTINA SABE', 'Subtitulo': 'Batatas na brasa, legumes grelhados e chimichurri caseiro', 'Rodape-1': 'Restaurant Week — Jantar R$115', 'CTA': 'Faça sua reserva' },
  },
  {
    day: 'Qui', date: '2026-04-10', time: '20:15',
    pageId: PAGES.classicos,
    driveImageId: '1W4DQtpybO0yYBewoPyr5dGW3MkNgPK88',
    caption: 'Siciliano Brûlée: limão siciliano caramelizado sobre crumble de chocolate e flor comestível. O ponto final perfeito. 🍋🔥 #Tero #Sobremesa #SicilianoBrulee #Gastronomia #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'LIMÃO SICILIANO', 'Titulo': 'CARAMELIZADO', 'Subtitulo': 'Sobre crumble de chocolate — a sobremesa que encerra com classe', 'Rodape-1': 'Sobremesas Tero', 'CTA': 'Experimente' },
  },

  // === SEXTA 11/04 ===
  {
    day: 'Sex', date: '2026-04-11', time: '10:37',
    pageId: PAGES.rwAlmoco,
    driveImageId: '1LpI5g7Cp-5AH960SGvBhjl4hfMaHYqve',
    caption: 'Primeiro tempo da Itália na Restaurant Week: Carpaccio artesanal com parmesão, pesto de manjericão e farofa de nozes. Elegância italiana no Tero. 🇮🇹✨ Almoço RW R$95. #Tero #RestaurantWeek #Carpaccio #CulinariaItaliana #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'A ITÁLIA ABRE', 'Titulo': 'COM ELEGÂNCIA', 'Subtitulo': 'Carpaccio com parmesão, pesto e farofa de nozes', 'Rodape-1': 'Restaurant Week — Almoço R$95', 'CTA': 'Venha provar' },
  },
  {
    day: 'Sex', date: '2026-04-11', time: '16:23',
    pageId: PAGES.happyWine,
    driveImageId: '1pjLlDM9jHXary5LAjyS_1eLaEV65mBxw',
    caption: 'Sextou no Tero! Happy Wine: vinhos e espumantes à vontade por R$79,90. Das 16h às 20h. O brinde que sua sexta merecia. 🍷🥂 #Tero #HappyWine #Sextou #VinhoAVontade #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'SEXTA, 16H', 'Titulo': 'VOCÊ MERECE', 'Subtitulo': 'Vinhos e espumantes à vontade — R$79,90', 'Rodape-1': 'Happy Wine até 20h', 'CTA': 'Chame os amigos' },
  },
  {
    day: 'Sex', date: '2026-04-11', time: '19:41',
    pageId: PAGES.rwJantar,
    driveImageId: '1fJJgNzLCJL8ORjE3WC04Wk2408GDSBG8',
    caption: 'Copa 2022, prato principal da França: Entrecôte au Poivre com batatas fritas finas e crocantes. A França joga sério. E o Tero também. 🇫🇷🥩 Jantar RW R$115. #Tero #RestaurantWeek #EntrecoteAuPoivre #GastronomiaFrancesa #Vitoria',
    slotValues: { 'Pre-titulo': 'A FRANÇA NÃO VEIO', 'Titulo': 'PRA BRINCADEIRA', 'Subtitulo': 'Entrecôte au Poivre com fritas finas e crocantes', 'Rodape-1': 'Restaurant Week — Jantar R$115', 'CTA': 'Reserve agora' },
  },

  // === SÁBADO 12/04 ===
  {
    day: 'Sáb', date: '2026-04-12', time: '10:47',
    pageId: PAGES.rwAlmoco,
    driveImageId: '1kU2QBA40tx1Re4_uYL9Pct8ZnVSmEKzm',
    caption: '🇧🇷🇮🇹🇦🇷🇫🇷 Restaurant Week Tero: quatro seleções inspiradas nas grandes finais de Copa. Almoço (R$95): Brasil x Itália. Jantar (R$115): Argentina x França. Sábado é dia de viver as duas. Até 26/04. #Tero #RestaurantWeek #4Selecoes #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'QUATRO SELEÇÕES', 'Titulo': 'UMA EXPERIÊNCIA', 'Subtitulo': 'Brasil, Itália, Argentina e França — no almoço e no jantar', 'Rodape-1': 'Almoço R$95 | Jantar R$115', 'CTA': 'Garanta sua mesa' },
  },
  {
    day: 'Sáb', date: '2026-04-12', time: '13:11',
    pageId: PAGES.parrilla,
    driveImageId: '1_2T-GcaQcggFaA-1sCsPUpPx2VQ4cSrt',
    caption: 'Sábado pede parrilla. Ancho Angus na brasa, servido para dois. A experiência Tero no seu melhor. 🥩🔥 #Tero #Parrilla #AnchoAngus #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': '400G DE ANCHO', 'Titulo': 'ANGUS NA PARRILLA', 'Subtitulo': 'Serve dois, marca pra sempre', 'Rodape-1': 'Parrilla Tero — serve 2 pessoas', 'CTA': 'Reserve sua mesa' },
  },
  {
    day: 'Sáb', date: '2026-04-12', time: '17:33',
    pageId: PAGES.classicos,
    driveImageId: '1ZuROQRlROhR3TSYLBq5g5CGDi8Q0uXS7',
    caption: 'A prorrogação da Restaurant Week tem 4 opções: 🇧🇷 Brigadeiro no ponto de colher 🇮🇹 Velluto de limão siciliano 🇦🇷 Flan de dulce de leche 🇫🇷 Pêra ao vinho branco. Qual é a sua? #Tero #RestaurantWeek #Sobremesas #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'QUAL PRORROGAÇÃO', 'Titulo': 'VOCÊ ESCOLHE?', 'Subtitulo': 'Brigadeiro, Flan, Velluto ou Pêra ao Vinho', 'Rodape-1': 'Restaurant Week — Sobremesas inclusas', 'CTA': 'Venha decidir' },
  },

  // === DOMINGO 13/04 ===
  {
    day: 'Dom', date: '2026-04-13', time: '10:07',
    pageId: PAGES.domingo,
    driveImageId: '150GRdrnauPC6htboyT1EwsaRpuZPqZ9c',
    caption: 'Domingo no Tero: mesa grande, família reunida e um almoço de Restaurant Week. Escolha seu lado: 🇧🇷 Coxinha + Cupim + Brigadeiro ou 🇮🇹 Carpaccio + Carbonara + Velluto. Almoço R$95. Até 26/04. #Tero #RestaurantWeek #DomingoEmFamilia #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'DOMINGO É DIA', 'Titulo': 'DE MESA GRANDE', 'Subtitulo': 'Brasil ou Itália — o almoço em família que vira final', 'Rodape-1': 'Restaurant Week — Almoço R$95', 'CTA': 'Traga quem você ama' },
  },
  {
    day: 'Dom', date: '2026-04-13', time: '11:33',
    pageId: PAGES.domingo,
    driveImageId: '1lFs2ajO6y6oIJ3RTCR3X3qu2wX4M38b6',
    caption: 'Domingo no Tero: ambiente acolhedor, sol na varanda e aquele almoço que pede calma. Brasa, vinho e boas conversas. Das 11h30 às 16h. ☀️🍷 #Tero #DomingoNoTero #Brunch #BrasaEVinho #PraiaDoCanto',
    slotValues: { 'Pre-titulo': 'O SOL ENTRA', 'Titulo': 'PELA VARANDA', 'Subtitulo': 'Vinho na mesa, salmão na brasa — domingo é sobre desacelerar', 'Rodape-1': 'Domingos 11h30 às 16h', 'CTA': 'Venha nos visitar' },
  },
  {
    day: 'Dom', date: '2026-04-13', time: '13:15',
    pageId: PAGES.rwAlmoco,
    driveImageId: '1GuPXYxyy8tnsF0cJvxlx8CRMD7Eu3_Go',
    caption: '⏳ A contagem regressiva começou. Restaurant Week Tero: quatro menus exclusivos inspirados nas grandes finais de Copa. Almoço R$95, jantar R$115. Até 26 de abril — não deixe pra última hora. #Tero #RestaurantWeek #UltimaSemana #BrasaEVinho #PraiaDoCanto #Vitoria',
    slotValues: { 'Pre-titulo': 'DEPOIS DE HOJE', 'Titulo': 'SÓ MAIS 13 DIAS', 'Subtitulo': 'Quem não provou ainda — é agora ou nunca', 'Rodape-1': 'Restaurant Week até 26 de abril', 'CTA': 'Reserve agora' },
  },
]

async function main() {
  const projectId = 3
  const templateId = 148

  // Get userId from project
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } })
  if (!project) throw new Error('Project not found')

  console.log(`Creating ${stories.length} DRAFT posts for TERO...\n`)

  const postIds: string[] = []

  for (let i = 0; i < stories.length; i++) {
    const s = stories[i]
    const sv: Record<string, unknown> = { ...s.slotValues, _driveImageId: s.driveImageId }

    // Parse BRT time to UTC (add 3h)
    const [hh, mm] = s.time.split(':').map(Number)
    const utcHH = String(hh + 3).padStart(2, '0')
    const scheduledDatetime = new Date(`${s.date}T${utcHH}:${String(mm).padStart(2, '0')}:00.000Z`)

    const post = await prisma.socialPost.create({
      data: {
        projectId,
        userId: project.userId,
        postType: 'STORY',
        caption: s.caption,
        mediaUrls: [],
        scheduleType: 'SCHEDULED',
        scheduledDatetime,
        status: 'DRAFT',
        pageId: s.pageId,
        templateId,
        slotValues: sv as any,
        renderStatus: 'NOT_NEEDED',
      },
    })

    postIds.push(post.id)
    const label = `${s.slotValues['Pre-titulo']} ${s.slotValues['Titulo']}`
    console.log(`  [${i + 1}/${stories.length}] ${s.day} ${s.date} ${s.time} — ${label} → ${post.id}`)
  }

  console.log(`\n✓ ${postIds.length} posts created as DRAFT`)
  console.log(`\nPost IDs:\n${postIds.join('\n')}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
