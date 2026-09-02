/**
 * DESTILAÇÃO da geometria (F4 do plano editor-como-usina): o que a equipe
 * muda SISTEMATICAMENTE nas peças do compositor vira PROPOSTA de ajuste da
 * assinatura — aprovada por gente, nunca aplicada sozinha (o mesmo desenho
 * dos pilares: propor → aprovar → usar).
 *
 * Duas fontes, por marca:
 *  - `LearningSignal tipo 'geometria'` (o diff do editor): mediana do fator
 *    de fonte por papel, deslocamento mediano, realinhamentos, o que a equipe
 *    esconde;
 *  - o "gostei / preciso melhorar" das peças do compositor, agrupado pela
 *    POSIÇÃO que o mapa escolheu (âncora/alinhamento) — é o placar por
 *    parâmetro, não só por peça.
 *
 * Amostra pequena é dita como pequena: `n` vai junto de todo número.
 */

import { db } from '@/lib/db'

interface DeltaGravado {
  papel: string | null
  tipo: string
  dx: number
  dy: number
  dw: number
  dh: number
  escalaDaFonte: number | null
  alinhamento: { antes: string; depois: string } | null
  visibilidade: { antes: boolean; depois: boolean } | null
}

export interface AjustePorPapel {
  papel: string
  n: number
  fonteMediana: number | null
  dxMediano: number
  dyMediano: number
  realinhamentos: Record<string, number>
  escondidas: number
}

export interface PlacarPorPosicao {
  posicao: string
  gostei: number
  melhorar: number
}

export interface DestilacaoDeGeometria {
  projectId: number
  desde: string
  sinais: number
  porPapel: AjustePorPapel[]
  placar: PlacarPorPosicao[]
  propostas: string[]
}

function mediana(v: number[]): number | null {
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export async function destilarGeometria(projectId: number, dias = 60): Promise<DestilacaoDeGeometria> {
  const desde = new Date(Date.now() - dias * 864e5)
  const sinais = await db.learningSignal.findMany({
    where: { projectId, tipo: 'geometria', decididoEm: { gte: desde } },
    select: { diff: true },
    orderBy: { decididoEm: 'desc' },
    take: 500,
  })

  const porPapel = new Map<string, { fonte: number[]; dx: number[]; dy: number[]; realinha: Record<string, number>; escondidas: number; n: number }>()
  for (const s of sinais) {
    const diff = s.diff as { deltas?: DeltaGravado[] } | null
    for (const d of diff?.deltas ?? []) {
      const papel = d.papel ?? (d.tipo === 'logo' ? 'logo' : null)
      if (!papel) continue
      const acc = porPapel.get(papel) ?? { fonte: [], dx: [], dy: [], realinha: {}, escondidas: 0, n: 0 }
      acc.n++
      if (d.escalaDaFonte !== null) acc.fonte.push(d.escalaDaFonte)
      if (d.dx || d.dy) {
        acc.dx.push(d.dx)
        acc.dy.push(d.dy)
      }
      if (d.alinhamento) {
        const k = `${d.alinhamento.antes}→${d.alinhamento.depois}`
        acc.realinha[k] = (acc.realinha[k] ?? 0) + 1
      }
      if (d.visibilidade && !d.visibilidade.depois) acc.escondidas++
      porPapel.set(papel, acc)
    }
  }

  const feedback: Array<{ posicao: string; veredito: string }> = await db.$queryRaw`
    select coalesce(g."fieldValues"->'composicao'->'posicao'->>'ancora','?') || '/' || coalesce(g."fieldValues"->'composicao'->'posicao'->>'alinha','?') as posicao,
           l."escolhido"->>'veredito' as veredito
    from "LearningSignal" l join "Generation" g on g.id = l."generationId"
    where l.tipo = 'arte' and g."projectId" = ${projectId} and g."fieldValues"->>'source' = 'compositor' and l."decididoEm" >= ${desde}`
  const placarMap = new Map<string, PlacarPorPosicao>()
  for (const f of feedback) {
    const p = placarMap.get(f.posicao) ?? { posicao: f.posicao, gostei: 0, melhorar: 0 }
    if (f.veredito === 'gostei') p.gostei++
    else if (f.veredito === 'melhorar') p.melhorar++
    placarMap.set(f.posicao, p)
  }

  const resultado: AjustePorPapel[] = [...porPapel.entries()].map(([papel, a]) => ({
    papel,
    n: a.n,
    fonteMediana: mediana(a.fonte),
    dxMediano: mediana(a.dx) ?? 0,
    dyMediano: mediana(a.dy) ?? 0,
    realinhamentos: a.realinha,
    escondidas: a.escondidas,
  }))

  const propostas: string[] = []
  for (const r of resultado) {
    if (r.n < 5) continue
    if (r.fonteMediana !== null && Math.abs(r.fonteMediana - 1) >= 0.08) {
      propostas.push(`${r.papel}: a equipe ${r.fonteMediana < 1 ? 'encolhe' : 'aumenta'} a fonte em ~${Math.round(Math.abs(1 - r.fonteMediana) * 100)}% (mediana de ${r.n} edições) — ajustar o tamanho do papel na página de assinatura.`)
    }
    if (Math.abs(r.dyMediano) >= 40) {
      propostas.push(`${r.papel}: desloca ${r.dyMediano > 0 ? 'para baixo' : 'para cima'} ~${Math.abs(Math.round(r.dyMediano))}px (n=${r.n}) — rever ${r.papel === 'logo' ? 'safeRodape/canto da marca' : 'safeTopo/safeRodape'} em Project.assinatura.`)
    }
    const realinha = Object.entries(r.realinhamentos).sort((a, b) => b[1] - a[1])[0]
    if (realinha && realinha[1] >= 3) propostas.push(`${r.papel}: realinhado ${realinha[0]} ${realinha[1]} vezes — considerar preferência de alinhamento fixa.`)
    if (r.escondidas >= 3) propostas.push(`${r.papel}: escondido ${r.escondidas} vezes — talvez o papel não devesse entrar por padrão.`)
  }
  const placar = [...placarMap.values()].sort((a, b) => b.gostei + b.melhorar - (a.gostei + a.melhorar))
  for (const p of placar) {
    const total = p.gostei + p.melhorar
    if (total >= 5 && p.melhorar / total >= 0.7) propostas.push(`posição ${p.posicao}: ${p.melhorar} de ${total} reprovadas — reduzir a preferência dessa âncora/alinhamento no rodízio.`)
  }

  return { projectId, desde: desde.toISOString(), sinais: sinais.length, porPapel: resultado, placar, propostas }
}
