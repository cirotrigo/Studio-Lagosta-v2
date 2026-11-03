/**
 * A PREPARAÇÃO DOS BLOCOS de uma peça — o trecho da composição que vai da copy
 * por papel aos blocos MEDIDOS: agrupamento pela página de assinatura, escolha
 * do arranjo de cada grupo (o da página ou uma combinação salva), distribuição
 * das linhas pelos textos do arranjo (horário no texto do horário, endereço no
 * do endereço), a manchete em duas vozes, o estilo de cada texto e a montagem
 * com a régua (`montarBloco`).
 *
 * Vivia dentro de `comporPeca`. Saiu para cá (PR 8 de "Marca simples, copy
 * melhor", 12/09/2026) porque o `medir-copy` tem de medir EXATAMENTE o que a
 * composição montaria — mesmos arranjos, mesma divisão de linhas, mesmos
 * estilos, mesma segunda voz, mesma quantidade de blocos. Uma medição paralela
 * por `assinatura.papeis[papel]` dizia "cabe" para uma copy que a composição
 * recusava (R01 da revisão do Codex). Módulo PURO: o medidor é injetado.
 */
import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { blocosDeServico } from '@/lib/ai/blocos-de-servico'
import type { AssinaturaDaMarca, EstiloDePapel, NumerosDaAssinatura } from './assinatura'
import { camadaDoPapel, colunaDaCaixa, montarBloco, type BlocoMontado, type OrcamentoDeLinha, type RecusaDeBloco } from './blocos'
import { arranjosDaPagina, distribuirLinhas, escolherArranjo, type ArranjoDeGrupo, type ElementoDoArranjo } from './combinacoes'
import { destaqueDoPapel, type EstiloDeDestaque } from './destaques'
import { dividirManchete } from './segunda-voz'
import type { GrupoVisual, Papel } from './spec'
import type { EstiloDaReferencia } from './arquetipos/tipos'
import { vestirEstiloDaReferencia, type EstiloVestido } from './arquetipos/estilo-da-referencia'
import { chaveDoGrupoExtra, estiloHerdado, resolverCamadasExtras, type BlocoResolvido, type CamadaExtraDaSpec, type IdentidadeDoExtra, type FalhaDeResolucao } from './camadas-extras'

export function hashDe(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** A copy e o contexto da peça que a preparação lê — o subconjunto da spec. */
export interface PecaParaBlocos {
  /** Com `strict: false`, `z.infer` marca as chaves como opcionais — a garantia é a validação de runtime (`validarSpec`). */
  blocos?: Array<{ papel?: Papel; linhas?: string[]; id?: string; herdaDe?: Papel; grupoVisual?: GrupoVisual }>
  /** F3: as camadas extras (blocos `livre` do contrato com herança de estilo). */
  camadasExtras?: CamadaExtraDaSpec[] | null
  nome?: string | null
  tema?: string | null
  foto?: { driveFileId?: string; url?: string } | null
  copyAutoral?: { blocos?: Array<{ id?: string; funcao?: string; linhas?: string[]; estilo?: { linhasNaVoz2?: number[] | null; herdaDe?: string | null } | null }> } | null
  preferencias?: { arranjos?: Array<string | { grupo?: string; arranjo?: string }> } | null
}

/**
 * A CHAVE da peça — a mesma para o rodízio de variantes (`carregarAssinatura`),
 * o rodízio de arranjos e o de posição. Definida num lugar só para a medição e
 * a composição escolherem igual (R02).
 */
export function chaveDaPeca(spec: PecaParaBlocos): string {
  return `${spec.nome ?? ''}|${spec.tema ?? ''}|${spec.foto?.driveFileId ?? spec.foto?.url ?? ''}|${((spec.blocos ?? [])[0]?.linhas ?? []).join(' ')}`
}

export function estiloDeDestaqueDoPapel(estilo: EstiloDePapel, padrao: NumerosDaAssinatura['destaque'], familias: string[]): EstiloDeDestaque | null {
  // A regra (página manda; família pesada DO papel; alternativa quando o papel
  // já é da cor de destaque) mora no módulo puro, com teste.
  return destaqueDoPapel({ daPagina: estilo.destaque, padrao, corDoPapel: estilo.color, familiaDoPapel: estilo.fontFamily, familias })
}

export interface BlocoPreparado extends BlocoMontado {
  chave: string
  /** As linhas da copy que entraram neste texto (sem prefixo, com [colchetes] como vieram). */
  linhasDaCopy: string[]
  /** O estilo com que o texto foi medido (do arranjo ou da assinatura). */
  estilo: EstiloDePapel
  /** O estilo de destaque com que a montagem mediu os [colchetes] (null = sem estilo na marca). */
  destaque: EstiloDeDestaque | null
  /** F3: a função que o bloco cumpre na copy (o papel, ou a do extra: papel original ou `livre`). */
  funcao: string
  /** F3: presente quando o bloco é uma camada extra (o `papel` é só o de estilo). */
  extra?: IdentidadeDoExtra
  /** A coluna de tinta com que o bloco foi MEDIDO (px) — o medir-copy lê daqui, nunca a recalcula. */
  coluna: number
  /** As posições, no bloco do AUTOR, das linhas que este texto desenha — a ordem de leitura da copy. */
  indicesDoBloco: number[]
  /** F2c: na peça por referência com `corpos` — o corpo desenhado (px), o teto e o piso deste bloco (px) e o corpo efetivo. */
  corpo?: CorpoDoBloco
  /** F2d: na peça por referência com `estilos` — a origem de cada campo do estilo efetivo (referência, assinatura ou arranjo). */
  estiloDaReferencia?: EstiloVestido['origem']
}

/** F2c: o corpo da referência como este bloco o viu — todos em px do canvas. */
export interface CorpoDoBloco {
  referencia: number
  teto: number
  piso: number
  /** O corpo com que o bloco saiu (`layer.style.fontSize`); ausente na recusa. */
  efetivo?: number
}

export interface RecusaPreparada {
  papel: Papel
  funcao: string
  extra?: IdentidadeDoExtra
  id: string
  linhasDaCopy: string[]
  estilo: EstiloDePapel
  /** As famílias que ENTRARAM na medição — a resposta de quem mediu (PR4-R2-01). */
  familiasMedidas: string[]
  /** O estilo de destaque com que a montagem mediu os [colchetes] (null = sem estilo na marca). */
  destaque: EstiloDeDestaque | null
  orcamento: OrcamentoDeLinha[]
  /** A coluna de tinta com que o bloco foi MEDIDO (px). */
  coluna: number
  /** Com arquétipo: a altura que não coube na capacidade da referência (ver `RecusaDeBloco.altura`). */
  altura?: RecusaDeBloco['altura']
  /** Com arquétipo: as linhas que se desenham em mais de uma linha na coluna (ver `RecusaDeBloco.quebras`). */
  quebras?: RecusaDeBloco['quebras']
  /** F2c: o corpo da referência com que o bloco foi medido (a recusa diz o piso em px, não "80 %"). */
  corpo?: CorpoDoBloco
  /** F2d: a origem de cada campo do estilo com que a recusa foi medida. */
  estiloDaReferencia?: EstiloVestido['origem']
}

/**
 * F2d: o estilo com que a recusa foi MEDIDA, materializado no piso por `camadaDoPapel` — o mesmo objeto no `compor` e no
 * `medir-copy`. É a camada quem resolve o espaçamento: pelo contrato da referência quando há (`2,38` em 31 px), e pela
 * escala de sempre quando não há — a segunda voz, que só recebe a cor, publica `letterSpacing × piso/base`, não a reserva
 * da base (Codex F2d R3).
 */
export function estiloDaRecusa(r: RecusaPreparada, escalaDoFormato: number, corDaMancha: string): { fontFamily: string; fontWeight: number | null; textTransform: string | null; letterSpacing: number; color: string; origem: EstiloVestido['origem'] } | null {
  if (!r.estiloDaReferencia) return null
  const noPiso = camadaDoPapel({ papel: r.papel, linhas: r.linhasDaCopy, estilo: r.estilo, escala: r.corpo ? r.corpo.piso / r.estilo.fontSize : escalaDoFormato, width: r.coluna, textAlign: 'left', groupId: 'medicao', corDaMancha })
  return {
    fontFamily: String(noPiso.style?.fontFamily ?? r.estilo.fontFamily),
    fontWeight: typeof noPiso.style?.fontWeight === 'number' ? noPiso.style.fontWeight : null,
    textTransform: (noPiso.style?.textTransform as string | undefined) ?? null,
    letterSpacing: Number(noPiso.style?.letterSpacing ?? 0),
    color: String(noPiso.style?.color ?? r.estilo.color),
    origem: r.estiloDaReferencia,
  }
}

export interface BlocosPreparados {
  montados: BlocoPreparado[]
  recusas: RecusaPreparada[]
  arranjos: Array<{ grupo: string; id: string; nome: string; origem: ArranjoDeGrupo['origem']; motivo: string }>
  arranjoPorGrupo: Map<string, ArranjoDeGrupo>
  elementosPorTexto: Map<string, { elementos: ElementoDoArranjo[]; escala: number }>
  segundaVoz: 'contrato' | 'legado' | 'nenhuma'
  /** F3: os grupos formados só por camadas extras e a borda em que pousam (a chave é `extra:<borda>`). */
  gruposExtras: Map<string, Exclude<GrupoVisual, 'principal'>>
  /** F3: os papéis pedidos que a variante não tem e nenhuma herança salvou — a composição recusa. */
  faltam: Papel[]
  /** R03: cada extra que não pôde ser resolvido, pelo id — a medição os declara e conta em `cabeTudo`. */
  falhas: FalhaDeResolucao[]
  avisos: string[]
  /**
   * O SUPERCONJUNTO de famílias que a peça podia usar: o estilo de cada papel
   * da assinatura e de cada arranjo CANDIDATO, mais a família do destaque
   * efetivo de cada um. Quem compõe pergunta ao servidor quais delas não
   * carregaram ANTES de decidir se uma recusa tem orçamento (PR4-FINAL-02), e
   * filtra pelo que as camadas finais usam só na hora de avisar.
   */
  familiasCandidatas: string[]
}

export function prepararBlocos(args: {
  spec: PecaParaBlocos
  assinatura: AssinaturaDaMarca
  colunaUtil: number
  escalaDoFormato: number
  mancha: string
  medir: MeasureTextBox
  /** As famílias cadastradas no projeto (o destaque "pesado" escolhe entre elas). */
  familias: string[]
  /** As combinações salvas do projeto, já como arranjos (quem chama as carrega). */
  combinacoesSalvas: ArranjoDeGrupo[]
  /**
   * Com arquétipo (T1a): a caixa MÁXIMA de cada papel — a largura da referência
   * vira a coluna do bloco e a altura, a capacidade. A segunda voz mede na caixa
   * da manchete. Ausente = a coluna útil de sempre, nada muda.
   */
  caixaDoPapel?: (papel: Papel) => { largura: number; altura: number } | undefined
  /** Com arquétipo: o fator (≤ 1) em que a escada de cada papel começa — a escada da unidade (`no-compositor.ts`). */
  escalaMaximaDoPapel?: (papel: Papel) => number | undefined
  /**
   * F2c: na peça por referência com `corpos`, o teto e o piso do papel em PX (a régua comum da unidade). Convertidos AQUI
   * ao estilo EFETIVO de cada bloco (o do arranjo ou o da assinatura): assinatura 58, arranjo 72, referência 85 → o bloco
   * parte de 85 px, nunca de 106. Vence `escalaMaximaDoPapel`.
   */
  corpoDoPapel?: (papel: Papel) => { referencia: number; teto: number; piso: number } | undefined
  /**
   * F2d: na peça por referência com `estilos`, o estilo desenhado do papel e o corpo desenhado (a régua do espaçamento).
   * Vestido sobre o estilo-base EFETIVO de cada bloco (`vestirEstiloDaReferencia`); a segunda voz toma só a cor.
   */
  estiloDoPapel?: (papel: Papel) => { estilo: EstiloDaReferencia; corpo: number } | undefined
  /**
   * Com arquétipo de LISTA (#15): o papel cujo bloco vira um ITEM por linha autoral — uma camada por linha, do MESMO
   * bloco (`origem.linhas` = a linha dela), na ordem do autor. O item que quebra em duas linhas visuais segue uma camada.
   */
  listaDoPapel?: (papel: Papel) => boolean
  /** Com arquétipo: o teto de linhas do papel (`limitesDeTexto`) — a linha única que não cabe no teto é distribuída (`montarBloco`). */
  linhasMaxDoPapel?: (papel: Papel) => number | undefined
}): BlocosPreparados {
  const { spec, assinatura, colunaUtil, escalaDoFormato, mancha, medir, familias, combinacoesSalvas } = args
  const avisos: string[] = []
  const recusas: RecusaPreparada[] = []
  const chaveDoGrupo = (papel: Papel) => assinatura.papeis[papel]?.grupo ?? (papel === 'headline2' ? assinatura.papeis.headline?.grupo ?? 'solo:headline' : `solo:${papel}`)
  const gruposDaPagina = arranjosDaPagina({
    pageId: assinatura.origem.pageId ?? 'assinatura',
    nome: assinatura.origem.variante ?? 'Assinatura',
    camadas: assinatura.camadasDaPagina ?? [],
    medir,
  })
  // O papel que a página tem em MAIS de um grupo (no Happy wine do TERO, o
  // horário junto da oferta e o endereço sozinho no pé) recebe as linhas pelo
  // tipo: horário no grupo do horário, endereço no do endereço. Sem isso as duas
  // linhas iam para o primeiro grupo e saíam coladas numa caixa só.
  // 🔴 O bloco do CONTRATO que originou cada papel. `validarSpec` recusa papel
  // repetido, e os blocos da spec saem do contrato por `blocosParaOCompositor`
  // — então, entre os blocos COM texto, papel e bloco são um para um. É esse id
  // que vai para a camada (`metadata.compositor.bloco`) e faz a leitura da copy
  // efetiva saber de quem é a camada sem adivinhar (PR3-R11-01).
  // 🔴 Só os blocos COMUNS entram aqui. Com a F3 a premissa acima ("papel e
  // bloco são um para um") passa a valer só entre eles: `validarSpec` aceita o
  // papel repetido quando a segunda ocorrência tem id + `herdaDe`, e contar o
  // extra pelo papel faria a camada COMUM ser carimbada com o bloco do extra.
  // O extra declara o próprio bloco (`extra.id`), na montagem.
  const blocoDoPapel = new Map<Papel, string>()
  for (const b of spec.copyAutoral?.blocos ?? []) {
    if (b.estilo?.herdaDe) continue
    if (b.id && b.funcao && b.funcao !== 'livre' && (b.linhas?.length ?? 0) > 0 && !blocoDoPapel.has(b.funcao as Papel)) blocoDoPapel.set(b.funcao as Papel, b.id)
  }
  // 🔴 A declaração da segunda voz vem do bloco que ORIGINOU a manchete — o id
  // já resolvido acima —, nunca do primeiro `headline` do contrato. O contrato
  // aceita um bloco `headline` VAZIO ao lado do preenchido (`blocosParaOCompositor`
  // omite o vazio, então `validarSpec` não vê papel repetido), e pelo primeiro
  // a busca caía no vazio: `linhasNaVoz2` do autor era ignorada em silêncio, a
  // manchete saía inteira na voz 1 mesmo com `headline2` na assinatura, sem o
  // aviso de voz 2 indisponível, e a leitura seguinte registrava a mudança de
  // estilo como decisão do compositor (PR4-FINAL-01, 21/09/2026). É a MESMA
  // identidade que vincula as camadas — decidir por proxy foi o defeito.
  const idDaManchete = blocoDoPapel.get('headline')
  const declaradasNaVoz2 = idDaManchete ? spec.copyAutoral?.blocos?.find((b) => b.id === idDaManchete)?.estilo?.linhasNaVoz2 ?? null : null
  const blocosPorGrupo = new Map<string, Array<{ papel: Papel; linhas: string[]; indicesDoBloco: number[]; extra?: IdentidadeDoExtra }>>()
  const juntarNoGrupo = (chave: string, papel: Papel, linhas: string[], indices: number[]) => {
    const lista = blocosPorGrupo.get(chave) ?? []
    const mesmo = lista.find((x) => x.papel === papel && !x.extra)
    if (mesmo) {
      mesmo.linhas.push(...linhas)
      mesmo.indicesDoBloco.push(...indices)
    } else lista.push({ papel, linhas: [...linhas], indicesDoBloco: [...indices] })
    blocosPorGrupo.set(chave, lista)
  }
  // F3: os blocos resolvidos contra a variante — quem tem o papel segue o
  // caminho de sempre; quem herda estilo vira camada EXTRA com grupo visual
  // próprio (`principal` = o grupo da manchete; `topo`/`rodape` = grupo só de
  // extras). O extra nunca entra no grupo do papel de que herda, nem na
  // distribuição de linhas do arranjo desse papel: ele não é esse papel.
  const resolvidos = resolverCamadasExtras({ blocos: spec.blocos, camadasExtras: spec.camadasExtras ?? undefined }, assinatura)
  avisos.push(...resolvidos.avisos)
  const gruposExtras = new Map<string, Exclude<GrupoVisual, 'principal'>>()
  const chaveDaManchete = chaveDoGrupo('headline')
  const extrasResolvidos: BlocoResolvido[] = []
  for (const b of resolvidos.blocos) {
    if (!b.extra) continue
    extrasResolvidos.push(b)
  }
  for (const b of resolvidos.blocos.filter((r) => !r.extra)) {
    const papel = b.papel
    const linhasDoBloco = b.linhas
    const chaves = [...gruposDaPagina.entries()].filter(([, a]) => a.papeis.includes(papel)).map(([chave]) => chave)
    if (chaves.length <= 1 || linhasDoBloco.length <= 1) {
      juntarNoGrupo(chaveDoGrupo(papel), papel, linhasDoBloco, linhasDoBloco.map((_, i) => i))
      continue
    }
    const tipos = new Map(blocosDeServico(linhasDoBloco).map((s) => [s.indice, s.papel === 'horário' ? 'horario' : 'endereco'] as const))
    linhasDoBloco.forEach((linha, i) => {
      const tipo = tipos.get(i)
      const doTipo = tipo ? chaves.find((chave) => gruposDaPagina.get(chave)!.textos.some((t) => t.papel === papel && t.tipo === tipo)) : undefined
      juntarNoGrupo(doTipo ?? chaveDoGrupo(papel), papel, [linha], [i])
    })
  }
  for (const b of extrasResolvidos) {
    const extra = b.extra!
    const chaveDoExtra = extra.grupoVisual === 'principal' ? chaveDaManchete : chaveDoGrupoExtra(extra.grupoVisual)
    if (extra.grupoVisual !== 'principal') gruposExtras.set(chaveDoExtra, extra.grupoVisual)
    // O extra desenha o bloco INTEIRO do autor (ele fica fora da distribuição
    // do arranjo), então as linhas que ele declara são todas as do bloco.
    blocosPorGrupo.set(chaveDoExtra, [
      ...(blocosPorGrupo.get(chaveDoExtra) ?? []),
      { papel: b.papel, linhas: [...b.linhas], indicesDoBloco: b.linhas.map((_, i) => i), extra },
    ])
  }
  // O superconjunto do que a peça pode pedir ao medidor — ver `familiasCandidatas`.
  const familiasCandidatas = new Set<string>()
  for (const e of [
    ...Object.values(assinatura.papeis).filter((x): x is EstiloDePapel => Boolean(x)),
    ...[...gruposDaPagina.values(), ...combinacoesSalvas].flatMap((a) => a.textos.map((t) => t.estilo)),
  ]) {
    for (const f of [e.fontFamily, estiloDeDestaqueDoPapel(e, assinatura.numeros.destaque, familias)?.fontFamily]) {
      if (typeof f === 'string' && f.trim()) familiasCandidatas.add(f)
    }
  }
  const chave = chaveDaPeca(spec)
  const arranjos: BlocosPreparados['arranjos'] = []
  const arranjoPorGrupo = new Map<string, ArranjoDeGrupo>()
  const elementosPorTexto = new Map<string, { elementos: ElementoDoArranjo[]; escala: number }>()

  const montados: BlocoPreparado[] = []
  let segundaVoz: BlocosPreparados['segundaVoz'] = 'nenhuma'
  // A numeração dos textos comuns do mesmo papel é da PEÇA inteira, não do
  // grupo: horário num grupo e endereço noutro saíam os dois com id `servico`,
  // a conferência final de ids recusava a composição e os elementos de um
  // texto sobrescreviam os do outro em `elementosPorTexto` (R13 da revisão do
  // Codex sobre o PR 9, 12/09/2026).
  const repeticoes = new Map<Papel, number>()
  for (const [chaveDoGrupoAtual, blocosDoGrupo] of blocosPorGrupo) {
    const daPagina = gruposDaPagina.get(chaveDoGrupoAtual)
    // Grupo só de extras não tem arranjo: nem o da página (ele não mora nela)
    // nem combinação salva — o extra não é o papel de que herda.
    const soExtras = blocosDoGrupo.every((b) => b.extra)
    const escolha = soExtras ? null : escolherArranjo([...(daPagina ? [daPagina] : []), ...combinacoesSalvas], {
      papeis: blocosDoGrupo.filter((b) => !b.extra).map((b) => b.papel),
      tema: spec.tema ?? spec.nome ?? null,
      chave: `${chave}|${chaveDoGrupoAtual}`,
      grupo: chaveDoGrupoAtual,
      preferidos: spec.preferencias?.arranjos,
    })
    const arranjo = escolha?.arranjo ?? null
    if (escolha) {
      arranjoPorGrupo.set(chaveDoGrupoAtual, escolha.arranjo)
      arranjos.push({ grupo: chaveDoGrupoAtual, id: escolha.arranjo.id, nome: escolha.arranjo.nome, origem: escolha.arranjo.origem, motivo: escolha.motivo })
    }
    // A manchete com segunda voz vira DOIS papéis no mesmo grupo (o que o
    // Quintal, o TERO e o By Rock fazem à mão). Quem diz QUAIS linhas vão na
    // voz 2 é o AUTOR, no contrato (`estilo.linhasNaVoz2`); sem contrato vale a
    // regra legada (a última linha COM TEXTO, com os respiros que a seguem) — ver `segunda-voz.ts`.
    const temSegundaVoz = arranjo ? arranjo.papeis.includes('headline2') : Boolean(assinatura.papeis.headline2)
    const comSegundaVoz = blocosDoGrupo.flatMap((b) => {
      if (b.papel !== 'headline' || b.extra) return [b]
      const d = dividirManchete(b.linhas, { temSegundaVoz, comContrato: Boolean(spec.copyAutoral), declaradas: declaradasNaVoz2 })
      if (d.aviso) avisos.push(`headline: ${d.aviso}`)
      segundaVoz = d.origem
      if (d.voz2.length === 0) return [b]
      // A voz 2 é sempre o FIM da manchete, então o corte das LINHAS vale para
      // os índices do bloco — é isso que deixa cada camada declarar quais
      // linhas do bloco do autor ela desenha (PR 3).
      // E voz 1 vazia (manchete INTEIRA na voz 2) não vira camada: um texto sem
      // linha seria lido depois como bloco vazio e viraria revisão falsa (R01).
      const corte = d.voz1.length
      const partes: Array<{ papel: Papel; linhas: string[]; indicesDoBloco: number[]; extra?: IdentidadeDoExtra }> = []
      if (corte > 0) partes.push({ papel: 'headline' as Papel, linhas: d.voz1, indicesDoBloco: b.indicesDoBloco.slice(0, corte) })
      partes.push({ papel: 'headline2' as Papel, linhas: d.voz2, indicesDoBloco: b.indicesDoBloco.slice(corte) })
      return partes
    })
    // Os extras ficam FORA da distribuição do arranjo (eles não são o papel de
    // que herdam) e entram depois dos textos do grupo, na ordem em que vieram.
    const doArranjo = comSegundaVoz.filter((b) => !b.extra)
    const extrasDoGrupo = comSegundaVoz.filter((b) => b.extra)
    const preenchidos: Array<{ papel: Papel; linhas: string[]; indicesDoBloco: number[]; texto: ReturnType<typeof distribuirLinhas>[number]['texto'] | null; extra?: IdentidadeDoExtra }> = [
      ...(arranjo
        ? distribuirLinhas(arranjo, doArranjo).map((p) => ({ papel: p.texto.papel, linhas: p.linhas, indicesDoBloco: p.indicesDoBloco, texto: p.texto }))
        : doArranjo.map((b) => ({ ...b, texto: null }))),
      ...extrasDoGrupo.map((b) => ({ papel: b.papel, linhas: b.linhas, indicesDoBloco: b.indicesDoBloco, texto: null, extra: b.extra })),
    ]
    // A lista: cada linha do autor é um item, com camada própria. Os ornamentos do arranjo (ícone, filete, selo) ficam
    // só no PRIMEIRO item — repeti-los seria desenho que a página não tem.
    const porItem = preenchidos.flatMap((p) =>
      !p.extra && p.linhas.length > 1 && args.listaDoPapel?.(p.papel)
        ? p.linhas.map((linha, k) => ({ ...p, linhas: [linha], indicesDoBloco: [p.indicesDoBloco[k]], texto: k === 0 || !p.texto ? p.texto : { ...p.texto, elementos: [] } }))
        : [p],
    )
    for (const p of porItem) {
      // O extra veste o estilo do papel de origem SEM a posição dele.
      const estiloBase0 = p.texto?.estilo ?? assinatura.papeis[p.papel]
      if (!estiloBase0) continue
      // F2d: o estilo da referência vestido sobre o estilo-base EFETIVO (o do arranjo ou o da assinatura), campo a campo; a
      // segunda voz toma só a cor. O arranjo salvo não é mutado: a sobreposição vive só neste bloco.
      const daRef = args.estiloDoPapel?.(p.papel === 'headline2' ? 'headline' : p.papel)
      const vestido = daRef ? vestirEstiloDaReferencia({ base: estiloBase0, origemDaBase: p.texto ? 'arranjo' : 'assinatura', estilo: daRef.estilo, corpo: daRef.corpo, apenasCor: p.papel === 'headline2' }) : null
      const estiloBase = vestido ? vestido.estilo : estiloBase0
      const estilo = p.extra ? estiloHerdado(estiloBase) : estiloBase
      const n = p.extra ? 0 : (repeticoes.get(p.papel) ?? 0) + 1
      if (!p.extra) repeticoes.set(p.papel, n)
      // O segundo texto do mesmo papel (o Local e o Horário) ganha id próprio;
      // o extra tem o id do autor.
      const id = p.extra ? p.extra.id : n > 1 ? `${p.papel}-${n}` : p.papel
      const funcao = p.extra ? p.extra.funcao : p.papel
      const destaque = estiloDeDestaqueDoPapel(estilo, assinatura.numeros.destaque, familias)
      // F2d: a família da referência e a do destaque RESOLVIDO sobre ela entram na conferência de fontes (a coleta de cima
      // é anterior ao vestir).
      if (vestido) for (const f of [estilo.fontFamily, destaque?.fontFamily]) if (typeof f === 'string' && f.trim()) familiasCandidatas.add(f)
      // Com arquétipo a largura é a da REFERÊNCIA: a `larguraMaxima` da assinatura é geometria e sai da conta.
      const caixa = args.caixaDoPapel?.(p.papel === 'headline2' ? 'headline' : p.papel)
      const estiloMedido = caixa ? { ...estilo, larguraMaxima: undefined } : estilo
      const colunaDoBloco = caixa ? colunaDaCaixa(caixa.largura) : colunaUtil
      const coluna = Math.floor(colunaDoBloco * (estiloMedido.larguraMaxima ?? 1))
      // F2c: o teto/piso em px do papel geométrico, convertidos ao estilo efetivo deste bloco (fator sobre `escalaDoFormato`).
      const corpoDaRef = caixa ? args.corpoDoPapel?.(p.papel === 'headline2' ? 'headline' : p.papel) : undefined
      const baseDoBloco = estiloMedido.fontSize * escalaDoFormato
      const escalaMaxima = corpoDaRef ? corpoDaRef.teto / baseDoBloco : caixa ? args.escalaMaximaDoPapel?.(p.papel === 'headline2' ? 'headline' : p.papel) : undefined
      // A distribuição vale para o texto comum do papel: a lista é um item por linha, o extra e a segunda voz têm as suas.
      const linhasMax = caixa && !p.extra && p.papel !== 'headline2' && !args.listaDoPapel?.(p.papel) ? args.linhasMaxDoPapel?.(p.papel) : undefined
      const r = montarBloco({
        papel: p.papel,
        id,
        linhas: p.linhas,
        estilo: estiloMedido,
        escalaDoFormato,
        colunaUtil: colunaDoBloco,
        ...(caixa ? { alturaMaxima: caixa.altura } : {}),
        ...(escalaMaxima !== undefined ? { escalaMaxima } : {}),
        ...(corpoDaRef ? { pisoDeEscala: corpoDaRef.piso / baseDoBloco } : {}),
        ...(linhasMax !== undefined ? { linhasMax } : {}),
        textAlign: 'left',
        groupId: `grupo-${hashDe(chaveDoGrupoAtual) % 99991}`,
        corDaMancha: mancha,
        medir,
        // O vínculo com a copy do autor. A segunda voz é a manchete: as linhas
        // dela voltam ao bloco `headline` na leitura, então ela declara o mesmo
        // bloco, com a posição que a linha tem lá.
        // O EXTRA declara o PRÓPRIO bloco: `extra.id` é o id que o autor deu ao
        // bloco no contrato, e a camada nasce dele inteiro. Deixá-lo cair no
        // mapa por papel faria o extra apontar para o bloco do papel de que só
        // herda o ESTILO — o vínculo declarado passaria a mentir a origem.
        origem: { bloco: p.extra ? p.extra.id : blocoDoPapel.get(p.papel === 'headline2' ? 'headline' : p.papel), linhas: p.indicesDoBloco },
        // Palavra entre [colchetes] na copy sai destacada no estilo da marca.
        destaque,
        extra: p.extra ?? null,
      })
      avisos.push(...r.avisos)
      if (r.recusa) {
        recusas.push({ papel: r.recusa.papel, funcao, ...(p.extra ? { extra: p.extra } : {}), id, linhasDaCopy: p.linhas, estilo, familiasMedidas: r.recusa.familiasMedidas, destaque, orcamento: r.recusa.orcamento, coluna, ...(r.recusa.altura ? { altura: r.recusa.altura } : {}), ...(r.recusa.quebras ? { quebras: r.recusa.quebras } : {}), ...(corpoDaRef ? { corpo: corpoDaRef } : {}), ...(vestido ? { estiloDaReferencia: vestido.origem } : {}) })
        continue
      }
      const corpoEfetivo = Number(r.bloco.layer.style?.fontSize ?? 0)
      // F2c: a redução que importa é contra o corpo DESENHADO, não contra a assinatura (a escala técnica pode estar acima de 1).
      if (corpoDaRef) {
        if (corpoEfetivo < corpoDaRef.referencia) avisos.push(`${p.papel}: corpo ${corpoEfetivo} px, abaixo dos ${corpoDaRef.referencia} px da referência (−${Math.round((1 - corpoEfetivo / corpoDaRef.referencia) * 100)} %) para caber`)
      } else if (r.bloco.escala < 1) avisos.push(`${p.papel}: fonte reduzida a ${Math.round(r.bloco.escala * 100)}% para caber na coluna`)
      const escalaDosElementos = escalaDoFormato * r.bloco.escala
      if (p.texto && p.texto.elementos.length > 0) elementosPorTexto.set(r.bloco.layer.id, { elementos: p.texto.elementos, escala: escalaDosElementos })
      const vaoAntes = p.texto && p.texto.vaoAntes !== null ? Math.round(p.texto.vaoAntes * escalaDoFormato) : null
      // O encaixe que a página desenhou — a voz 2 entrando na linha de cima, como
      // o "executivo" em script sob o "Almoço" do Quintal — vai marcado na camada
      // com quanto sobrepõe. A conferência de colisão o aceita entre textos do
      // mesmo grupo; sem a marca, o autofix encolhia a manchete até desfazer o
      // encaixe (88 → 77 px, 11/09/2026).
      const compositorDaCamada = (r.bloco.layer.metadata as { compositor?: Record<string, unknown> } | undefined)?.compositor
      const layer: Layer =
        vaoAntes !== null && vaoAntes < 0
          ? { ...r.bloco.layer, metadata: { ...r.bloco.layer.metadata, compositor: { ...compositorDaCamada, encaixe: -vaoAntes } } }
          : r.bloco.layer
      montados.push({
        ...r.bloco,
        layer,
        chave: chaveDoGrupoAtual,
        // O que a camada DESENHA (a linha distribuída pelo compositor conta como as linhas dela): é isso que o medir mede.
        linhasDaCopy: r.bloco.distribuida ?? p.linhas,
        estilo,
        destaque,
        funcao,
        coluna,
        indicesDoBloco: p.indicesDoBloco,
        ...(p.extra ? { extra: p.extra } : {}),
        ...(vaoAntes !== null ? { vaoAntes } : {}),
        ...(p.texto?.recuo ? { recuo: Math.round(p.texto.recuo * escalaDoFormato) } : {}),
        ...(p.texto && p.texto.elementos.length > 0 ? { elementos: p.texto.elementos, escalaDosElementos } : {}),
        ...(corpoDaRef ? { corpo: { ...corpoDaRef, efetivo: corpoEfetivo } } : {}),
        ...(vestido ? { estiloDaReferencia: vestido.origem } : {}),
      })
    }
  }
  return { montados, recusas, arranjos, arranjoPorGrupo, elementosPorTexto, segundaVoz, gruposExtras, faltam: resolvidos.faltam, falhas: resolvidos.falhas, avisos, familiasCandidatas: [...familiasCandidatas] }
}
