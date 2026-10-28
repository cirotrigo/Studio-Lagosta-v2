/**
 * CP-T2 (24/10/2026): o que uma PÁGINA do editor oferece a um layout (arquétipo) — os textos por papel e a foto — e
 * a spec que o compositor recebe para nascer a página NOVA (`POST /api/templates/[id]/pages/from-layout`).
 *
 * A origem nunca muda: daqui só se LÊ. O texto que o arquétipo não posiciona (sem papel, `cta` fora do #15, papel fora
 * do modelo) não entra na peça e volta DITO em `foraDoLayout`; o papel obrigatório que a página não tem entra com o
 * placeholder, e a página nasce "(rascunho)". Origem COM contrato de copy: a spec é o contrato recortado
 * (`contratoDoLayout`); `specDoLayout` (blocos lidos das camadas) é só a origem sem contrato.
 *
 * Módulo PURO.
 */
import type { Layer } from '@/types/template'
import { tentarAplicarRevisao, type BlocoAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { papelDoTexto } from '@/lib/font-combinations-capture'
import { linhasComColchetes } from '../destaques'
import type { Bloco, Formato, Papel, SpecDePeca } from '../spec'
import type { ArquetipoDeLayout, PapelDeTexto } from './tipos'

/** O texto do papel obrigatório que a página não trouxe — é o que a equipe troca no editor. */
export const PLACEHOLDER_DO_PAPEL: Record<PapelDeTexto, string> = {
  pre: 'Pré-título',
  headline: 'Título',
  apoio: 'Texto de apoio',
  servico: 'Serviço',
  cta: 'Chamada',
}

/** Fração da página que a maior imagem precisa cobrir para ser "a foto" quando não há `bg-foto`. */
export const COBERTURA_MINIMA_DA_FOTO = 0.9

export interface TextoForaDoLayout {
  camada: string
  nome: string
  motivo: 'sem-papel' | 'papel-fora-do-layout'
  papel?: Papel
}

/** As linhas de um texto: o rich-text leva o destaque como [colchetes] (a marcação que o compositor lê). */
function linhasDaCamada(c: Layer): string[] {
  const linhas = linhasComColchetes(c) ?? (typeof c.content === 'string' ? c.content : '').split('\n')
  return linhas.map((l) => l.replace(/\r$/, ''))
}

/**
 * Os textos visíveis da página por papel (`metadata.compositor.papel`, depois o nome da camada — `papelDoTexto`), na
 * ordem de leitura da página (de cima para baixo). A segunda voz (`headline2`) volta para a manchete, depois dela:
 * quem decide a voz é a assinatura. O texto que o arquétipo não posiciona fica em `foraDoLayout`.
 */
export function textosDaPagina(camadas: Layer[], definicao: Pick<ArquetipoDeLayout, 'papeis'>) {
  const lugares = new Set<string>(definicao.papeis.map((p) => p.papel))
  const porPapel = new Map<PapelDeTexto, string[]>()
  const foraDoLayout: TextoForaDoLayout[] = []
  const textos = camadas
    .filter(
      (c) =>
        (c.type === 'text' || c.type === 'rich-text') &&
        c.visible !== false &&
        typeof c.content === 'string' &&
        c.content.trim() !== '',
    )
    .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0))
  // A segunda voz depois da manchete, qualquer que seja a altura dela na página.
  const ordenados = [
    ...textos.filter((c) => papelDoTexto(c) !== 'headline2'),
    ...textos.filter((c) => papelDoTexto(c) === 'headline2'),
  ]
  for (const c of ordenados) {
    const lido = papelDoTexto(c) as Papel | null
    const papel = (lido === 'headline2' ? 'headline' : lido) as Papel | null
    if (!papel) {
      foraDoLayout.push({ camada: c.id, nome: c.name, motivo: 'sem-papel' })
      continue
    }
    if (!lugares.has(papel)) {
      foraDoLayout.push({
        camada: c.id,
        nome: c.name,
        motivo: 'papel-fora-do-layout',
        papel,
      })
      continue
    }
    const chave = papel as PapelDeTexto
    porPapel.set(chave, [...(porPapel.get(chave) ?? []), ...linhasDaCamada(c)])
  }
  return { porPapel, foraDoLayout }
}

/**
 * A foto da página para o layout: a camada `bg-foto`; senão a MAIOR imagem visível que cubra ≥ 90% da página.
 * `null` = a página não tem foto (a rota responde 409 `LAYOUT_SEM_FOTO`).
 */
// ponytail: cobertura pelo retângulo sem rotação; imagem girada conta como se estivesse reta.
export function fotoDaPaginaParaLayout(camadas: Layer[], pagina: { width: number; height: number }): string | null {
  const imagens = camadas.filter(
    (c) => c.type === 'image' && c.visible !== false && typeof c.fileUrl === 'string' && c.fileUrl !== '',
  )
  const fundo = imagens.find((c) => c.id === 'bg-foto')
  if (fundo) return fundo.fileUrl!
  const areaDaPagina = pagina.width * pagina.height
  if (!(areaDaPagina > 0)) return null
  const cobertura = (c: Layer) => {
    const x0 = Math.max(0, c.position?.x ?? 0)
    const y0 = Math.max(0, c.position?.y ?? 0)
    const x1 = Math.min(pagina.width, (c.position?.x ?? 0) + (c.size?.width ?? 0))
    const y1 = Math.min(pagina.height, (c.position?.y ?? 0) + (c.size?.height ?? 0))
    return (Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) / areaDaPagina
  }
  const maior = imagens
    .map((c) => ({ c, cobre: cobertura(c) }))
    .filter((i) => i.cobre >= COBERTURA_MINIMA_DA_FOTO)
    .sort((a, b) => b.cobre - a.cobre)[0]
  return maior ? maior.c.fileUrl! : null
}

/**
 * A spec do layout: os blocos na ordem de leitura do arquétipo, com o placeholder no papel obrigatório que faltou.
 * O pedido do arquétipo vai como veio (`{ id }` ou `{ id, versao }`): a resolução, a impressão e as recusas são do
 * compositor (`prepararArquetipo`), nunca daqui.
 */
export function specDoLayout(args: {
  projectId: number
  formato: Formato
  arquetipo: { id: string; versao?: number }
  definicao: Pick<ArquetipoDeLayout, 'papeis'>
  /** `null` só no layout sem foto (T4-E, fundo liso claro): a spec não leva foto. */
  fotoUrl: string | null
  porPapel: Map<PapelDeTexto, string[]>
}): { spec: SpecDePeca; placeholders: PapelDeTexto[] } {
  const placeholders: PapelDeTexto[] = []
  const blocos: Bloco[] = []
  for (const p of [...args.definicao.papeis].sort((a, b) => a.ordemDeLeitura - b.ordemDeLeitura)) {
    if (p.papel === 'logo') continue
    const linhas = args.porPapel.get(p.papel)
    if (linhas?.length) blocos.push({ papel: p.papel, linhas })
    else if (p.obrigatorio) {
      placeholders.push(p.papel)
      blocos.push({ papel: p.papel, linhas: [PLACEHOLDER_DO_PAPEL[p.papel]] })
    }
  }
  return {
    spec: {
      projectId: args.projectId,
      formato: args.formato,
      ...(args.fotoUrl ? { foto: { url: args.fotoUrl } } : {}),
      blocos,
      arquetipo: { ...args.arquetipo },
    },
    placeholders,
  }
}

/**
 * O CONTRATO da copy da origem (já confrontado com as camadas dela) recortado ao arquétipo — rodada 1 da T2. Com
 * contrato, a spec do layout é ELE (nunca blocos legados): a segunda voz declarada (`linhasNaVoz2`), os ids, a ordem e
 * o histórico de autoria seguem; sem isso, a divisão legada da manchete voltaria a valer.
 *
 * O recorte é UMA revisão do `sistema`, superfície `layout`, registrada por `tentarAplicarRevisao`: o bloco sem lugar
 * no arquétipo (`cta`, `livre`, papel que ele não posiciona) sai com o que dizia em `removidos`; o papel obrigatório
 * sem texto ganha o placeholder (bloco novo, ou o bloco vazio preenchido), escrito pelo sistema e dito no motivo —
 * nenhuma autoria é atribuída a quem não escreveu. Sem recorte, o contrato volta como veio. `ok: false` quando o
 * leitor recusa a revisão (histórico cheio, por exemplo): quem chama decide, com o aviso.
 */
export function contratoDoLayout(
  contrato: CopyAutoral,
  definicao: Pick<ArquetipoDeLayout, 'id' | 'papeis'>,
  opcoes: { em?: string } = {},
):
  | { ok: true; contrato: CopyAutoral; placeholders: PapelDeTexto[]; removidos: string[] }
  | { ok: false; aviso: string } {
  const lugares = new Set<string>(definicao.papeis.map((p) => p.papel))
  const removidos = contrato.blocos.filter((b) => !lugares.has(b.funcao)).map((b) => b.id)
  // A ordem de leitura do contrato é contígua (0..n-1): tirar um bloco do meio abriria buraco e o leitor recusaria.
  // Os que ficam são renumerados na MESMA ordem relativa — a mudança de `ordem` entra na revisão do sistema.
  const blocos: BlocoAutoral[] = contrato.blocos
    .filter((b) => lugares.has(b.funcao))
    .sort((a, b) => a.ordem - b.ordem)
    .map((b, ordem) => ({ ...b, ordem, linhas: [...b.linhas] }))
  const ids = new Set(contrato.blocos.map((b) => b.id))
  let proximaOrdem = blocos.length
  const placeholders: PapelDeTexto[] = []
  for (const p of [...definicao.papeis].sort((a, b) => a.ordemDeLeitura - b.ordemDeLeitura)) {
    if (p.papel === 'logo' || !p.obrigatorio) continue
    const doPapel = blocos.filter((b) => b.funcao === p.papel)
    if (doPapel.some((b) => b.linhas.some((l) => l.trim() !== ''))) continue
    placeholders.push(p.papel)
    if (doPapel.length > 0) {
      doPapel[0].linhas = [PLACEHOLDER_DO_PAPEL[p.papel]]
      continue
    }
    let id: string = p.papel
    for (let n = 2; ids.has(id); n++) id = `${p.papel}-${n}`
    ids.add(id)
    blocos.push({ id, funcao: p.papel, ordem: proximaOrdem++, linhas: [PLACEHOLDER_DO_PAPEL[p.papel]] })
  }
  if (removidos.length === 0 && placeholders.length === 0) return { ok: true, contrato, placeholders, removidos }
  const motivo = [
    removidos.length
      ? `${removidos.length} bloco(s) sem lugar no layout ${definicao.id} ficaram fora da página nova`
      : null,
    placeholders.length
      ? `placeholder do sistema no papel obrigatório sem texto (${placeholders.join(', ')}) — troque o texto`
      : null,
  ]
    .filter(Boolean)
    .join('; ')
  const r = tentarAplicarRevisao(contrato, blocos, {
    autor: 'sistema',
    motivo,
    superficie: 'layout',
    ...(opcoes.em ? { em: opcoes.em } : {}),
  })
  if (!r.copy)
    return {
      ok: false,
      aviso: `o contrato da copy da origem não comportou o recorte do layout (${r.problemas.map((p) => p.mensagem).join('; ')})`,
    }
  return { ok: true, contrato: r.copy, placeholders, removidos }
}

/** "Layout — <preset>", e "(rascunho)" quando algum texto é placeholder. */
export function nomeDaPaginaDoLayout(nomeDoPreset: string, comPlaceholder: boolean): string {
  return `Layout — ${nomeDoPreset}${comPlaceholder ? ' (rascunho)' : ''}`
}

/** As tags da página nascida de layout (o plano CP-T2): ela é conteúdo, não modelo. */
export function tagsDaPaginaDoLayout(arquetipoId: string): string[] {
  return ['layout', `arquetipo:${arquetipoId}`]
}
