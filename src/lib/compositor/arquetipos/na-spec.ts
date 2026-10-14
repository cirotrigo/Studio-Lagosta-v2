/**
 * O ARQUÉTIPO NA SPEC (T1a, 14/10/2026) — a ponte entre o catálogo imutável
 * (T0) e a peça. O pedido público é `{ id }` ou `{ id, versao }`; antes de
 * compor ou persistir ele vira a forma RESOLVIDA `{ id, versao, impressao }`,
 * e a peça nunca mais depende de "a mais recente". Uma spec que já traz a
 * impressão (a persistida, a fixação do medir-copy) é CONFERIDA: impressão
 * divergente é recusada, nunca corrigida.
 *
 * Aqui também moram as recusas do T1a que não dependem da medida: modelo
 * indisponível, formato, preferências em conflito, papéis e linhas máximas.
 * Puro: sem banco, sem medidor. As recusas são `CreativeError` com código
 * estável e detalhes estruturados — nunca texto descartado em silêncio.
 */
import { CreativeError } from '@/lib/creatives/errors'
import type { Formato, Papel } from '../spec'
import { listarArquetipos, verArquetipo } from './catalogo'
import { impressaoDoArquetipo } from './impressao'
import { chaveDoArquetipo, FORMATOS_DO_ARQUETIPO, type ArquetipoDeLayout, type FormatoDoArquetipo, type PapelDeTexto } from './tipos'

/** O que a spec carrega. Pedido público: só `id` (e talvez `versao`); resolvido: os três. */
export interface ArquetipoDaSpec {
  id: string
  versao?: number
  impressao?: string
}

/** A forma resolvida — a única que se compõe e se persiste. */
export interface ArquetipoResolvido {
  id: string
  versao: number
  impressao: string
}

export interface DisponibilidadeNoT1a {
  disponivel: boolean
  /** Presente quando indisponível: por que e o que falta. */
  motivo?: string
  aguarda?: 'T1b'
}

/**
 * O T1a não materializa elementos (fio, moldura, spark — é o T1b). Um modelo cujo
 * elemento é OBRIGATÓRIO sairia sem a própria identidade: fica indisponível até
 * lá (hoje, o `minimal-fb-base-esquerda`, com a moldura-aberta em L). Elemento
 * opcional não impede: só não é desenhado, e o diagnóstico diz.
 */
export function disponibilidadeNoT1a(a: ArquetipoDeLayout): DisponibilidadeNoT1a {
  const obrigatorios = (a.elementos ?? []).filter((e) => !e.opcional)
  if (obrigatorios.length === 0) return { disponivel: true }
  return {
    disponivel: false,
    aguarda: 'T1b',
    motivo: `o elemento obrigatório ${obrigatorios.map((e) => `"${e.tipo}"`).join(', ')} é materializado no T1b — sem ele a peça sairia sem a identidade do modelo`,
  }
}

/** Os arquétipos publicados com o que o agente precisa para pedir um (a vitrine do `ver-assinatura`). */
export function vitrineDeArquetipos() {
  return listarArquetipos().map((a) => {
    const d = disponibilidadeNoT1a(a)
    return {
      id: a.id,
      versao: a.versao,
      nome: a.nome,
      codigoTaxonomico: a.codigoTaxonomico,
      formatos: [...FORMATOS_DO_ARQUETIPO],
      disponibilidade: d.disponivel ? ('disponivel' as const) : ('aguarda-t1b' as const),
      ...(d.motivo ? { motivo: d.motivo } : {}),
    }
  })
}

/**
 * Resolve o pedido para a definição exata. Sem `versao`, a MAIS RECENTE — mas só
 * quando `persistida` é falso: a spec de uma peça que já nasceu (recomposição)
 * tem de dizer a versão, e a falta dela é recusada em vez de cair na mais recente.
 */
export function resolverArquetipo(pedido: ArquetipoDaSpec, opcoes: { persistida?: boolean } = {}): { definicao: ArquetipoDeLayout; resolvido: ArquetipoResolvido } {
  if (!pedido || typeof pedido.id !== 'string' || !pedido.id) {
    throw new CreativeError('ARQUETIPO_DESCONHECIDO', 'O arquétipo pedido não tem id.', 422, { arquetipo: pedido ?? null })
  }
  if (pedido.impressao !== undefined && pedido.versao === undefined) {
    throw new CreativeError('ARQUETIPO_VERSAO_AUSENTE', `A impressão de "${pedido.id}" veio sem a versão: impressão só se confere contra uma versão exata.`, 422, { arquetipo: pedido })
  }
  if (opcoes.persistida && pedido.versao === undefined) {
    throw new CreativeError(
      'ARQUETIPO_VERSAO_AUSENTE',
      `A peça persistida pede o arquétipo "${pedido.id}" sem versão — a recomposição nunca resolve a mais recente (a peça perderia a definição com que nasceu).`,
      422,
      { arquetipo: pedido },
    )
  }
  if (opcoes.persistida && pedido.impressao === undefined) {
    // Toda peça composta grava a impressão: sem ela, a equivalência com a definição de hoje seria PRESUMIDA.
    throw new CreativeError(
      'ARQUETIPO_IMPRESSAO_AUSENTE',
      `A peça persistida pede ${pedido.id}@${pedido.versao} sem a impressão — sem ela não há como provar que a definição é a mesma com que a peça nasceu.`,
      422,
      { arquetipo: pedido },
    )
  }
  const maisRecente = verArquetipo(pedido.id)
  if (!maisRecente) {
    throw new CreativeError('ARQUETIPO_DESCONHECIDO', `O arquétipo "${pedido.id}" não existe no catálogo. Consulte ver-assinatura (campo arquetipos).`, 422, {
      arquetipo: pedido,
      disponiveis: listarArquetipos().map(chaveDoArquetipo),
    })
  }
  const definicao = pedido.versao === undefined ? maisRecente : verArquetipo(pedido.id, pedido.versao)
  if (!definicao) {
    throw new CreativeError('ARQUETIPO_VERSAO_INEXISTENTE', `O arquétipo "${pedido.id}" não tem a versão ${pedido.versao}.`, 422, {
      arquetipo: pedido,
      versoes: listarArquetipos().filter((a) => a.id === pedido.id).map((a) => a.versao),
    })
  }
  const impressao = impressaoDoArquetipo(definicao)
  if (pedido.impressao !== undefined && pedido.impressao !== impressao) {
    throw new CreativeError(
      'ARQUETIPO_IMPRESSAO_DIVERGENTE',
      `A impressão gravada de ${chaveDoArquetipo(definicao)} (${pedido.impressao}) não é a da definição publicada (${impressao}): a peça não reproduz a definição com que nasceu, e a equivalência não é presumida.`,
      422,
      { arquetipo: pedido, impressaoEsperada: impressao, impressaoRecebida: pedido.impressao },
    )
  }
  return { definicao, resolvido: { id: definicao.id, versao: definicao.versao, impressao } }
}

/** As preferências da spec que o arquétipo também decide. */
interface PreferenciasPosicionais {
  ancora?: string
  alinha?: string
  cantoDaMarca?: string
}

/**
 * Âncora, alinhamento e canto da marca são do arquétipo: a spec que pede outro
 * valor é recusada (duas decisões para a mesma posição); a que pede o MESMO é
 * aceita e vira diagnóstico. `auto` não é pedido — fica com o arquétipo.
 */
export function conferirPreferencias(definicao: ArquetipoDeLayout, pref: PreferenciasPosicionais | null | undefined): { coincidentes: Array<'ancora' | 'alinha' | 'cantoDaMarca'> } {
  const coincidentes: Array<'ancora' | 'alinha' | 'cantoDaMarca'> = []
  const conflitos: Array<{ campo: string; pedido: string; doArquetipo: string }> = []
  for (const campo of ['ancora', 'alinha', 'cantoDaMarca'] as const) {
    const pedido = pref?.[campo]
    if (pedido === undefined || pedido === 'auto') continue
    const doArquetipo = definicao.preferencias[campo]
    if (pedido === doArquetipo) coincidentes.push(campo)
    else conflitos.push({ campo, pedido, doArquetipo })
  }
  if (conflitos.length > 0) {
    throw new CreativeError(
      'ARQUETIPO_PREFERENCIA_CONFLITANTE',
      `${chaveDoArquetipo(definicao)} já decide ${conflitos.map((c) => `${c.campo} (${c.doArquetipo})`).join(', ')}, e a spec pede ${conflitos.map((c) => c.pedido).join(', ')}. A geometria tem uma fonte só: tire a preferência ou peça o mesmo valor.`,
      422,
      { arquetipo: chaveDoArquetipo(definicao), conflitos },
    )
  }
  return { coincidentes }
}

/** A parte da spec que a conferência de papéis lê. */
export interface CopyParaOArquetipo {
  blocos?: Array<{ papel?: Papel; linhas?: string[]; id?: string; herdaDe?: Papel }>
  camadasExtras?: Array<{ id?: string; herdaDe?: Papel }> | null
}

const temTexto = (linhas: string[] | undefined) => (linhas ?? []).some((l) => l.trim() !== '')

/**
 * Copy × arquétipo, ANTES de compor. Papel que o arquétipo não tem (o `cta` não
 * existe nos modelos do T0), papel obrigatório ausente e texto sem mapeamento
 * 1:1 (camada extra, bloco com `herdaDe`) são recusados — nunca ocultados,
 * convertidos em outro papel ou jogados numa posição genérica.
 */
export function conferirPapeis(definicao: ArquetipoDeLayout, copy: CopyParaOArquetipo): void {
  const doArquetipo = new Set<string>(definicao.papeis.map((p) => p.papel))
  const blocos = copy.blocos ?? []
  const comuns = blocos.filter((b) => !b.herdaDe)
  const naoSuportados = [...new Set(comuns.map((b) => b.papel).filter((p): p is Papel => !!p && !doArquetipo.has(p)))]
  const extras = [...blocos.filter((b) => b.herdaDe).map((b) => b.id ?? `${b.papel}`), ...(copy.camadasExtras ?? []).map((c) => c.id ?? `extra:${c.herdaDe}`)]
  const presentes = new Set(comuns.filter((b) => temTexto(b.linhas)).map((b) => b.papel))
  const faltam = definicao.papeis.filter((p) => p.obrigatorio && p.papel !== 'logo' && !presentes.has(p.papel as Papel)).map((p) => p.papel)
  if (naoSuportados.length === 0 && extras.length === 0 && faltam.length === 0) return
  const partes = [
    ...(naoSuportados.length > 0 ? [`papel sem lugar no arquétipo: ${naoSuportados.join(', ')}`] : []),
    ...(faltam.length > 0 ? [`papel obrigatório ausente: ${faltam.join(', ')}`] : []),
    ...(extras.length > 0 ? [`camada extra / herança sem mapeamento 1:1 no T1a: ${extras.join(', ')}`] : []),
  ]
  throw new CreativeError(
    'ARQUETIPO_PAPEIS_INCOMPATIVEIS',
    `A copy não cabe em ${chaveDoArquetipo(definicao)} — ${partes.join('; ')}. Nenhum texto foi descartado: ajuste a copy ou componha sem arquétipo.`,
    422,
    { arquetipo: chaveDoArquetipo(definicao), naoSuportados, faltam, extras, papeisDoArquetipo: [...doArquetipo] },
  )
}

/**
 * `linhasMax` é HARD: as linhas COM TEXTO de cada papel (a segunda voz é parte
 * da manchete) não passam do teto do formato. `caracteresPorLinha` é SOFT e não
 * recusa nada — quem decide se a linha cabe é a medição.
 */
export function excessosDeLinhas(definicao: ArquetipoDeLayout, formato: FormatoDoArquetipo, copy: CopyParaOArquetipo): Array<{ papel: Papel; linhas: number; linhasMax: number }> {
  const limites = definicao.formatos[formato].limitesDeTexto
  return (copy.blocos ?? [])
    .filter((b) => !b.herdaDe && b.papel)
    .flatMap((b) => {
      const limite = limites[b.papel as PapelDeTexto]
      const linhas = (b.linhas ?? []).filter((l) => l.trim() !== '').length
      return limite && linhas > limite.linhasMax ? [{ papel: b.papel!, linhas, linhasMax: limite.linhasMax }] : []
    })
}

/** O compositor recusa o excesso de `linhasMax`; o medir-copy só o declara (ver `excessosDeLinhas`). */
export function conferirLinhas(definicao: ArquetipoDeLayout, formato: FormatoDoArquetipo, copy: CopyParaOArquetipo): void {
  const excedidas = excessosDeLinhas(definicao, formato, copy)
  if (excedidas.length === 0) return
  throw new CreativeError(
    'ARQUETIPO_LINHAS_EXCEDIDAS',
    `${chaveDoArquetipo(definicao)} no ${formato}: ${excedidas.map((e) => `${e.papel} tem ${e.linhas} linhas e o máximo é ${e.linhasMax}`).join('; ')}.`,
    422,
    { arquetipo: chaveDoArquetipo(definicao), formato, excedidas },
  )
}

/** A logo é papel obrigatório dos arquétipos do T0: marca sem logo não compõe com eles (nem mede como se compusesse). */
export function conferirLogo(definicao: ArquetipoDeLayout, temLogo: boolean): void {
  if (temLogo || !definicao.papeis.some((p) => p.papel === 'logo' && p.obrigatorio)) return
  throw new CreativeError('ARQUETIPO_PAPEIS_INCOMPATIVEIS', `${chaveDoArquetipo(definicao)} pede a logo, e a marca não tem logo (página de assinatura ou logo do projeto).`, 422, {
    arquetipo: chaveDoArquetipo(definicao),
    naoSuportados: [],
    faltam: ['logo'],
    extras: [],
  })
}

/** A parte da spec que a preparação do arquétipo lê. */
export interface SpecComArquetipo extends CopyParaOArquetipo {
  /** Com `strict: false`, `z.infer` marca tudo como opcional — a garantia é a validação de runtime. */
  formato?: Formato
  arquetipo?: Partial<ArquetipoDaSpec> | null
  preferencias?: PreferenciasPosicionais | null
  selecaoExperimental?: boolean
}

export interface ArquetipoPreparado {
  definicao: ArquetipoDeLayout
  resolvido: ArquetipoResolvido
  formato: FormatoDoArquetipo
  /** As preferências da spec que coincidem com as do arquétipo (aceitas; a geometria veio do arquétipo). */
  preferenciasCoincidentes: Array<'ancora' | 'alinha' | 'cantoDaMarca'>
}

/**
 * Tudo o que o T1a confere antes de medir, na ordem: resolução (e impressão),
 * disponibilidade, formato, seleção experimental, preferências e papéis. As
 * linhas máximas ficam fora (o compositor recusa com `conferirLinhas`, o
 * medir-copy declara com `excessosDeLinhas`). Sem `spec.arquetipo`, `null` — e
 * nada muda.
 */
export function prepararArquetipo(spec: SpecComArquetipo, opcoes: { persistida?: boolean } = {}): ArquetipoPreparado | null {
  if (!spec.arquetipo) return null
  const { definicao, resolvido } = resolverArquetipo(spec.arquetipo as ArquetipoDaSpec, opcoes)
  const d = disponibilidadeNoT1a(definicao)
  if (!d.disponivel) {
    throw new CreativeError('ARQUETIPO_INDISPONIVEL', `${chaveDoArquetipo(definicao)} ainda não pode ser composto: ${d.motivo}.`, 422, {
      arquetipo: chaveDoArquetipo(definicao),
      aguarda: d.aguarda,
    })
  }
  if (!FORMATOS_DO_ARQUETIPO.includes(spec.formato as FormatoDoArquetipo)) {
    throw new CreativeError(
      'ARQUETIPO_FORMATO_NAO_SUPORTADO',
      `${chaveDoArquetipo(definicao)} define ${FORMATOS_DO_ARQUETIPO.join(' e ')}; o formato "${spec.formato}" não é aproximado por nenhum deles.`,
      422,
      { arquetipo: chaveDoArquetipo(definicao), formato: spec.formato, formatos: [...FORMATOS_DO_ARQUETIPO] },
    )
  }
  if (spec.selecaoExperimental) {
    throw new CreativeError('ARQUETIPO_SELECAO_NAO_SUPORTADA', 'A seleção experimental de combinação não compõe com arquétipo no T1a: peça um ou outro.', 422, {
      arquetipo: chaveDoArquetipo(definicao),
    })
  }
  const formato = spec.formato as FormatoDoArquetipo
  const { coincidentes } = conferirPreferencias(definicao, spec.preferencias)
  conferirPapeis(definicao, spec)
  return { definicao, resolvido, formato, preferenciasCoincidentes: coincidentes }
}
