/**
 * Semeia a curadoria do acervo (`PhotoDestaque`) com a curadoria que os dados
 * JÁ fizeram — a "prata da casa" nasce cheia em vez de esperar semanas de
 * cliques (F1.2 de docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md).
 *
 * TRÊS fontes, todas de preferência humana observada:
 *
 *  (a) sinal de foto FECHADO com `escolhido.driveFileId` — a foto que de fato
 *      virou arte, tanto quando levou o topo (`aceita-como-veio`) quanto
 *      quando a pessoa desceu a lista para achá-la (`trocada` — que é
 *      justamente a foto CERTA que o ranking escondeu);
 *  (b) foto de `PhotoUsage` cuja arte (`generationId`) recebeu "Gostei" no
 *      feedback de arte — a peça feita com ela foi aprovada por gente;
 *  (c) correção PÓS-PRODUÇÃO: sinal `troca-de-arte` com `generationId` —
 *      alguém olhou a arte que estava no post e pôs OUTRA no lugar; as fotos
 *      dessa arte escolhida (via `PhotoUsage`) são a preferência mais forte.
 *
 * REGRAS:
 *  - Linha existente para (projectId, driveFileId) é PULADA — inclusive com
 *    `revogadoEm` preenchido: revogação humana NUNCA é ressemeada (despromover
 *    é decisão de gente, e a semente não pode desfazê-la). Contada à parte.
 *  - Grava `origem: 'semente'`, `decididoPor: null`. Sem FK; dedupe em código
 *    e checagem de existentes ANTES do `createMany` (skipDuplicates fica de
 *    cinto e suspensório contra escrita concorrente).
 *  - `escolhido.driveFileId` / `escolhido.veredito` são lidos EM CÓDIGO, nunca
 *    por filtro de path no SQL — linha sem o campo sumiria do resultado
 *    (regra da casa, medida em 11/08/2026).
 *  - Idempotente: rodar duas vezes reporta "já existiam" e não grava nada.
 *
 * USO
 *   npx tsx scripts/semear-destaques.ts              # dry-run: só relata
 *   npx tsx scripts/semear-destaques.ts --confirmar  # grava
 */
import { db } from '../src/lib/db'
import { chaveDoFeedbackDeArte } from '../src/lib/aprendizado/feedback-de-arte'

const ORIGEM = 'semente'
const confirmar = process.argv.includes('--confirmar')

type Fonte = 'sinal' | 'gostei' | 'correcao'

interface Candidata {
  projectId: number
  driveFileId: string
  fontes: Set<Fonte>
}

function driveFileIdDe(escolhido: unknown): string | null {
  const id = (escolhido as { driveFileId?: unknown } | null)?.driveFileId
  return typeof id === 'string' && id ? id : null
}

function vereditoDe(escolhido: unknown): string | null {
  const v = (escolhido as { veredito?: unknown } | null)?.veredito
  return typeof v === 'string' ? v : null
}

async function main() {
  const candidatas = new Map<string, Candidata>()
  const somar = (projectId: number, driveFileId: string, fonte: Fonte) => {
    const chave = `${projectId}|${driveFileId}`
    const atual = candidatas.get(chave)
    if (atual) atual.fontes.add(fonte)
    else candidatas.set(chave, { projectId, driveFileId, fontes: new Set([fonte]) })
  }

  // ── (a) Sinais de foto fechados: a foto que alguém de fato levou ─────────
  const fechados = await db.learningSignal.findMany({
    where: { tipo: 'foto', desfecho: { not: null } },
    select: { projectId: true, escolhido: true },
  })
  for (const sinal of fechados) {
    const id = driveFileIdDe(sinal.escolhido)
    if (id) somar(sinal.projectId, id, 'sinal')
  }

  // ── (b) PhotoUsage cuja arte recebeu "Gostei" ────────────────────────────
  // Os usos com arte ligada servem às fontes (b) e (c) — uma consulta só.
  const usos = await db.photoUsage.findMany({
    where: { generationId: { not: null } },
    select: { projectId: true, driveFileId: true, generationId: true },
  })
  const genIds = [...new Set(usos.map((u) => u.generationId).filter((g): g is string => !!g))]

  const comGostei = new Set<string>()
  if (genIds.length > 0) {
    const genPorChave = new Map(genIds.map((g) => [chaveDoFeedbackDeArte(g), g]))
    const feedbacks = await db.learningSignal.findMany({
      where: { chave: { in: [...genPorChave.keys()] } },
      select: { chave: true, escolhido: true },
    })
    for (const f of feedbacks) {
      if (vereditoDe(f.escolhido) !== 'gostei') continue
      const gen = f.chave ? genPorChave.get(f.chave) : undefined
      if (gen) comGostei.add(gen)
    }
  }
  for (const uso of usos) {
    if (uso.generationId && comGostei.has(uso.generationId)) {
      somar(uso.projectId, uso.driveFileId, 'gostei')
    }
  }

  // ── (c) Correção pós-produção: troca-de-arte → fotos da arte escolhida ───
  // O sinal grava o `generationId` da arte NOVA (a que a pessoa pôs no post);
  // o projectId da candidata é o DO SINAL, por decisão da spec.
  const trocas = await db.learningSignal.findMany({
    where: { tipo: 'troca-de-arte', generationId: { not: null } },
    select: { projectId: true, generationId: true },
  })
  const projetoPorGenDeTroca = new Map<string, number>()
  for (const t of trocas) {
    if (t.generationId) projetoPorGenDeTroca.set(t.generationId, t.projectId)
  }
  for (const uso of usos) {
    const projectId = uso.generationId ? projetoPorGenDeTroca.get(uso.generationId) : undefined
    if (projectId != null) somar(projectId, uso.driveFileId, 'correcao')
  }

  // ── Existentes: pular ativos E revogados (revogação nunca é ressemeada) ──
  const existentes = await db.photoDestaque.findMany({
    select: { projectId: true, driveFileId: true, revogadoEm: true },
  })
  const ativos = new Set<string>()
  const revogados = new Set<string>()
  for (const e of existentes) {
    const chave = `${e.projectId}|${e.driveFileId}`
    if (e.revogadoEm) revogados.add(chave)
    else ativos.add(chave)
  }

  interface LinhaDoRelatorio {
    candidatas: number
    novas: number
    jaExistiam: number
    puladasPorRevogacao: number
    porFonte: Record<Fonte, number>
  }
  const porProjeto = new Map<number, LinhaDoRelatorio>()
  const linhaDe = (projectId: number): LinhaDoRelatorio => {
    let linha = porProjeto.get(projectId)
    if (!linha) {
      linha = {
        candidatas: 0,
        novas: 0,
        jaExistiam: 0,
        puladasPorRevogacao: 0,
        porFonte: { sinal: 0, gostei: 0, correcao: 0 },
      }
      porProjeto.set(projectId, linha)
    }
    return linha
  }

  const novas: Candidata[] = []
  for (const c of candidatas.values()) {
    const chave = `${c.projectId}|${c.driveFileId}`
    const linha = linhaDe(c.projectId)
    linha.candidatas++
    for (const fonte of c.fontes) linha.porFonte[fonte]++
    if (revogados.has(chave)) linha.puladasPorRevogacao++
    else if (ativos.has(chave)) linha.jaExistiam++
    else {
      linha.novas++
      novas.push(c)
    }
  }

  const projetos = await db.project.findMany({ select: { id: true, name: true } })
  const nome = new Map(projetos.map((p) => [p.id, p.name]))

  console.log(`\n${candidatas.size} foto(s) candidata(s) a destaque, em ${porProjeto.size} cliente(s):\n`)
  const ordenado = [...porProjeto.entries()].sort((a, b) => b[1].candidatas - a[1].candidatas)
  for (const [projectId, linha] of ordenado) {
    console.log(`  ${nome.get(projectId) ?? `projeto ${projectId}`} (${projectId})`)
    console.log(
      `    candidatas: ${linha.candidatas}  novas: ${linha.novas}  já existiam: ${linha.jaExistiam}  puladas por revogação: ${linha.puladasPorRevogacao}`,
    )
    console.log(
      `    via sinais fechados: ${linha.porFonte.sinal}  via "gostei": ${linha.porFonte.gostei}  via correção: ${linha.porFonte.correcao}`,
    )
  }

  const totais = [...porProjeto.values()].reduce(
    (t, l) => ({
      novas: t.novas + l.novas,
      jaExistiam: t.jaExistiam + l.jaExistiam,
      puladasPorRevogacao: t.puladasPorRevogacao + l.puladasPorRevogacao,
    }),
    { novas: 0, jaExistiam: 0, puladasPorRevogacao: 0 },
  )
  console.log(
    `\nTotal: ${candidatas.size} candidatas → ${totais.novas} novas, ${totais.jaExistiam} já existiam, ${totais.puladasPorRevogacao} puladas por revogação.`,
  )

  if (novas.length === 0) {
    console.log('\nNada a semear.\n')
    return
  }
  if (!confirmar) {
    console.log('\nDry-run: nada foi gravado. Repita com --confirmar.\n')
    return
  }

  const r = await db.photoDestaque.createMany({
    data: novas.map((c) => ({
      projectId: c.projectId,
      driveFileId: c.driveFileId,
      origem: ORIGEM,
      decididoPor: null,
    })),
    skipDuplicates: true,
  })
  console.log(`\n✓ ${r.count} destaque(s) gravado(s) com origem "${ORIGEM}".\n`)
}

main()
  .catch((e) => {
    console.error('\n❌', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
