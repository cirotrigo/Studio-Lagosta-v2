/**
 * O ARQUÉTIPO NA SPEC (T1a, 14/10/2026) — a ponte entre o catálogo imutável
 * (T0) e a peça. O pedido público é `{ id }` ou `{ id, versao }`; antes de
 * compor ou persistir ele vira a forma RESOLVIDA `{ id, versao, impressao }`,
 * e a peça nunca mais depende de "a mais recente". Uma spec que já traz a
 * impressão (a persistida, a fixação do medir-copy) é CONFERIDA: impressão
 * divergente é recusada, nunca corrigida.
 *
 * Aqui também moram as recusas do T1a que não dependem da medida: modelo
 * indisponível (elemento sem desenho, desde o T1b), formato, preferências em conflito, papéis e linhas máximas.
 * Puro: sem banco, sem medidor. As recusas são `CreativeError` com código
 * estável e detalhes estruturados — nunca texto descartado em silêncio.
 */
import { CreativeError } from '@/lib/creatives/errors'
import { DIMENSOES, type Formato, type Papel } from '../spec'
import { receitasDoArquetipo } from './acentos'
import { listarArquetipos, verArquetipo } from './catalogo'
import { caixaDaFoto, semFoto } from './fundo'
import { impressaoDoArquetipo } from './impressao'
import { receitaDoArcoJanela } from './mascara'
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

export interface DisponibilidadeDoArquetipo {
  disponivel: boolean
  /** Presente quando indisponível: por que e o que falta. */
  motivo?: string
}

/**
 * Desde o T1b os elementos do arquétipo (fio, moldura, spark) são materializados, presos ao texto — e, desde o #16, as
 * cantoneiras, presas à peça: um modelo só fica indisponível se declarar um elemento sem receita de desenho
 * (`receitasDoArquetipo`) — ele sairia sem a própria identidade.
 */
export function disponibilidadeDoArquetipo(a: ArquetipoDeLayout): DisponibilidadeDoArquetipo {
  const { semReceita } = receitasDoArquetipo(a)
  if (semReceita.length === 0) return { disponivel: true }
  const tipos = (a.elementos ?? []).filter((e) => semReceita.includes(e.id)).map((e) => `"${e.tipo}"`)
  return { disponivel: false, motivo: `o elemento ${tipos.join(', ')} não tem desenho no catálogo de elementos — sem ele a peça sairia sem a identidade do modelo` }
}

/** Guardados para avaliação: fora da vitrine (Layouts e ver-assinatura), mas resolvíveis por id e versão. #4: aceite adiado pelo owner (25/10/2026). #3: sem texto central sobre foto, decisão de 26/10/2026. */
const FORA_DA_VITRINE: ReadonlySet<string> = new Set(['minimal-fb-base-centro', 'minimal-fb-centro-optico'])

/**
 * Os arquétipos publicados com o que o agente precisa para pedir um (a vitrine do `ver-assinatura` e dos Layouts): a
 * versão MAIS RECENTE de cada id (#16@2) — um card por modelo. As anteriores continuam resolvíveis por `{ id, versao }`.
 * Os de `FORA_DA_VITRINE` não ganham card, mas continuam no catálogo e resolvíveis pelo id (pedido explícito e replay).
 */
export function vitrineDeArquetipos() {
  const ids = [...new Set(listarArquetipos().map((a) => a.id))].filter((id) => !FORA_DA_VITRINE.has(id))
  return ids.map((id) => verArquetipo(id)!).map((a) => {
    const d = disponibilidadeDoArquetipo(a)
    return {
      id: a.id,
      versao: a.versao,
      nome: a.nome,
      codigoTaxonomico: a.codigoTaxonomico,
      formatos: [...FORMATOS_DO_ARQUETIPO],
      disponibilidade: d.disponivel ? ('disponivel' as const) : ('indisponivel' as const),
      ...(d.motivo ? { motivo: d.motivo } : {}),
      // #15: o layout SEM foto (fundo liso claro da marca) se diz — quem escolhe não manda foto a ele.
      fundo: a.fundo ?? ('foto' as const),
      // #8: a foto em caixa diz a caixa (frações, por formato) — a prévia a desenha e o agente sabe que a foto não cobre a peça.
      ...(a.fundo === 'foto-em-caixa' ? { caixaDaFoto: Object.fromEntries(FORMATOS_DO_ARQUETIPO.flatMap((f) => (a.formatos[f].foto ? [[f, a.formatos[f].foto!]] : []))) } : {}),
      // #9: a caixa com o topo em arco diz a máscara (por formato) — o path pela MESMA conta do compor (a caixa em px de
      // `caixaDaFoto` × DIMENSOES → `receitaDoArcoJanela`), para a prévia desenhar o que a peça vai gravar.
      ...(FORMATOS_DO_ARQUETIPO.some((f) => a.formatos[f].mascaraDaFoto) ? { mascaraDaFoto: mascaraDaVitrine(a) } : {}),
      // T1b: os acentos que a peça ganha, presos ao texto (o opcional sai quando não cabe; o obrigatório recusa). #16: o
      // preso à PEÇA (as cantoneiras) se diz `ancoradoA: 'peca'` — o agente não lê um acento sem âncora.
      elementos: (a.elementos ?? []).map((e) => ({ id: e.id, tipo: e.tipo, opcional: e.opcional, corPorPapel: e.corPorPapel, ...(e.presoA ? { presoA: e.presoA } : { ancoradoA: 'peca' as const }), ...(e.porItem ? { porItem: true } : {}) })),
    }
  })
}

function mascaraDaVitrine(a: ArquetipoDeLayout) {
  return Object.fromEntries(
    FORMATOS_DO_ARQUETIPO.flatMap((f) => {
      const m = a.formatos[f].mascaraDaFoto
      const caixa = m ? caixaDaFoto(a, f, DIMENSOES[f]) : null
      return m && caixa ? [[f, { tipo: m.tipo, raio: m.raio, path: receitaDoArcoJanela({ w: caixa.width, h: caixa.height }, m.raio).path }]] : []
    }),
  )
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

/**
 * A LISTA (#15) é um item por linha autoral: linha vazia dentro dela (o respiro que o contrato permite) não é item nem
 * fio. Desenhá-la seria inventar onde ela mora; omiti-la apagaria a linha do contrato na leitura de volta — recusa.
 */
export function conferirLista(definicao: ArquetipoDeLayout, copy: CopyParaOArquetipo): void {
  const listas = new Set(definicao.papeis.filter((p) => p.lista).map((p) => p.papel as string))
  const comRespiro = (copy.blocos ?? []).filter((b) => !b.herdaDe && b.papel && listas.has(b.papel) && (b.linhas ?? []).some((l) => l.trim() === ''))
  if (comRespiro.length === 0) return
  throw new CreativeError(
    'ARQUETIPO_LISTA_COM_RESPIRO',
    `${chaveDoArquetipo(definicao)}: a lista (${comRespiro.map((b) => b.id ?? b.papel).join(', ')}) tem linha vazia — cada linha da lista é um item com o próprio fio. Tire a linha vazia (o espaço entre os itens é do modelo) ou componha sem este arquétipo.`,
    422,
    { arquetipo: chaveDoArquetipo(definicao), blocos: comRespiro.map((b) => ({ id: b.id ?? null, papel: b.papel, linhas: b.linhas ?? [] })) },
  )
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
  foto?: { url?: string | null; driveFileId?: string | null } | null
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
export function prepararArquetipo(spec: SpecComArquetipo, opcoes: { persistida?: boolean; acentosCongelados?: boolean; exigirFoto?: boolean } = {}): ArquetipoPreparado | null {
  if (!spec.arquetipo) return null
  const { definicao, resolvido } = resolverArquetipo(spec.arquetipo as ArquetipoDaSpec, opcoes)
  // A recomposição com os acentos GRAVADOS não depende do catálogo de elementos de hoje: a receita da peça é a fonte do
  // desenho (um asset que mudou não bloqueia a peça que já nasceu). As outras guardas valem igual.
  const d = opcoes.acentosCongelados ? { disponivel: true as const, motivo: undefined } : disponibilidadeDoArquetipo(definicao)
  if (!d.disponivel) {
    throw new CreativeError('ARQUETIPO_INDISPONIVEL', `${chaveDoArquetipo(definicao)} não pode ser composto: ${d.motivo}.`, 422, {
      arquetipo: chaveDoArquetipo(definicao),
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
  // CP2B: a foto vem por UMA fonte. Com `url` e `driveFileId` juntos o resolvedor desenha a URL e o catálogo protege a
  // região do ID — fotos diferentes deixariam a desenhada sem a proteção dela (Codex R3). A recomposição da mesma foto
  // manda só o `driveFileId` (`specComACopyDaPagina`).
  if (spec.foto?.url && spec.foto?.driveFileId) {
    throw new CreativeError(
      'ARQUETIPO_FOTO_AMBIGUA',
      `${chaveDoArquetipo(definicao)}: a foto veio pelo driveFileId E pela url. Com arquétipo a posição é escolhida pela foto e a região protegida vem do catálogo do arquivo: mande só uma das duas (o driveFileId do acervo, de preferência).`,
      422,
      { arquetipo: chaveDoArquetipo(definicao), foto: { url: spec.foto.url, driveFileId: spec.foto.driveFileId } },
    )
  }
  // T4-E: o arquétipo sem foto (fundo liso claro) não recebe foto — compor com ela a descartaria em silêncio, e pô-la
  // no fundo trocaria o modelo. Recusa antes de medir, no compor e no medir-copy.
  if (semFoto(definicao) && (spec.foto?.url || spec.foto?.driveFileId)) {
    throw new CreativeError(
      'ARQUETIPO_FOTO_NAO_SUPORTADA',
      `${chaveDoArquetipo(definicao)} é um layout sem foto (fundo liso claro): a foto pedida não teria lugar nele. Tire a foto da spec ou escolha um layout com foto.`,
      422,
      { arquetipo: chaveDoArquetipo(definicao), foto: { url: spec.foto?.url ?? null, driveFileId: spec.foto?.driveFileId ?? null } },
    )
  }
  // #8: a foto em caixa É o modelo — sem foto, a caixa sairia vazia. Só o COMPOR exige (`exigirFoto`): medir a copy sem a
  // foto continua permitido (a geometria do texto não depende dela), e a medição sai provisória.
  if (opcoes.exigirFoto && definicao.fundo === 'foto-em-caixa' && !spec.foto?.url && !spec.foto?.driveFileId) {
    throw new CreativeError(
      'ARQUETIPO_FOTO_AUSENTE',
      `${chaveDoArquetipo(definicao)} tem a foto numa caixa: sem foto na spec, a caixa sairia vazia. Mande a foto (o driveFileId do acervo, de preferência) ou escolha um layout sem foto. Nada foi composto nem gravado.`,
      422,
      { arquetipo: chaveDoArquetipo(definicao) },
    )
  }
  const formato = spec.formato as FormatoDoArquetipo
  const { coincidentes } = conferirPreferencias(definicao, spec.preferencias)
  conferirPapeis(definicao, spec)
  conferirLista(definicao, spec)
  return { definicao, resolvido, formato, preferenciasCoincidentes: coincidentes }
}
