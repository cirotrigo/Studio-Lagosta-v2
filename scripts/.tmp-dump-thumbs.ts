/**
 * 1) Lista as páginas ORIGINAIS do template 148 (modelos TERO) com as fileUrls
 *    das camadas de imagem — fonte para as cópias "MODELO — …".
 * 2) Salva os thumbnails data: (150px do PageSync) das páginas-chave em JPG no
 *    scratchpad, para identificação visual da foto realmente gravada na camada.
 * Só lê.
 */
import { db } from '@/lib/db'
import * as fs from 'fs'

const OUT = process.env.THUMB_OUT ?? '/tmp/thumbs'

function parseLayers(raw: unknown): any[] {
  let v: unknown = raw
  let d = 0
  while (typeof v === 'string' && d < 3) {
    try {
      v = JSON.parse(v)
      d++
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? v : []
}

const THUMB_PAGES: Array<{ id: string; label: string }> = [
  // conflito 1 (Seg 2/3)
  { id: 'cmnifpnhi0003swnv61cempgc', label: 'tero-seg2-ambiente' },
  { id: 'cmnifpnt20005swnvxux7u4vv', label: 'tero-seg3-croissant' },
  // conflito 2 (Ter 5 / Qua 7)
  { id: 'cmnifpogi0009swnv6wlfjuk7', label: 'tero-ter5-ancho' },
  { id: 'cmnifpp1n000dswnv1tjrs6wd', label: 'tero-qua7-carbonara' },
  // Sex 03.2 (semana 31/03-06/04, sem fonte)
  { id: 'cmniyokkw0005sww0sa8ubzsa', label: 'tero-sex032-sobrecoxa' },
  // MODELO copies
  { id: 'cmnifnelm0001jy04vz3en1hz', label: 'tero-modelo-rw-almoco' },
  { id: 'cmnifneln0003jy048v68hhva', label: 'tero-modelo-rw-jantar' },
  { id: 'cmnifneln0005jy040yzjtg8a', label: 'tero-modelo-executivo' },
  { id: 'cmnifneln0007jy04ii8k4v4n', label: 'tero-modelo-happywine' },
  { id: 'cmnifneln0009jy0493bz8bch', label: 'tero-modelo-classicos' },
  { id: 'cmnifneln000bjy04tb9bqwbe', label: 'tero-modelo-parrilla' },
  { id: 'cmnifneln000djy04m02xjxqy', label: 'tero-modelo-domingo' },
  // By Rock grupo A (misto) — amostras
  { id: 'cmn7s0b7j0001swcks2kl813o', label: 'byrock-A-pag19-alfajor-post' },
  { id: 'cmn7s0bk60005swckkyog8t09', label: 'byrock-A-pag21-petit-post' },
  { id: 'cmn7s0bsr0009swck16aj4say', label: 'byrock-A-pag36-tropeiro-post' },
  { id: 'cmn6yx0zu0001swe3xrr3gaa2', label: 'byrock-A-pag10-sem-post' },
  { id: 'cmn83juch0015l7047d7swx44', label: 'byrock-A-feed-pag19' },
  // By Rock grupo B (gnocchi) — amostra
  { id: 'cmn7jq6kw0003swugc6u6hiuy', label: 'byrock-B-pag12-gnocchi' },
  // By Rock grupo C (fish) — amostra
  { id: 'cmn7s0boh0007swckz28hepud', label: 'byrock-C-pag22-fish' },
]

async function main() {
  // 1) páginas do template 148
  const t148 = await db.page.findMany({
    where: { templateId: 148 },
    select: { id: true, name: true, isTemplate: true, layers: true, createdAt: true },
    orderBy: { order: 'asc' },
  })
  console.log('=== template 148 (TERO — Semana Temática original) ===')
  for (const p of t148) {
    const imgs = parseLayers(p.layers)
      .filter((l: any) => l.type === 'image' && typeof l.fileUrl === 'string' && l.fileUrl)
      .map((l: any) => `${l.name ?? l.id}: ${String(l.fileUrl).slice(0, 90)}`)
    console.log(`${p.id} "${p.name}" isTemplate=${p.isTemplate}`)
    for (const i of imgs) console.log(`    ${i}`)
  }

  // e as páginas do template da cópia? listar templates do projeto 3 com nome parecido
  const tpls = await db.template.findMany({
    where: { projectId: 3, name: { contains: 'Semana Temática' } },
    select: { id: true, name: true },
  })
  console.log('\ntemplates TERO:', tpls.map((t) => `${t.id}=${t.name}`).join(' | '))

  // 2) thumbnails
  fs.mkdirSync(OUT, { recursive: true })
  for (const t of THUMB_PAGES) {
    const p = await db.page.findUnique({ where: { id: t.id }, select: { thumbnail: true } })
    const thumb = p?.thumbnail
    if (!thumb || !thumb.startsWith('data:')) {
      console.log(`thumb ${t.label}: ${thumb ? 'URL ' + thumb.slice(0, 60) : 'VAZIO'}`)
      continue
    }
    const m = /^data:image\/(\w+);base64,(.*)$/s.exec(thumb)
    if (!m) {
      console.log(`thumb ${t.label}: formato inesperado`)
      continue
    }
    const file = `${OUT}/${t.label}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'))
    console.log(`thumb ${t.label}: salvo (${Math.round(m[2].length / 1024)}KB)`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
