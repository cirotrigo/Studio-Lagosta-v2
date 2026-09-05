/**
 * Reparo das páginas legadas cujas camadas de imagem guardam thumbnailLink do
 * Drive (lh3.googleusercontent.com — link assinado que EXPIRA): reaponta cada
 * camada para uma cópia permanente no Blob.
 *
 * A regra que vale desde 01/08/2026 (commit 5920f5d): camada de imagem nunca
 * guarda thumbnailLink — `resolveImageUrl` baixa a foto e grava
 * `drive-cache/{fileId}-s1920.jpg`. Este script conserta o estoque anterior.
 *
 * O mapa página→foto abaixo foi reconstruído em 01/08/2026 a partir de:
 *  - Generation.fieldValues (imageUrl lh3 idêntico + driveImageId);
 *  - SocialPost.slotValues._driveImageId;
 *  - docs/tero-copies-semana-07-13-abril.md (story→arquivo→fileId), validado
 *    pelos posts Dom 19/20/21 (as duas fontes concordam) e pelos thumbnails;
 *  - uploads da era viva no Blob (`uploads/…/drive-<ts>-<NOME>.jpg`) e o
 *    arquivo do fotógrafo, para fotos EXCLUÍDAS do Drive na curadoria de julho
 *    — cada uma conferida visualmente contra a arte publicada/thumbnail.
 *
 * Fotos que não existem mais em lugar nenhum (mesa RW e gnocchi do By Rock,
 * varanda Dom 20 do TERO) ficam como IRRECUPERÁVEIS: a camada não é tocada e a
 * página sai listada no relatório — trocar a foto por outra parecida seria
 * inventar conteúdo.
 *
 * Uso:
 *   npx dotenv-cli -e .env -- npx tsx scripts/reparar-lh3-legado.ts            # dry-run
 *   npx dotenv-cli -e .env -- npx tsx scripts/reparar-lh3-legado.ts --aplicar  # grava
 *
 * `RECOVERED_DIR` aponta para a pasta local com as 4 fotos resgatadas
 * (cmt05534/cmt03360/cmt04289/cmt03355 já em ~1920px).
 */
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { resolveImageUrl } from '@/lib/creatives/persist'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import * as fs from 'fs'
import * as path from 'path'

const APLICAR = process.argv.includes('--aplicar')
const RECOVERED_DIR = process.env.RECOVERED_DIR ?? ''
const LH3 = /lh3\.googleusercontent\.com\/(drive-storage|.*=s\d+)/

type Acao =
  | { tipo: 'drive'; fileId: string }
  | { tipo: 'blobFile'; nome: string } // arquivo local resgatado → drive-cache/recovered-<nome>
  | { tipo: 'irrecuperavel'; motivo: string }

interface Regra {
  nota: string
  acao: Acao
  pages: string[]
}

const REGRAS: Regra[] = [
  // ── Espeto Gaúcho (proj 6) — Generation.fieldValues.imageUrl idêntico ──
  { nota: 'Espeto · Domingo 07h', acao: { tipo: 'drive', fileId: '1j_kZG2VFeQW4orfcFm5dDbds9yx1zG1z' }, pages: ['cms9q7srl0001l504s4c3f672'] },
  { nota: 'Espeto · Domingo 11h', acao: { tipo: 'drive', fileId: '1V12c6uWDNNZh5Lv53YTpIMluaoI1ZOB-' }, pages: ['cms9q7zg80005l5042tos01yd'] },
  { nota: 'Espeto · Domingo 13h', acao: { tipo: 'drive', fileId: '1QCj71y6AZtx8SIg11RYcfNlQ_4ug1yx3' }, pages: ['cms9q87hl0001ju042z9bgly1'] },
  { nota: 'Espeto · Domingo 20h', acao: { tipo: 'drive', fileId: '1BKOPiASk1v1PdUuMpTqYJGtCIod_eglT' }, pages: ['cms9q8kem0009ju04dsy7gkir'] },

  // ── By Rock (proj 7) · Arte Rápida Happy Hour 01/08 — Generation ──
  {
    nota: 'By Rock · Happy Hour arte-rápida',
    acao: { tipo: 'drive', fileId: '1u8e-UfIL98qgOaQsn_1k3JJjC2hwgXqk' },
    pages: ['cms9sk0xp0001i904f7cjgswy', 'cms9sqdbb0005i904rvflqnfn'],
  },

  // ── By Rock · grupo FISH & CHIPS (URL única nas 8 páginas; arte publicada
  //    confere com CMT05534, resgatada do upload da era viva no Blob) ──
  {
    nota: 'By Rock · fish & chips (CMT05534)',
    acao: { tipo: 'blobFile', nome: 'cmt05534' },
    pages: [
      'cmn7jq6p80005swugv32prx2f', // Desejo Pag.13
      'cmn6yx2450005swe34itscot7', // Desejo Pag.17
      'cmn7jq726000bswugamdeop7j', // Desejo Pag.15
      'cmn7s0boh0007swckz28hepud', // Desejo Pag.22
      'cmn7s0ceb000jswckt7y6ocxy', // Desejo Pag.27
      'cmn7s0cr3000pswckse8cngbt', // Desejo Pag.30
      'cmn7s0dc6000zswck1tbb3l8h', // Desejo Pag.34
      'cmn83jucg000tl704qrees9ha', // Week Feed Pag.13
    ],
  },

  // ── TERO (proj 3) · semana 07-13/abr — story→fileId do doc (ids vivos) ──
  { nota: 'TERO · Seg 1 Empanada (CMT04106)', acao: { tipo: 'drive', fileId: '174xg29vef6zRTPuHNlW4cx-yjk_4ObKW' }, pages: ['cmnifpn140001swnvuljc1qfg'] },
  // Seg 2/3 compartilhavam a MESMA URL (bug do lote de criação); restaurado por
  // story do doc — o croissant devolve a foto à página que hoje está cinza.
  { nota: 'TERO · Seg 2 Ambiente (_F3A3277)', acao: { tipo: 'drive', fileId: '1NagYBQVVFWmkGz2gNWSA1fBL2YuOV6bz' }, pages: ['cmnifpnhi0003swnv61cempgc'] },
  { nota: 'TERO · Seg 3 Croissant (CMT04269)', acao: { tipo: 'drive', fileId: '18PK3Xuw2RirgalgmH7J5KYs1pvVUVof2' }, pages: ['cmnifpnt20005swnvxux7u4vv'] },
  { nota: 'TERO · Ter 6 Happy Wine (CMT08310)', acao: { tipo: 'drive', fileId: '1FaPEjWNza8lLkShqkd4QQEle92FsZzmH' }, pages: ['cmnifpoqs000bswnvxcjiqzfz'] },
  { nota: 'TERO · Qua 7 Carbonara (CMT04202)', acao: { tipo: 'drive', fileId: '1n_ZPmgzwTf13B25abiTBxKckf6hTwcQF' }, pages: ['cmnifpp1n000dswnv1tjrs6wd'] },
  { nota: 'TERO · Qua 8 Nhoque (CMT04200)', acao: { tipo: 'drive', fileId: '10zoPNEpOZeWT9C0eYZPilRMWsP-onRIF' }, pages: ['cmnifppcs000fswnvsj3bge3f'] },
  { nota: 'TERO · Qua 9 RW Urgência (CMT04173)', acao: { tipo: 'drive', fileId: '1fJJgNzLCJL8ORjE3WC04Wk2408GDSBG8' }, pages: ['cmnifppqi000hswnvgqchjkzv'] },
  { nota: 'TERO · Qui 10 Salmão (CMT04294)', acao: { tipo: 'drive', fileId: '1TlzGaby85_NF_aenzzAwUf19mLK55deM' }, pages: ['cmnifpq2e000jswnvuo5plb0m'] },
  { nota: 'TERO · Qui 11 Chorizo (CMT04129)', acao: { tipo: 'drive', fileId: '1LEIG7SkC4ideXibUKNGWte7SZJu7hSSv' }, pages: ['cmnifpqcr000lswnvbleryio1'] },
  { nota: 'TERO · Qui 12 Brûlée (8F3A3093)', acao: { tipo: 'drive', fileId: '1W4DQtpybO0yYBewoPyr5dGW3MkNgPK88' }, pages: ['cmnifpqnh000nswnv68z6e6ht'] },
  { nota: 'TERO · Sex 13 Carpaccio (CMT04208)', acao: { tipo: 'drive', fileId: '1LpI5g7Cp-5AH960SGvBhjl4hfMaHYqve' }, pages: ['cmnifpqyl000pswnvzb2mylkb'] },
  { nota: 'TERO · Sex 14 Happy Wine (CMT05559)', acao: { tipo: 'drive', fileId: '1pjLlDM9jHXary5LAjyS_1eLaEV65mBxw' }, pages: ['cmnifpr9e000rswnva9f0mzhd'] },
  { nota: 'TERO · Sex 15 Entrecôte (CMT04173)', acao: { tipo: 'drive', fileId: '1fJJgNzLCJL8ORjE3WC04Wk2408GDSBG8' }, pages: ['cmnifprk4000tswnvqyyavkw8'] },
  { nota: 'TERO · Dom 19 Família (_F3A3330)', acao: { tipo: 'drive', fileId: '150GRdrnauPC6htboyT1EwsaRpuZPqZ9c' }, pages: ['cmnifpsw50011swnveuc8e1s9'] },
  { nota: 'TERO · Dom 21 Contagem (CMT04267)', acao: { tipo: 'drive', fileId: '1GuPXYxyy8tnsF0cJvxlx8CRMD7Eu3_Go' }, pages: ['cmnifptjq0015swnvuhcmag73'] },

  // Fotos do doc EXCLUÍDAS do Drive em julho — bytes resgatados de uploads da
  // era viva no Blob (CMT03360) e do arquivo do fotógrafo (CMT03355).
  { nota: 'TERO · Ter 5 Executivo Ancho (CMT03360, resgate)', acao: { tipo: 'blobFile', nome: 'cmt03360' }, pages: ['cmnifpogi0009swnv6wlfjuk7'] },
  { nota: 'TERO · Sab 17 Parrilla (CMT03355, resgate)', acao: { tipo: 'blobFile', nome: 'cmt03355' }, pages: ['cmnifps8p000xswnvftl5ff7g'] },

  // ── TERO · páginas-modelo da cópia do template — foto identificada pelo
  //    thumbnail da era viva ↔ story do doc ──
  { nota: 'TERO · MODELO RW Almoço (cupim CMT04133)', acao: { tipo: 'drive', fileId: '14moa1BLm2swcd_qeh80L_G-pihN4ShLB' }, pages: ['cmnifnelm0001jy04vz3en1hz'] },
  { nota: 'TERO · MODELO RW Jantar (empanada CMT04106)', acao: { tipo: 'drive', fileId: '174xg29vef6zRTPuHNlW4cx-yjk_4ObKW' }, pages: ['cmnifneln0003jy048v68hhva'] },
  { nota: 'TERO · MODELO Executivo (ancho CMT03360, resgate)', acao: { tipo: 'blobFile', nome: 'cmt03360' }, pages: ['cmnifneln0005jy040yzjtg8a'] },
  { nota: 'TERO · MODELO Happy Wine (CMT08310)', acao: { tipo: 'drive', fileId: '1FaPEjWNza8lLkShqkd4QQEle92FsZzmH' }, pages: ['cmnifneln0007jy04ii8k4v4n'] },
  { nota: 'TERO · MODELO Clássicos (nhoque CMT04200)', acao: { tipo: 'drive', fileId: '10zoPNEpOZeWT9C0eYZPilRMWsP-onRIF' }, pages: ['cmnifneln0009jy0493bz8bch'] },
  { nota: 'TERO · MODELO Parrilla (ambiente _F3A3277)', acao: { tipo: 'drive', fileId: '1NagYBQVVFWmkGz2gNWSA1fBL2YuOV6bz' }, pages: ['cmnifneln000bjy04tb9bqwbe'] },
  { nota: 'TERO · MODELO Domingo (ambiente _F3A3277)', acao: { tipo: 'drive', fileId: '1NagYBQVVFWmkGz2gNWSA1fBL2YuOV6bz' }, pages: ['cmnifneln000djy04m02xjxqy'] },

  // ── TERO · semana 31/03-06/04 ──
  // Sáb 04.3: o thumbnail da era viva mostra exatamente o CMT04289 (entrecôte
  // zenital) como fundo; bytes resgatados do upload no Blob.
  { nota: 'TERO · Sáb 04.3 Entrecôte (CMT04289, resgate)', acao: { tipo: 'blobFile', nome: 'cmt04289' }, pages: ['cmniyomfj000lsww0qr0oame0'] },

  // ── IRRECUPERÁVEIS — a foto original não existe em nenhuma fonte ──
  {
    nota: 'By Rock · fundo "mesa RW" (zenital, todos os pratos) — foto excluída do Drive em julho, sem cópia em Blob/arquivo',
    acao: { tipo: 'irrecuperavel', motivo: 'foto-perdida' },
    pages: [
      'cmn6yx0zu0001swe3xrr3gaa2', 'cmn6yx2k10007swe3hip2mpmx', 'cmn6yx2zq0009swe3vpi3u3y7',
      'cmn7jq6cb0001swugfimkcq4b', 'cmn7jq6tl0007swugs2jerlkm', 'cmn7s0b7j0001swcks2kl813o',
      'cmn7s0bk60005swckkyog8t09', 'cmn7s0bsr0009swck16aj4say', 'cmn7s0bx1000bswckl4bhybo4',
      'cmn7s0c1k000dswcks2kbtsxp', 'cmn7s0ca2000hswckwe6aklzx', 'cmn7s0cij000lswckjb8eruob',
      'cmn7s0cve000rswckuhojkfca', 'cmn7s0czl000tswckahtpt9it', 'cmn7s0d7z000xswcku7k08ino',
      'cmn7s0dge0011swckaytozder', 'cmn7zi2fq0001swemjrkcs8k4', 'cmn7zi2p80003swemkr173qi0',
      'cmn7zi2ua0005swem42rpp9z2', 'cmn7zi2z90007swemxu1dbfu0', 'cmn83jucg000vl7048i9xjgcw',
      'cmn83juch0013l7040ky2inmk', 'cmn83juch0015l7047d7swx44', 'cmn83juci001jl7040wjndj4s',
      'cmn83juck0025l70428feq102',
    ],
  },
  {
    nota: 'By Rock · fundo "gnocchi 3 pratos" — foto excluída do Drive em julho, sem cópia (só existe o close CMT05478, que é OUTRA foto)',
    acao: { tipo: 'irrecuperavel', motivo: 'foto-perdida' },
    pages: [
      'cmn6yx1od0003swe332nwx1dg', 'cmn7jq6kw0003swugc6u6hiuy', 'cmn7jq6xw0009swugs2lv5cql',
      'cmn7s0bfy0003swckcdkbk634', 'cmn7s0c5u000fswckbvpziknh', 'cmn7s0cmw000nswck56p4ymrb',
      'cmn7s0d3r000vswck4mfstk9d', 'cmn7s0dkk0013swckocyiw1lh', 'cmn7s0dot0015swckk0q95js1',
      'cmn83juce000bl704lr7tynlh', 'cmn83jucg000rl7040cke93hb',
    ],
  },
  {
    nota: 'TERO · Dom 20 Brunch — _F3A3299 excluída do Drive, sem cópia em Blob/arquivo',
    acao: { tipo: 'irrecuperavel', motivo: 'foto-perdida' },
    pages: ['cmnifpt960013swnv7m9b75ut'],
  },
  {
    nota: 'TERO · Sex 03.2 Sobrecoxa — fundo indeterminável (página reaproveitada; camada viva CMT03432 cobre tudo)',
    acao: { tipo: 'irrecuperavel', motivo: 'fundo-indeterminavel-coberto' },
    pages: ['cmniyokkw0005sww0sa8ubzsa'],
  },
]

function parseLayers(raw: unknown): { layers: any[]; depth: number } {
  let v: unknown = raw
  let d = 0
  while (typeof v === 'string' && d < 3) {
    try {
      v = JSON.parse(v)
      d++
    } catch {
      return { layers: [], depth: -1 }
    }
  }
  return Array.isArray(v) ? { layers: v, depth: d } : { layers: [], depth: -1 }
}

function encodeLayers(layers: any[], depth: number): unknown {
  if (depth <= 0) return layers
  let out: unknown = layers
  for (let i = 0; i < depth; i++) out = JSON.stringify(out)
  return out
}

/** A página tem outra camada de imagem viva cobrindo o canvas? (para o relatório) */
function coberta(layers: any[], pageW: number, pageH: number): boolean {
  return layers.some(
    (l: any) =>
      l.type === 'image' &&
      l.visible !== false &&
      typeof l.fileUrl === 'string' &&
      l.fileUrl.startsWith('http') &&
      !LH3.test(l.fileUrl) &&
      (l.size?.width ?? 0) >= pageW * 0.9 &&
      (l.size?.height ?? 0) >= pageH * 0.9,
  )
}

/**
 * Neon fecha conexão ociosa durante a fase lenta de download do Drive, e o
 * Prisma devolve P1017 na primeira query seguinte em vez de reconectar.
 * Desconectar explicitamente força a reconexão na retentativa.
 */
async function comReconexao<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn()
    } catch (e) {
      const msg = (e as Error).message ?? ''
      const conexao = (e as { code?: string }).code === 'P1017' || /closed the connection|Connection reset/i.test(msg)
      if (!conexao || tentativa >= 3) throw e
      console.log(`  (conexão caiu — reconectando, tentativa ${tentativa + 1})`)
      await db.$disconnect().catch(() => {})
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

const PAGE_SELECT = {
  id: true,
  name: true,
  width: true,
  height: true,
  layers: true,
  isTemplate: true,
  Template: { select: { projectId: true, name: true } },
} as const

async function main() {
  console.log(`modo: ${APLICAR ? 'APLICAR' : 'dry-run'}\n`)

  // sanity: nenhuma página em duas regras
  const vistos = new Set<string>()
  for (const r of REGRAS)
    for (const p of r.pages) {
      if (vistos.has(p)) throw new Error(`página em duas regras: ${p}`)
      vistos.add(p)
    }

  // pré-carrega as páginas ANTES da fase lenta do Drive, e só resolve as
  // fotos de páginas que ainda têm lh3 (re-execução após queda fica barata)
  const paginas = new Map<string, any>()
  for (const r of REGRAS)
    for (const pageId of r.pages) {
      const page = await comReconexao(() => db.page.findUnique({ where: { id: pageId }, select: PAGE_SELECT }))
      if (page) paginas.set(pageId, page)
    }
  const pendente = (pageId: string) => {
    const page = paginas.get(pageId)
    if (!page) return false
    return parseLayers(page.layers).layers.some((l: any) => typeof l.fileUrl === 'string' && LH3.test(l.fileUrl))
  }

  // resolve as URLs-alvo (uma vez por foto, só as necessárias)
  const urlPorFileId = new Map<string, string>()
  const urlPorNome = new Map<string, string>()
  for (const r of REGRAS) {
    if (!r.pages.some(pendente)) continue
    if (r.acao.tipo === 'drive' && !urlPorFileId.has(r.acao.fileId)) {
      const res = await resolveImageUrl(undefined, r.acao.fileId)
      if (!res.url) throw new Error(`resolveImageUrl falhou para ${r.acao.fileId}: ${res.warning}`)
      urlPorFileId.set(r.acao.fileId, res.url)
      console.log(`drive ${r.acao.fileId} → ${res.url}`)
    }
    if (r.acao.tipo === 'blobFile' && !urlPorNome.has(r.acao.nome)) {
      const file = path.join(RECOVERED_DIR, `${r.acao.nome}.jpg`)
      if (!fs.existsSync(file)) throw new Error(`arquivo resgatado não encontrado: ${file} (defina RECOVERED_DIR)`)
      const blob = await put(`drive-cache/recovered-${r.acao.nome}.jpg`, fs.readFileSync(file), {
        access: 'public',
        contentType: 'image/jpeg',
        addRandomSuffix: false,
        allowOverwrite: true,
      })
      urlPorNome.set(r.acao.nome, blob.url)
      console.log(`resgate ${r.acao.nome} → ${blob.url}`)
    }
  }

  const manifest: any[] = []
  const alteradas: string[] = []
  const stats = new Map<number, { recuperadas: number; irrecuperaveis: number; puladas: number }>()
  const bump = (proj: number, k: 'recuperadas' | 'irrecuperaveis' | 'puladas') => {
    const s = stats.get(proj) ?? { recuperadas: 0, irrecuperaveis: 0, puladas: 0 }
    s[k]++
    stats.set(proj, s)
  }

  console.log('')
  for (const r of REGRAS) {
    for (const pageId of r.pages) {
      const page = paginas.get(pageId)
      if (!page) {
        console.log(`  [pulada] ${pageId} não existe mais (${r.nota})`)
        continue
      }
      const proj = page.Template.projectId
      const { layers, depth } = parseLayers(page.layers)
      const lh3Layers = layers.filter((l: any) => typeof l.fileUrl === 'string' && LH3.test(l.fileUrl))

      if (lh3Layers.length === 0) {
        console.log(`  [pulada] ${pageId} "${page.name}" já sem lh3 (${r.nota})`)
        bump(proj, 'puladas')
        continue
      }

      if (r.acao.tipo === 'irrecuperavel') {
        const cob = coberta(layers, page.width, page.height)
        console.log(
          `  [irrecuperável${cob ? ', coberta por foto viva' : ', QUEBRADA à vista'}] proj ${proj} ${pageId} "${page.name}" — ${r.nota}`,
        )
        bump(proj, 'irrecuperaveis')
        manifest.push({ pageId, projeto: proj, nome: page.name, acao: 'irrecuperavel', motivo: r.acao.motivo, coberta: cob })
        continue
      }

      const urlNova = r.acao.tipo === 'drive' ? urlPorFileId.get(r.acao.fileId)! : urlPorNome.get(r.acao.nome)!
      const urlsAntigas = [...new Set(lh3Layers.map((l: any) => l.fileUrl as string))]
      const novasLayers = layers.map((l: any) =>
        typeof l.fileUrl === 'string' && LH3.test(l.fileUrl) ? { ...l, fileUrl: urlNova } : l,
      )

      manifest.push({
        pageId,
        projeto: proj,
        nome: page.name,
        template: page.Template.name,
        acao: r.acao.tipo === 'drive' ? `drive:${r.acao.fileId}` : `resgate:${r.acao.nome}`,
        urlsAntigas,
        urlNova,
        camadasTrocadas: lh3Layers.length,
        layersAntes: page.layers,
      })

      if (APLICAR) {
        await comReconexao(() =>
          db.page.update({ where: { id: pageId }, data: { layers: encodeLayers(novasLayers, depth) as any } }),
        )
      }
      alteradas.push(pageId)
      bump(proj, 'recuperadas')
      console.log(`  [${APLICAR ? 'ok' : 'dry'}] proj ${proj} ${pageId} "${page.name}" ← ${r.nota} (${lh3Layers.length} camada)`)
    }
  }

  // regra da casa: TODA página com layers reescritos invalida os posts que a
  // referenciam — inclui as recuperadas em execuções anteriores interrompidas
  // (aqui aparecem como "puladas"), por isso o conjunto vem das REGRAS.
  let invalidados = 0
  if (APLICAR) {
    const recuperaveis = REGRAS.filter((r) => r.acao.tipo !== 'irrecuperavel').flatMap((r) => r.pages)
    const r = await comReconexao(() => invalidateScheduledRenders(db, { pageIds: recuperaveis }))
    invalidados = r.invalidados
    if (r.congelados.length > 0) {
      console.warn(
        `  ⚠ ${r.congelados.length} post(s) já entregues ao publicador não recebem a correção: ${r.congelados.join(', ')}`,
      )
    }
  }

  // O manifesto é o ROLLBACK desta operação: ele mora em `docs/manifests/`,
  // versionado, e não em `scripts/.tmp-*`, que é a convenção de descartável.
  fs.mkdirSync('docs/manifests', { recursive: true })
  const manifestPath = `docs/manifests/lh3-fix-${new Date().toISOString().slice(0, 10)}${APLICAR ? '' : '-dryrun'}.json`
  fs.writeFileSync(manifestPath, JSON.stringify({ aplicado: APLICAR, data: new Date().toISOString(), paginas: manifest }, null, 2))

  console.log('\n──────── resumo por projeto ────────')
  for (const [proj, s] of [...stats.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`  projeto ${proj}: ${s.recuperadas} recuperadas · ${s.irrecuperaveis} irrecuperáveis · ${s.puladas} puladas`)
  console.log(`  posts devolvidos à fila de render: ${invalidados}`)
  console.log(`  manifest: ${manifestPath}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
