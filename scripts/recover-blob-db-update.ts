import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

const prisma = new PrismaClient()
const SCRATCH = '/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/e5585fc3-72d5-473a-acec-801d2cb45659/scratchpad'
const OLD_HOST = 'sqc9qfyearji7bel.public.blob.vercel-storage.com'
const NEW_HOST = '2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
const DRY = process.argv.includes('--dry')

async function main() {
  const cols: Array<{ table_name: string; column_name: string; data_type: string }> =
    await prisma.$queryRawUnsafe(`
      SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = 'public'
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND (c.data_type IN ('text','character varying','jsonb')
             OR (c.data_type = 'ARRAY' AND c.udt_name = '_text'))
    `)

  let totalRows = 0
  for (const { table_name, column_name, data_type } of cols) {
    let setExpr: string, whereExpr: string
    if (data_type === 'ARRAY') {
      setExpr = `ARRAY(SELECT replace(u, '${OLD_HOST}', '${NEW_HOST}') FROM unnest("${column_name}") u)`
      whereExpr = `EXISTS (SELECT 1 FROM unnest("${column_name}") u WHERE u LIKE '%${OLD_HOST}%')`
    } else if (data_type === 'jsonb') {
      setExpr = `replace("${column_name}"::text, '${OLD_HOST}', '${NEW_HOST}')::jsonb`
      whereExpr = `"${column_name}"::text LIKE '%${OLD_HOST}%'`
    } else {
      setExpr = `replace("${column_name}", '${OLD_HOST}', '${NEW_HOST}')`
      whereExpr = `"${column_name}" LIKE '%${OLD_HOST}%'`
    }
    try {
      if (DRY) {
        const [r]: any = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${table_name}" WHERE ${whereExpr}`)
        if (Number(r.n) > 0) { console.log(`[dry] ${table_name}.${column_name}: ${Number(r.n)} linhas`); totalRows += Number(r.n) }
      } else {
        const n: number = await prisma.$executeRawUnsafe(
          `UPDATE "${table_name}" SET "${column_name}" = ${setExpr} WHERE ${whereExpr}`
        )
        if (n > 0) { console.log(`${table_name}.${column_name}: ${n} linhas atualizadas`); totalRows += n }
      }
    } catch (e: any) {
      console.error(`ERRO ${table_name}.${column_name}: ${e.message?.split('\n')[0]}`)
    }
  }
  console.log(`total: ${totalRows} linhas`)

  if (!DRY) {
    // Reverte URLs "gone" (nunca copiadas) de volta pro host antigo — marcador de perda definitiva
    const gone: string[] = []
    for (const line of fs.readFileSync(`${SCRATCH}/copy-progress.jsonl`, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { const r = JSON.parse(line); if (r.status === 'gone') gone.push(r.url) } catch {}
    }
    console.log(`revertendo ${gone.length} URLs perdidas pro host antigo (marcador)...`)
    for (const oldUrl of gone) {
      const newUrl = oldUrl.replace(OLD_HOST, NEW_HOST)
      for (const { table_name, column_name, data_type } of cols) {
        let setExpr: string, whereExpr: string
        const esc = (s: string) => s.replace(/'/g, "''")
        if (data_type === 'ARRAY') {
          setExpr = `ARRAY(SELECT replace(u, '${esc(newUrl)}', '${esc(oldUrl)}') FROM unnest("${column_name}") u)`
          whereExpr = `EXISTS (SELECT 1 FROM unnest("${column_name}") u WHERE u LIKE '%' || '${esc(newUrl)}' || '%')`
        } else if (data_type === 'jsonb') {
          setExpr = `replace("${column_name}"::text, '${esc(newUrl)}', '${esc(oldUrl)}')::jsonb`
          whereExpr = `"${column_name}"::text LIKE '%' || '${esc(newUrl)}' || '%'`
        } else {
          setExpr = `replace("${column_name}", '${esc(newUrl)}', '${esc(oldUrl)}')`
          whereExpr = `"${column_name}" LIKE '%' || '${esc(newUrl)}' || '%'`
        }
        try { await prisma.$executeRawUnsafe(`UPDATE "${table_name}" SET "${column_name}" = ${setExpr} WHERE ${whereExpr}`) } catch {}
      }
    }
    console.log('revert de perdidas concluído')
  }
}
main().finally(() => prisma.$disconnect())
