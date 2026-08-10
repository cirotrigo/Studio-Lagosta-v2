/**
 * Inventário de uso das páginas-modelo (`Page.isTemplate = true`), para a
 * curadoria do acervo.
 *
 * ⚠️ **DESPROMOVER, NUNCA EXCLUIR.** Página é referenciada por
 * `SocialPost.pageId` e por `Generation.fieldValues` — apagar é a mesma classe
 * de risco da foto de acervo excluída na curadoria de julho/2026, que matou 38
 * páginas. Este script só sabe gravar `isTemplate: false`, e o manifest de
 * rollback devolve tudo com um UPDATE.
 *
 * ── O QUE ELE MEDE ────────────────────────────────────────────────────────
 * "Uso de um modelo" está espalhado em três livros-caixa diferentes, nenhum
 * completo:
 *
 *  1. `Generation.fieldValues->>'sourcePageId'` — arte-rápida (chat, MCP,
 *     /api/external/creatives) e o finalize do gerar-criativo. É Json sem
 *     índice: a varredura busca só as colunas necessárias e agrega em memória.
 *     ⚠️ A chave é AMBÍGUA: `ajustar-arte` grava em `sourcePageId` a página que
 *     ela mesma ajustou (a CÓPIA, não o modelo). Por isso as linhas com
 *     `source = 'ajuste-arte'` são descartadas — `ajustar-arte` recusa
 *     página-modelo, então nenhum uso real se perde nisso.
 *  2. `AICreativeGeneration.layoutType = 'template:<pageId>'` — o fluxo da UI
 *     (`create-from-template` e o finalize). Indexado por projectId+createdAt.
 *  3. `SocialPost` — usado só para ENRIQUECER, e em duas formas:
 *     `pageId` apontando direto para o modelo (raro: significa que alguém
 *     publicou a partir da própria página-modelo) e o post derivado, alcançado
 *     pela cópia (`AICreativeGeneration.pageId`) ou pela Generation
 *     (`SocialPost.generationId`). O caminho normal grava no post a CÓPIA, não
 *     o modelo — daí o vínculo com o modelo viver no `fieldValues`.
 *
 * ── POR QUE "SEM USO" NÃO É "NUNCA USADO" ─────────────────────────────────
 * A instrumentação é rasa e recente. Em 10/08/2026 o banco tinha 4.600
 * Generations e apenas 52 com `sourcePageId` (5 apontando para modelo), mais
 * 50 `AICreativeGeneration` de template — todas de dez/2025 e fev/2026. Ou
 * seja: ausência de registro é, na maior parte das vezes, ausência de
 * telemetria. Por isso o critério padrão conta uso em QUALQUER data
 * (`--janela 0`) em vez dos "últimos N dias": o sinal negativo que os dados
 * sustentam é "nunca apareceu em livro-caixa nenhum", não "sumiu faz tempo".
 * A F0.2/F1 do plano (contador `Page.usedCount`) é o que conserta isso.
 *
 * `Page.updatedAt` NÃO serve como sinal de interesse humano: os scripts de
 * saneamento em massa (peso de fonte, lh3) carimbaram dezenas de páginas em
 * 01/08/2026. Só `createdAt` é confiável.
 *
 * ── O CRITÉRIO ────────────────────────────────────────────────────────────
 *  manter      — é coletor de infraestrutura, OU tem uso registrado, OU foi
 *                criado dentro da carência (ainda não deu tempo de usar).
 *  revisar     — sem uso e fora da carência, MAS despromover deixaria alguma
 *                chave de cobertura órfã (o dia da semana que `sugerirPosts`
 *                consome, ou o tema que `prepareCreative` casa) — ou o nome
 *                tem cara de peça datada, o que merece olho humano.
 *  despromover — sem uso, fora da carência e redundante: existe outro modelo
 *                do mesmo dia/tema que continua no pool.
 *
 * ── USO ───────────────────────────────────────────────────────────────────
 *   npx tsx scripts/inventario-uso-modelos.ts                    # dry-run
 *   npx tsx scripts/inventario-uso-modelos.ts --projeto 7
 *   npx tsx scripts/inventario-uso-modelos.ts --janela 120       # critério "últimos N dias"
 *   npx tsx scripts/inventario-uso-modelos.ts --carencia 60
 *   npx tsx scripts/inventario-uso-modelos.ts --aplicar --ids id1,id2
 *   npx tsx scripts/inventario-uso-modelos.ts --aplicar --ids-arquivo aprovados.txt
 *
 * `--aplicar` exige a lista explícita de ids: a recomendação nunca vira ação
 * sozinha, quem aprova é gente. Rollback: o manifest gravado em
 * `scripts/.tmp-curadoria-modelos-manifest-<data>.json` traz os ids e o
 * comando de volta.
 */
import * as fs from 'fs'
import { PrismaClient } from '../prisma/generated/client'
import { DIAS_SEMANA, diasDoModelo, normalizar } from '../src/lib/posts/dia-semana'

const db = new PrismaClient()

// ── Argumentos ────────────────────────────────────────────────────────────

const APLICAR = process.argv.includes('--aplicar')
const FORCAR = process.argv.includes('--forcar')

function argValor(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
function argNumero(flag: string, padrao: number): number {
  const v = argValor(flag)
  if (v === null) return padrao
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${flag} precisa de um número >= 0 (recebi "${v}")`)
  }
  return n
}

const PROJETO = argValor('--projeto') ? Number(argValor('--projeto')) : null
/** Uso mais antigo que isso não conta. 0 = uso de qualquer data conta (padrão). */
const JANELA_DIAS = argNumero('--janela', 0)
/** Modelo criado há menos que isto nunca é despromovido. */
const CARENCIA_DIAS = argNumero('--carencia', 90)

function idsAprovados(): string[] {
  const arquivo = argValor('--ids-arquivo')
  const inline = argValor('--ids')
  const bruto = arquivo ? fs.readFileSync(arquivo, 'utf8') : (inline ?? '')
  return Array.from(
    new Set(
      bruto
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
}

/**
 * Templates de INFRAESTRUTURA — coletores criados pelo próprio sistema
 * (`ensureArteTemplate`) para receber arte gerada, ajustada ou trazida de fora.
 * Nenhuma página deles pode ser despromovida por este script: mexer aí quebra
 * `importarArte`, `createArteRapida` e a arte-livre. Hoje eles não têm nenhuma
 * página marcada como modelo — a proteção é preventiva.
 */
const TEMPLATES_INFRA = [/^Arte Enviada\b/i, /^Arte Rápida\b/i, /^Arte Livre\b/i]
const ehTemplateInfra = (nome: string) => TEMPLATES_INFRA.some((re) => re.test(nome.trim()))

/** "Agenda musical — 05 a 08/08/2026", "Criativo 20/12/2025": peça de uma data. */
const ehNomeDatado = (nome: string) => /\d{1,2}\s*[\/.-]\s*\d{1,2}(\s*[\/.-]\s*\d{2,4})?/.test(nome)

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')
const diasDesde = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000)

// ── Tipos ─────────────────────────────────────────────────────────────────

type Recomendacao = 'manter' | 'revisar' | 'despromover'

interface Modelo {
  pageId: string
  projectId: number
  projeto: string
  nome: string
  templateId: number
  template: string
  tipo: string
  infra: boolean
  tags: string[]
  templateTags: string[]
  criadaEm: Date
  atualizadaEm: Date
  usos: { arteRapida: number; ui: number; postsDiretos: number; postsDerivados: number; total: number }
  ultimoUso: Date | null
  chaves: string[]
  recomendacao: Recomendacao
  motivo: string
}

// ── Coleta ────────────────────────────────────────────────────────────────

async function coletar(): Promise<Modelo[]> {
  const paginas = await db.page.findMany({
    where: {
      isTemplate: true,
      ...(PROJETO ? { Template: { projectId: PROJETO } } : {}),
    },
    select: {
      id: true,
      name: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      Template: {
        select: {
          id: true,
          name: true,
          type: true,
          tags: true,
          projectId: true,
          Project: { select: { name: true } },
        },
      },
    },
  })

  const ids = new Set(paginas.map((p) => p.id))
  const corte = JANELA_DIAS > 0 ? new Date(Date.now() - JANELA_DIAS * 86_400_000) : null
  const dentroDaJanela = (d: Date) => (corte ? d >= corte : true)

  // (1) Generation.fieldValues->>'sourcePageId' — varredura com select enxuto.
  const geracoes = await db.$queryRawUnsafe<Array<{ pid: string; source: string | null; criadaEm: Date; genId: string }>>(
    `select "id" as "genId",
            "fieldValues"->>'sourcePageId' as pid,
            "fieldValues"->>'source' as source,
            "createdAt" as "criadaEm"
       from "Generation"
      where "fieldValues"->>'sourcePageId' is not null`,
  )

  // (2) AICreativeGeneration.layoutType = 'template:<pageId>'
  const uiGeracoes = await db.aICreativeGeneration.findMany({
    where: { layoutType: { startsWith: 'template:' } },
    select: { pageId: true, layoutType: true, createdAt: true },
  })

  // (3) SocialPost — enriquecimento
  const postsDiretos = await db.socialPost.findMany({
    where: { pageId: { in: [...ids] } },
    select: { pageId: true, createdAt: true, status: true },
  })

  // Cópias alcançáveis: página gerada pela UI, e Generation derivada do modelo.
  const copiaParaModelo = new Map<string, string>()
  for (const g of uiGeracoes) {
    const modelo = g.layoutType.slice('template:'.length)
    if (ids.has(modelo)) copiaParaModelo.set(g.pageId, modelo)
  }
  const generationParaModelo = new Map<string, string>()
  for (const g of geracoes) {
    if (g.source === 'ajuste-arte') continue
    if (ids.has(g.pid)) generationParaModelo.set(g.genId, g.pid)
  }

  const postsDerivados =
    copiaParaModelo.size + generationParaModelo.size > 0
      ? await db.socialPost.findMany({
          where: {
            OR: [
              { pageId: { in: [...copiaParaModelo.keys()] } },
              { generationId: { in: [...generationParaModelo.keys()] } },
            ],
          },
          select: { pageId: true, generationId: true, createdAt: true, status: true },
        })
      : []

  // ── Agregação ───────────────────────────────────────────────────────────
  const zero = () => ({ arteRapida: 0, ui: 0, postsDiretos: 0, postsDerivados: 0, total: 0 })
  const usos = new Map<string, ReturnType<typeof zero>>()
  const ultimo = new Map<string, Date>()
  const marcar = (pid: string, campo: keyof ReturnType<typeof zero>, quando: Date) => {
    if (!ids.has(pid) || !dentroDaJanela(quando)) return
    const u = usos.get(pid) ?? zero()
    u[campo] += 1
    u.total += 1
    usos.set(pid, u)
    const atual = ultimo.get(pid)
    if (!atual || quando > atual) ultimo.set(pid, quando)
  }

  for (const g of geracoes) {
    if (g.source === 'ajuste-arte') continue // sourcePageId aponta para a própria cópia
    marcar(g.pid, 'arteRapida', g.criadaEm)
  }
  for (const g of uiGeracoes) marcar(g.layoutType.slice('template:'.length), 'ui', g.createdAt)
  for (const p of postsDiretos) marcar(p.pageId!, 'postsDiretos', p.createdAt)
  for (const p of postsDerivados) {
    const modelo =
      (p.pageId ? copiaParaModelo.get(p.pageId) : undefined) ??
      (p.generationId ? generationParaModelo.get(p.generationId) : undefined)
    if (modelo) marcar(modelo, 'postsDerivados', p.createdAt)
  }

  return paginas.map((p) => {
    const textos = [p.name, p.Template.name, ...(p.tags ?? []), ...(p.Template.tags ?? [])]
    // Chaves de cobertura: o que faz um modelo ser ENCONTRÁVEL. Dia da semana
    // (`sugerirPosts`) e tema (`prepareCreative` casa tags de página e template).
    const temas = [...(p.tags ?? []), ...(p.Template.tags ?? [])]
      .map(normalizar)
      .filter((t) => t.length > 0 && !DIAS_SEMANA.some((d) => t.includes(normalizar(d))))
    const chaves = Array.from(new Set([...diasDoModelo(textos).map((d) => `dia:${d}`), ...temas.map((t) => `tema:${t}`)]))

    return {
      pageId: p.id,
      projectId: p.Template.projectId,
      projeto: p.Template.Project.name,
      nome: p.name,
      templateId: p.Template.id,
      template: p.Template.name,
      tipo: p.Template.type,
      infra: ehTemplateInfra(p.Template.name),
      tags: p.tags ?? [],
      templateTags: p.Template.tags ?? [],
      criadaEm: p.createdAt,
      atualizadaEm: p.updatedAt,
      usos: usos.get(p.id) ?? zero(),
      ultimoUso: ultimo.get(p.id) ?? null,
      chaves,
      recomendacao: 'manter' as Recomendacao,
      motivo: '',
    }
  })
}

// ── Critério ──────────────────────────────────────────────────────────────

function recomendar(modelos: Modelo[]): void {
  // Passe 1: o sinal individual.
  for (const m of modelos) {
    if (m.infra) {
      m.recomendacao = 'manter'
      m.motivo = `coletor de infraestrutura ("${m.template}") — despromover quebraria a arte trazida de fora`
      continue
    }
    if (m.usos.total > 0) {
      m.recomendacao = 'manter'
      m.motivo = `${m.usos.total} uso(s) registrado(s), o último em ${dia(m.ultimoUso)}`
      continue
    }
    const idade = diasDesde(m.criadaEm)
    if (idade < CARENCIA_DIAS) {
      m.recomendacao = 'manter'
      m.motivo = `criado há ${idade} dia(s) — dentro da carência de ${CARENCIA_DIAS}, ainda não deu tempo de usar`
      continue
    }
    if (ehNomeDatado(m.nome)) {
      m.recomendacao = 'despromover'
      m.motivo = `sem uso há ${idade} dia(s) e nome com data — é a peça de uma semana, não um modelo`
      continue
    }
    m.recomendacao = 'despromover'
    m.motivo = `sem uso registrado desde a criação, há ${idade} dia(s)`
  }

  // Passe 1b: peça datada dentro da carência vira decisão humana em vez de
  // ficar escondida no "manter" — o nome é heurística, não pode vencer a
  // salvaguarda sozinho.
  for (const m of modelos) {
    if (m.infra || m.usos.total > 0) continue
    if (m.recomendacao === 'manter' && ehNomeDatado(m.nome)) {
      m.recomendacao = 'revisar'
      m.motivo = `${m.motivo}, mas o nome tem data — confira se é modelo mesmo ou a peça de uma semana`
    }
  }

  // Passe 2: nenhuma chave de cobertura pode ficar órfã. Se TODOS os modelos de
  // uma chave sairiam, um deles volta para "revisar" — despromover o último faz
  // `sugerirPosts` perder o dia e `prepareCreative` devolver NO_TEMPLATE_MATCH,
  // os dois em silêncio.
  const porChave = new Map<string, Modelo[]>()
  for (const m of modelos) {
    for (const chave of m.chaves) {
      const k = `${m.projectId}|${chave}`
      if (!porChave.has(k)) porChave.set(k, [])
      porChave.get(k)!.push(m)
    }
  }
  for (const [k, grupo] of porChave) {
    if (grupo.some((m) => m.recomendacao !== 'despromover')) continue
    // Guardião: o menos "descartável" do grupo — nome sem data primeiro, depois
    // o mais recente. Sem isso a peça datada podia virar o modelo do dia.
    const guardiao = [...grupo].sort((a, b) => {
      const datado = Number(ehNomeDatado(a.nome)) - Number(ehNomeDatado(b.nome))
      if (datado !== 0) return datado
      return b.criadaEm.getTime() - a.criadaEm.getTime()
    })[0]
    guardiao.recomendacao = 'revisar'
    guardiao.motivo = `${guardiao.motivo} — mas é o ÚNICO modelo restante de "${k.split('|')[1]}" neste cliente; despromover deixa a chave órfã`
  }
}

// ── Relatório ─────────────────────────────────────────────────────────────

const ICONE: Record<Recomendacao, string> = { manter: '✅', revisar: '⚠️ ', despromover: '🗑️ ' }

function relatorio(modelos: Modelo[]): void {
  const porProjeto = new Map<number, Modelo[]>()
  for (const m of modelos) {
    if (!porProjeto.has(m.projectId)) porProjeto.set(m.projectId, [])
    porProjeto.get(m.projectId)!.push(m)
  }

  for (const [projectId, lista] of [...porProjeto.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const comUso = lista.filter((m) => m.usos.total > 0).length
    console.log(
      `\n## ${lista[0].projeto} (projeto ${projectId}) — ${lista.length} modelo(s), ${comUso} com uso registrado`,
    )
    const ordem: Recomendacao[] = ['despromover', 'revisar', 'manter']
    for (const rec of ordem) {
      const doGrupo = lista.filter((m) => m.recomendacao === rec)
      if (doGrupo.length === 0) continue
      console.log(`\n  ${rec.toUpperCase()} (${doGrupo.length})`)
      for (const m of doGrupo.sort((a, b) => a.template.localeCompare(b.template))) {
        const temas = Array.from(new Set([...m.tags, ...m.templateTags]))
        console.log(`   ${ICONE[rec]} "${m.nome}" — template "${m.template}" [${m.tipo}]`)
        console.log(`        id ${m.pageId} · temas: ${temas.length ? temas.join(', ') : '(nenhum)'}`)
        console.log(
          `        usos: arte-rápida ${m.usos.arteRapida} · UI ${m.usos.ui} · posts diretos ${m.usos.postsDiretos} · posts derivados ${m.usos.postsDerivados} (total ${m.usos.total})`,
        )
        console.log(`        criado em ${dia(m.criadaEm)} · último uso ${dia(m.ultimoUso)}`)
        console.log(`        → ${m.motivo}`)
      }
    }
  }

  console.log('\n\n═══ RESUMO ═══')
  console.log(
    `${'cliente'.padEnd(22)} ${'modelos'.padStart(8)} ${'com uso'.padStart(8)} ${'manter'.padStart(7)} ${'revisar'.padStart(8)} ${'despromover'.padStart(12)}`,
  )
  const totais = { modelos: 0, comUso: 0, manter: 0, revisar: 0, despromover: 0 }
  for (const [, lista] of [...porProjeto.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const l = {
      modelos: lista.length,
      comUso: lista.filter((m) => m.usos.total > 0).length,
      manter: lista.filter((m) => m.recomendacao === 'manter').length,
      revisar: lista.filter((m) => m.recomendacao === 'revisar').length,
      despromover: lista.filter((m) => m.recomendacao === 'despromover').length,
    }
    for (const k of Object.keys(totais) as Array<keyof typeof totais>) totais[k] += l[k]
    console.log(
      `${lista[0].projeto.slice(0, 22).padEnd(22)} ${String(l.modelos).padStart(8)} ${String(l.comUso).padStart(8)} ${String(l.manter).padStart(7)} ${String(l.revisar).padStart(8)} ${String(l.despromover).padStart(12)}`,
    )
  }
  console.log(
    `${'TOTAL'.padEnd(22)} ${String(totais.modelos).padStart(8)} ${String(totais.comUso).padStart(8)} ${String(totais.manter).padStart(7)} ${String(totais.revisar).padStart(8)} ${String(totais.despromover).padStart(12)}`,
  )
}

// ── Escrita ───────────────────────────────────────────────────────────────

async function aplicar(modelos: Modelo[], aprovados: string[]) {
  const porId = new Map(modelos.map((m) => [m.pageId, m]))
  const alvos: Modelo[] = []
  const recusados: Array<{ id: string; motivo: string }> = []

  for (const id of aprovados) {
    const m = porId.get(id)
    if (!m) {
      recusados.push({ id, motivo: 'não é uma página-modelo deste inventário (já despromovida? id errado?)' })
      continue
    }
    if (m.infra) {
      recusados.push({ id, motivo: `template coletor de infraestrutura ("${m.template}") — bloqueado sempre` })
      continue
    }
    if (m.recomendacao === 'manter' && !FORCAR) {
      recusados.push({ id, motivo: `a recomendação é MANTER (${m.motivo}) — use --forcar se for mesmo isso` })
      continue
    }
    alvos.push(m)
  }

  for (const r of recusados) console.log(`  ⛔ ${r.id} — ${r.motivo}`)
  if (alvos.length === 0) {
    console.log('\nNenhum id aplicável. Nada foi gravado.')
    return { alvos, recusados }
  }

  const r = await db.page.updateMany({
    where: { id: { in: alvos.map((m) => m.pageId) }, isTemplate: true },
    data: { isTemplate: false },
  })
  console.log(`\n✅ ${r.count} modelo(s) despromovido(s) — as páginas continuam intactas, só saíram do pool.`)
  return { alvos, recusados }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const aprovados = APLICAR ? idsAprovados() : []
  if (APLICAR && aprovados.length === 0) {
    throw new Error(
      '--aplicar exige a lista aprovada: --ids id1,id2 ou --ids-arquivo caminho.txt. ' +
        'A recomendação do relatório nunca vira ação sozinha.',
    )
  }

  console.log(
    APLICAR
      ? `⚠️  MODO APLICAR — ${aprovados.length} id(s) aprovado(s) receberão isTemplate: false\n`
      : '🔍 DRY-RUN — nada será gravado (use --aplicar --ids … para gravar)\n',
  )
  console.log(
    `Critério: uso conta ${JANELA_DIAS > 0 ? `nos últimos ${JANELA_DIAS} dias` : 'em QUALQUER data'} · ` +
      `carência de ${CARENCIA_DIAS} dias desde a criação${PROJETO ? ` · só o projeto ${PROJETO}` : ''}`,
  )

  const modelos = await coletar()
  if (modelos.length === 0) {
    console.log('\nNenhuma página com isTemplate: true. Nada a inventariar.')
    return
  }
  recomendar(modelos)
  relatorio(modelos)

  console.log(
    '\n⚠️  "Sem uso registrado" NÃO é prova de que o modelo não foi usado: até a F0.2/F1 do plano\n' +
      '    (contador em Page.usedCount) não existe telemetria de uso de modelo em lugar nenhum.\n' +
      '    O que existe cobre arte-rápida (desde 05/2026) e o fluxo da UI (morto desde 02/2026).\n' +
      '    Use a coluna de usos como EVIDÊNCIA POSITIVA e decida o resto pelo que você sabe do cliente.',
  )

  let resultado: { alvos: Modelo[]; recusados: Array<{ id: string; motivo: string }> } = {
    alvos: [],
    recusados: [],
  }
  if (APLICAR) {
    console.log('\n═══ APLICANDO ═══')
    resultado = await aplicar(modelos, aprovados)
  }

  const caminho = `scripts/.tmp-curadoria-modelos-manifest-${new Date().toISOString().slice(0, 10)}${APLICAR ? '' : '-dryrun'}.json`
  fs.writeFileSync(
    caminho,
    JSON.stringify(
      {
        aplicado: APLICAR,
        data: new Date().toISOString(),
        criterio: { janelaDias: JANELA_DIAS, carenciaDias: CARENCIA_DIAS, projeto: PROJETO },
        despromovidos: resultado.alvos.map((m) => ({
          pageId: m.pageId,
          projectId: m.projectId,
          projeto: m.projeto,
          nome: m.nome,
          template: m.template,
          isTemplateAntes: true,
          isTemplateDepois: false,
        })),
        recusados: resultado.recusados,
        inventario: modelos.map((m) => ({
          ...m,
          criadaEm: m.criadaEm.toISOString(),
          atualizadaEm: m.atualizadaEm.toISOString(),
          ultimoUso: m.ultimoUso?.toISOString() ?? null,
        })),
        rollback:
          resultado.alvos.length > 0
            ? `UPDATE "Page" SET "isTemplate" = true WHERE id IN (${resultado.alvos.map((m) => `'${m.pageId}'`).join(', ')});`
            : null,
      },
      null,
      2,
    ),
  )
  console.log(`\n📄 manifest: ${caminho}`)
  if (resultado.alvos.length > 0) {
    console.log('   O campo "rollback" traz o UPDATE que devolve tudo ao estado anterior.')
  }
}

main()
  .catch((error) => {
    console.error('Falhou:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
