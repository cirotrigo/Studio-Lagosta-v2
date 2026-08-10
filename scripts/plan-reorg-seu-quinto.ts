/**
 * plan-reorg-seu-quinto.ts
 *
 * Gera o MANIFESTO de reorganização do Drive do Seu Quinto a partir dos
 * metadados do _image-catalog.json. NÃO move nada — só planeja.
 *
 * O destino de cada arquivo sai de `menuItem` (para comida/bebida) ou de
 * `zona`/`tags`/pasta de origem (para ambiente, pessoas, programação e
 * campanha). O que não tiver sinal suficiente cai em `_a-classificar`.
 *
 * Uso:
 *   npx tsx scripts/plan-reorg-seu-quinto.ts --out /caminho/manifesto
 */

import { google } from 'googleapis'
import * as fs from 'fs'
import 'dotenv/config'

const CATALOG_FILE_ID = '1p1toWBs2-eQTp_hDEo7Jx6ukbbw8SaFB'

function getDrive() {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  c.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}

const IMAGES_FOLDER_ID = '1nfDJRMOQLjp7uqEyz4fOFBMcIjva_2Qs'

/** Lista os caminhos de todas as pastas da pasta de imagens. */
async function listarPastasDoDrive(parentId = IMAGES_FOLDER_ID, depth = 3, prefix = ''): Promise<string[]> {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 200,
  })
  const out: string[] = []
  for (const f of res.data.files ?? []) {
    const full = prefix ? `${prefix}/${f.name}` : f.name!
    out.push(full)
    if (depth > 1) out.push(...(await listarPastasDoDrive(f.id!, depth - 1, full)))
  }
  return out
}

// ─── Cardápio → grupo numerado ───────────────────────────────────────
const GRUPO_POR_ITEM: Record<string, string> = {}
const add = (grupo: string, itens: string[]) => itens.forEach((i) => (GRUPO_POR_ITEM[i.toLowerCase()] = grupo))

add('01_tira-gosto', [
  'Kieber', 'Torresmo Barra', 'Torresminho', 'Croquetes de costela',
  'Croquetes de carne seca e abóbora', 'Dadinho de porco com picles e missô',
  'Coração de galinha', 'Fígado com jiló', 'Bolinho de carne', 'Quiabo pipoca',
  'Jiló frito', 'Aipim, polenta ou batata frita',
])
add('02_sanduiches', ['Mignon com queijo', 'Coração'])
add('03_pasteis', ['Pastéis de queijo e de costela', 'de camarão e de polvo com panceta'])
add('04_pra-dividir', [
  'Mignon Caprichado', 'Eu Quero é Carne', 'Sol do Sertão', 'Trio da Roça',
  'Camarão frito', 'Três Porquinhos', 'Pasteleiro', 'Maré Mansa', 'Porco Raiz',
  'Frango de Respeito', 'Trio Parada Dura',
])
add('05_estufa-quente', ['Rabada com batata', 'Língua de boi', 'Moela'])
add('06_estufa-fria', ['Vinagrete de polvo', 'Tataki de mignon', 'Carne de Onça', 'Salada de boteco'])
add('07_caldinhos', ['Caldinho do dia'])
add('08_guarnicoes', ['Arroz', 'Farofa', 'Vinagrete'])
add('09_molhos', ['Alho, coentro e sriracha', 'Sweet chilli e barbecue'])
add('10_ultima-rodada', ['Doce em conserva'])
add('11_bebidas', ['Chopp Heineken', 'Chopp Amstel', 'Heineken', 'Amstel'])

// ─── Regras por pasta de origem ──────────────────────────────────────
function destinoPorOrigem(folder: string): string | null {
  const f = folder

  if (/^\d\d_/.test(f)) return f // já está na taxonomia nova

  if (f.startsWith('CAMPANHAS/COPA SEU QUINTO')) return '16_campanhas/copa'
  if (f === 'SAMBA DO CANTO/SAMBA DO CANTO - COPA') return '16_campanhas/copa'
  if (f.startsWith('CAMPANHAS/Semana Santa')) return '16_campanhas/semana-santa'
  if (f === 'CAMPANHAS/Carnaval') return '16_campanhas/carnaval'
  if (f === 'CAMPANHAS/Kings Day') return '16_campanhas/kings-day'
  if (f === 'CAMPANHAS/lagonitas') return '16_campanhas/lagonitas'
  if (f === 'PESSOAS/Dia dos Pais') return '16_campanhas/dia-dos-pais'

  if (f === 'MÚSICOS') return '15_musicos/_a-classificar'
  if (f === 'MÚSICOS/Duo aomar') return '15_musicos/duo-aomar'
  if (f === 'MÚSICOS/Lucas') return '15_musicos/lucas'
  if (f === 'MÚSICOS/OKÊ TRIO') return '15_musicos/oke-trio'

  if (f === 'HH') return '14_programacao/happy-hour'
  if (f === 'SAMBA DO CANTO') return '14_programacao/samba-do-canto'
  if (f === 'FEIJOADA COM SAMBA') return '14_programacao/feijoada'
  if (f.startsWith('ALMOÇO DE DOMINGO')) {
    const sub = f.split('/')[1]
    if (!sub) return '14_programacao/almoco-domingo/_a-classificar'
    const slug = sub.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
    return `14_programacao/almoco-domingo/${slug}`
  }

  if (f === 'IA') return '17_ia'
  if (f === 'DRINKS') return '11_bebidas/drinks'

  // AMBIENTE e PESSOAS: a pasta de origem já é a intenção do cliente. Só a
  // subdivisão (zona / tipo de grupo) sai do metadado — ver rotearOrigemForte.
  return null // AMBIENTE, PESSOAS, CARDÁPIO*, ESTUFA, Organizar — decide por metadado
}

/**
 * Subpastas de prato que já existem no Drive, indexadas por nome normalizado.
 * Serve para mandar o arquivo para `04_pra-dividir/Sol do Sertão` em vez de
 * largar na raiz do grupo — o esqueleto por prato o cliente já criou.
 */
const PASTA_DE_PRATO = new Map<string, string>()
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function registrarPastasDePrato(pastas: string[]) {
  for (const p of pastas) {
    const partes = p.split('/')
    if (partes.length !== 2) continue
    if (!/^\d\d_/.test(partes[0])) continue
    if (partes[1].startsWith('_')) continue
    PASTA_DE_PRATO.set(norm(partes[1]), p)
  }
}

/** Destino do prato: subpasta existente se houver, senão a raiz do grupo. */
function destinoDePrato(grupo: string, menuItem: string): string {
  const exata = PASTA_DE_PRATO.get(norm(menuItem))
  if (exata && exata.startsWith(grupo)) return exata
  // tenta casar pelo começo (ex.: "Pastéis de queijo e de costela" → "Pastéis")
  for (const [k, v] of PASTA_DE_PRATO) {
    if (!v.startsWith(grupo)) continue
    if (norm(menuItem).startsWith(k) || k.startsWith(norm(menuItem))) return v
  }
  return grupo
}

/**
 * Origem que manda no grupo, deixando só a subdivisão para o metadado.
 * Foto da pasta AMBIENTE continua sendo ambiente mesmo tendo gente no quadro.
 */
function rotearOrigemForte(img: any): { destino: string; motivo: string } | null {
  const tags: string[] = (img.tags ?? []).map((t: string) => t.toLowerCase())
  if (img.folder === 'AMBIENTE') {
    return { destino: `12_ambiente/${img.zona ?? '_a-classificar'}`, motivo: `AMBIENTE · zona: ${img.zona ?? 'sem zona'}` }
  }
  if (img.folder === 'PESSOAS') {
    if (tags.includes('equipe') || tags.includes('uniforme')) return { destino: '13_pessoas/equipe', motivo: 'PESSOAS · equipe' }
    if (tags.includes('familia') || tags.includes('crianca')) return { destino: '13_pessoas/familia', motivo: 'PESSOAS · família' }
    return { destino: '13_pessoas/turma', motivo: 'PESSOAS · turma' }
  }
  return null
}

function destinoPorMetadado(img: any): { destino: string; motivo: string } {
  const forte = rotearOrigemForte(img)
  if (forte) return forte

  const tags: string[] = (img.tags ?? []).map((t: string) => t.toLowerCase())
  const zona = img.zona ?? null
  const cat = img.menuCategory ?? null

  // 1) comida/bebida identificada no cardápio
  if (img.menuItem) {
    const g = GRUPO_POR_ITEM[String(img.menuItem).toLowerCase()]
    if (g) {
      const destino = g === '11_bebidas' ? '11_bebidas/chopp' : destinoDePrato(g, String(img.menuItem))
      return { destino, motivo: `menuItem: ${img.menuItem}` }
    }
  }

  // 2) estufa reconhecida pelas tags, mesmo sem menuItem exato
  if (tags.includes('rabada') || tags.includes('lingua-de-boi') || tags.includes('moela')) {
    return { destino: '05_estufa-quente/_a-classificar', motivo: 'tag de estufa quente' }
  }
  if (tags.includes('carne-de-onca') || tags.includes('vinagrete-de-polvo') || tags.includes('tataki')) {
    return { destino: '06_estufa-fria/_a-classificar', motivo: 'tag de estufa fria' }
  }
  if (tags.includes('estufa')) return { destino: '05_estufa-quente/_a-classificar', motivo: 'tag estufa' }

  // 3) bebida
  if (cat === 'BEBIDAS') {
    if (tags.includes('cachaca') || tags.includes('princesa-isabel')) return { destino: '11_bebidas/cachacas', motivo: 'bebida: cachaça' }
    if (tags.includes('drink') || tags.includes('caipirinha')) return { destino: '11_bebidas/drinks', motivo: 'bebida: drink' }
    if (tags.includes('longneck') || tags.includes('garrafa-long-neck')) return { destino: '11_bebidas/longneck', motivo: 'bebida: long neck' }
    if (tags.includes('chopp') || tags.includes('caneca') || tags.includes('caneca-canelada')) return { destino: '11_bebidas/chopp', motivo: 'bebida: chopp' }
    return { destino: '11_bebidas/_a-classificar', motivo: 'bebida sem subtipo' }
  }

  // 4) música
  if (cat === 'MUSICA' || tags.includes('musico')) return { destino: '15_musicos/_a-classificar', motivo: 'músico na cena' }

  // 5) pessoas em destaque
  if (tags.includes('equipe') || tags.includes('uniforme')) return { destino: '13_pessoas/equipe', motivo: 'equipe' }
  if (tags.includes('familia') || tags.includes('crianca')) return { destino: '13_pessoas/familia', motivo: 'família' }
  if (tags.includes('turma') || tags.includes('brinde') || img.clienteIdentificavel) {
    return { destino: '13_pessoas/turma', motivo: 'turma / clientes' }
  }

  // 6) ambiente por zona
  if (zona) return { destino: `12_ambiente/${zona}`, motivo: `zona: ${zona}` }
  if (cat === 'AMBIENTE') return { destino: '12_ambiente/_a-classificar', motivo: 'ambiente sem zona' }

  // 7) comida sem item identificado
  if (cat === 'PETISCOS_ENTRADAS') return { destino: '01_tira-gosto/_a-classificar', motivo: 'petisco não identificado' }
  if (cat === 'PRATOS_PRINCIPAIS') return { destino: '04_pra-dividir/_a-classificar', motivo: 'prato não identificado' }
  if (cat === 'SOBREMESAS') return { destino: '10_ultima-rodada/_a-classificar', motivo: 'sobremesa' }
  if (cat === 'SALADAS') return { destino: '06_estufa-fria/_a-classificar', motivo: 'salada' }

  return { destino: '_a-classificar', motivo: 'sem sinal suficiente' }
}

async function main() {
  const outDir = (process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null) ?? '.'
  const drive = getDrive()
  const cat: any = (await drive.files.get({ fileId: CATALOG_FILE_ID, alt: 'media' }, { responseType: 'json' })).data
  const ativos = cat.images.filter((i: any) => !i.ausenteNoDrive)

  // Aprende as subpastas de prato que o cliente já criou no esqueleto
  registrarPastasDePrato(await listarPastasDoDrive())
  console.log(`subpastas de prato reconhecidas: ${PASTA_DE_PRATO.size}`)

  const linhas: any[] = []
  for (const img of ativos) {
    const porOrigem = destinoPorOrigem(img.folder)
    let destino: string
    let motivo: string
    if (porOrigem) {
      destino = porOrigem
      motivo = 'regra de pasta de origem'
    } else {
      const r = destinoPorMetadado(img)
      destino = r.destino
      motivo = r.motivo
    }
    linhas.push({
      driveFileId: img.driveFileId,
      arquivo: img.fileName,
      de: img.folder,
      para: destino,
      move: img.folder !== destino,
      motivo,
      quality: img.quality ?? '',
      clienteIdentificavel: img.clienteIdentificavel ? 'sim' : '',
    })
  }

  const movem = linhas.filter((l) => l.move)
  const porDestino = new Map<string, number>()
  for (const l of linhas) porDestino.set(l.para, (porDestino.get(l.para) ?? 0) + 1)

  // CSV completo
  const csv = [
    'driveFileId,arquivo,de,para,move,motivo,quality,clienteIdentificavel',
    ...linhas.map((l) =>
      [l.driveFileId, l.arquivo, l.de, l.para, l.move, l.motivo, l.quality, l.clienteIdentificavel]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n')
  fs.writeFileSync(`${outDir}/manifesto.csv`, csv)
  fs.writeFileSync(`${outDir}/manifesto.json`, JSON.stringify(linhas, null, 2))

  console.log('arquivos considerados :', linhas.length)
  console.log('que MUDAM de pasta    :', movem.length)
  console.log('que ficam onde estão  :', linhas.length - movem.length)
  const naoClass = linhas.filter((l) => l.para.includes('_a-classificar')).length
  console.log('caem em _a-classificar:', naoClass)
  console.log('\n=== destino final (todas as pastas) ===')
  for (const [k, v] of [...porDestino.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    console.log(`  ${String(v).padStart(4)}  ${k}`)
  }
  console.log(`\nmanifesto → ${outDir}/manifesto.csv  e  manifesto.json`)
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
