/**
 * Auditoria no Drive para a recuperação lh3:
 *  1) nome do arquivo 1yXWH… (teste do padrão bg == _driveImageId do post)
 *  2) árvore de pastas de imagens dos projetos 3 (TERO) e 7 (By Rock), com ids
 *  3) download dos thumbnails (=s400) dos candidatos para conferência visual
 * Só lê o Drive; grava apenas JPGs no diretório de saída local.
 */
import { db } from '@/lib/db'
import { googleDriveService } from '@/server/google-drive-service'
import * as fs from 'fs'

const OUT = process.env.AUDIT_OUT ?? '/tmp/drive-audit'

const DOC_TERO_IDS: Record<string, string> = {
  '174xg29vef6zRTPuHNlW4cx-yjk_4ObKW': 'doc01-CMT04106-empanada',
  '1NagYBQVVFWmkGz2gNWSA1fBL2YuOV6bz': 'doc02-_F3A3277-ambiente',
  '18PK3Xuw2RirgalgmH7J5KYs1pvVUVof2': 'doc03-CMT04269-croissant',
  '14moa1BLm2swcd_qeh80L_G-pihN4ShLB': 'doc04-CMT04133-cupim',
  '1rFZr3eaoecD6L9lhEwRKoTQTEQfpbXjW': 'doc05-CMT03360-ancho',
  '1FaPEjWNza8lLkShqkd4QQEle92FsZzmH': 'doc06-CMT08310-happywine',
  '1n_ZPmgzwTf13B25abiTBxKckf6hTwcQF': 'doc07-CMT04202-carbonara',
  '10zoPNEpOZeWT9C0eYZPilRMWsP-onRIF': 'doc08-CMT04200-nhoque',
  '1fJJgNzLCJL8ORjE3WC04Wk2408GDSBG8': 'doc09-CMT04173-urgencia',
  '1TlzGaby85_NF_aenzzAwUf19mLK55deM': 'doc10-CMT04294-salmao',
  '1LEIG7SkC4ideXibUKNGWte7SZJu7hSSv': 'doc11-CMT04129-chorizo',
  '1W4DQtpybO0yYBewoPyr5dGW3MkNgPK88': 'doc12-8F3A3093-brulee',
  '1LpI5g7Cp-5AH960SGvBhjl4hfMaHYqve': 'doc13-CMT04208-carpaccio',
  '1pjLlDM9jHXary5LAjyS_1eLaEV65mBxw': 'doc14-CMT05559-happywine2',
  '1kU2QBA40tx1Re4_uYL9Pct8ZnVSmEKzm': 'doc16-20260323-4selecoes',
  '1_2T-GcaQcggFaA-1sCsPUpPx2VQ4cSrt': 'doc17-CMT03355-parrilla',
  '1ZuROQRlROhR3TSYLBq5g5CGDi8Q0uXS7': 'doc18-8F3A3080-sobremesas',
  '150GRdrnauPC6htboyT1EwsaRpuZPqZ9c': 'doc19-_F3A3330-familia',
  '1lFs2ajO6y6oIJ3RTCR3X3qu2wX4M38b6': 'doc20-_F3A3299-varanda',
  '1GuPXYxyy8tnsF0cJvxlx8CRMD7Eu3_Go': 'doc21-CMT04267-contagem',
  '1yXWHWNuLaF97xz1QvtsL86SUYNzAEQAi': 'sab043-entrecote-post',
}

async function listTree(folderId: string, prefix: string, out: Array<{ id: string; name: string; path: string }>) {
  let pageToken: string | undefined
  do {
    const res = await googleDriveService.listFiles({ folderId, pageToken, mode: 'images' })
    for (const f of res.items ?? []) {
      if (f.kind === 'folder') await listTree(f.id, `${prefix}${f.name}/`, out)
      else out.push({ id: f.id, name: f.name, path: `${prefix}${f.name}` })
    }
    pageToken = res.nextPageToken ?? undefined
  } while (pageToken)
}

async function saveThumb(fileId: string, label: string) {
  try {
    const meta = (await googleDriveService.getFileMetadata(fileId, 'name,thumbnailLink')) as {
      name?: string
      thumbnailLink?: string
    }
    if (!meta.thumbnailLink) {
      console.log(`  thumb ${label}: sem thumbnailLink (name=${meta.name})`)
      return
    }
    const { fetchBuffer } = await import('@/lib/posts/register-project-fonts')
    const buf = await fetchBuffer(meta.thumbnailLink.replace(/=s\d+$/, '=s400'))
    fs.writeFileSync(`${OUT}/${label}__${(meta.name ?? '').replace(/[^\w.-]/g, '_')}.jpg`, buf)
    console.log(`  thumb ${label}: ok (name=${meta.name})`)
  } catch (e) {
    console.log(`  thumb ${label}: ERRO ${(e as Error).message.slice(0, 90)}`)
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })

  // 1) teste do padrão: nome do arquivo do post do Sáb 04.3
  try {
    const t = (await googleDriveService.getFileMetadata(
      '1yXWHWNuLaF97xz1QvtsL86SUYNzAEQAi',
      'name',
    )) as { name?: string }
    console.log(`1yXWH… name = ${t.name}  (blob da página = CMT04289.jpg)`)
  } catch (e) {
    console.log(`1yXWH…: ERRO ${(e as Error).message.slice(0, 120)}`)
  }

  // 2) árvores
  const projects = await db.project.findMany({
    where: { id: { in: [3, 7] } },
    select: { id: true, name: true, googleDriveImagesFolderId: true, googleDriveFolderId: true },
  })
  const trees: Record<number, Array<{ id: string; name: string; path: string }>> = {}
  for (const p of projects) {
    const folderId = p.googleDriveImagesFolderId ?? p.googleDriveFolderId
    console.log(`\nprojeto ${p.id} (${p.name}) folder=${folderId}`)
    if (!folderId) continue
    const out: Array<{ id: string; name: string; path: string }> = []
    await listTree(folderId, '', out)
    trees[p.id] = out
    console.log(`  arquivos: ${out.length}`)
  }
  fs.writeFileSync(`${OUT}/trees.json`, JSON.stringify(trees, null, 2))

  // 3) thumbs dos candidatos TERO (doc) + teste
  console.log('\nthumbs TERO/doc:')
  for (const [id, label] of Object.entries(DOC_TERO_IDS)) await saveThumb(id, label)

  // 4) thumbs da week-2026 do By Rock (candidatos gnocchi/fish/spread)
  const byrock = trees[7] ?? []
  const week = byrock.filter((f) => /week.?2026|restaurant.?week/i.test(f.path))
  console.log(`\nweek-2026 By Rock no Drive: ${week.length} arquivos`)
  for (const f of week) {
    console.log(`  ${f.path} (${f.id})`)
    await saveThumb(f.id, `byrock-week__${f.name.replace(/\.[^.]+$/, '')}`)
  }

  // 5) busca por nome dos arquivos que precisamos e podem ter mudado de id
  const wanted = ['cmt03355', 'f3a3299', 'cmt04289', 'cmt03360', '8f3a0155', 'cmt03445', 'cmt05565', 'cmt05571', 'cmt05588']
  console.log('\nbusca por nome (todas as árvores):')
  for (const [pid, tree] of Object.entries(trees)) {
    for (const w of wanted) {
      const hits = tree.filter((f) => f.name.toLowerCase().includes(w))
      for (const h of hits) console.log(`  proj ${pid} [${w}] ${h.path} (${h.id})`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
