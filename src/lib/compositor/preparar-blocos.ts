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
import { montarBloco, type BlocoMontado, type OrcamentoDeLinha } from './blocos'
import { arranjosDaPagina, distribuirLinhas, escolherArranjo, type ArranjoDeGrupo, type ElementoDoArranjo } from './combinacoes'
import { destaqueDoPapel, type EstiloDeDestaque } from './destaques'
import { dividirManchete } from './segunda-voz'
import type { Papel } from './spec'

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
  blocos?: Array<{ papel?: Papel; linhas?: string[] }>
  nome?: string | null
  tema?: string | null
  foto?: { driveFileId?: string; url?: string } | null
  copyAutoral?: { blocos?: Array<{ id?: string; funcao?: string; linhas?: string[]; estilo?: { linhasNaVoz2?: number[] | null } | null }> } | null
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
}

export interface RecusaPreparada {
  papel: Papel
  id: string
  linhasDaCopy: string[]
  estilo: EstiloDePapel
  /** As famílias que ENTRARAM na medição — a resposta de quem mediu (PR4-R2-01). */
  familiasMedidas: string[]
  /** O estilo de destaque com que a montagem mediu os [colchetes] (null = sem estilo na marca). */
  destaque: EstiloDeDestaque | null
  orcamento: OrcamentoDeLinha[]
}

export interface BlocosPreparados {
  montados: BlocoPreparado[]
  recusas: RecusaPreparada[]
  arranjos: Array<{ grupo: string; id: string; nome: string; origem: ArranjoDeGrupo['origem']; motivo: string }>
  arranjoPorGrupo: Map<string, ArranjoDeGrupo>
  elementosPorTexto: Map<string, { elementos: ElementoDoArranjo[]; escala: number }>
  segundaVoz: 'contrato' | 'legado' | 'nenhuma'
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
  const blocoDoPapel = new Map<Papel, string>()
  for (const b of spec.copyAutoral?.blocos ?? []) {
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
  const blocosPorGrupo = new Map<string, Array<{ papel: Papel; linhas: string[]; indicesDoBloco: number[] }>>()
  const juntarNoGrupo = (chave: string, papel: Papel, linhas: string[], indices: number[]) => {
    const lista = blocosPorGrupo.get(chave) ?? []
    const mesmo = lista.find((x) => x.papel === papel)
    if (mesmo) {
      mesmo.linhas.push(...linhas)
      mesmo.indicesDoBloco.push(...indices)
    } else lista.push({ papel, linhas: [...linhas], indicesDoBloco: [...indices] })
    blocosPorGrupo.set(chave, lista)
  }
  for (const b of spec.blocos ?? []) {
    const papel = b.papel as Papel
    const linhasDoBloco = b.linhas ?? []
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
  for (const [chaveDoGrupoAtual, blocosDoGrupo] of blocosPorGrupo) {
    const daPagina = gruposDaPagina.get(chaveDoGrupoAtual)
    const escolha = escolherArranjo([...(daPagina ? [daPagina] : []), ...combinacoesSalvas], {
      papeis: blocosDoGrupo.map((b) => b.papel),
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
    // regra legada (a última linha) — ver `segunda-voz.ts`.
    const temSegundaVoz = arranjo ? arranjo.papeis.includes('headline2') : Boolean(assinatura.papeis.headline2)
    const comSegundaVoz = blocosDoGrupo.flatMap((b) => {
      if (b.papel !== 'headline') return [b]
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
      const partes: Array<{ papel: Papel; linhas: string[]; indicesDoBloco: number[] }> = []
      if (corte > 0) partes.push({ papel: 'headline' as Papel, linhas: d.voz1, indicesDoBloco: b.indicesDoBloco.slice(0, corte) })
      partes.push({ papel: 'headline2' as Papel, linhas: d.voz2, indicesDoBloco: b.indicesDoBloco.slice(corte) })
      return partes
    })
    const preenchidos = arranjo
      ? distribuirLinhas(arranjo, comSegundaVoz).map((p) => ({ papel: p.texto.papel, linhas: p.linhas, indicesDoBloco: p.indicesDoBloco, texto: p.texto }))
      : comSegundaVoz.map((b) => ({ ...b, texto: null }))
    const repeticoes = new Map<Papel, number>()
    for (const p of preenchidos) {
      const estilo = p.texto?.estilo ?? assinatura.papeis[p.papel]
      if (!estilo) continue
      const n = (repeticoes.get(p.papel) ?? 0) + 1
      repeticoes.set(p.papel, n)
      // O segundo texto do mesmo papel (o Local e o Horário) ganha id próprio
      const id = n > 1 ? `${p.papel}-${n}` : p.papel
      const destaque = estiloDeDestaqueDoPapel(estilo, assinatura.numeros.destaque, familias)
      const r = montarBloco({
        papel: p.papel,
        id,
        linhas: p.linhas,
        estilo,
        escalaDoFormato,
        colunaUtil,
        textAlign: 'left',
        groupId: `grupo-${hashDe(chaveDoGrupoAtual) % 99991}`,
        corDaMancha: mancha,
        medir,
        // O vínculo com a copy do autor. A segunda voz é a manchete: as linhas
        // dela voltam ao bloco `headline` na leitura, então ela declara o mesmo
        // bloco, com a posição que a linha tem lá.
        origem: { bloco: blocoDoPapel.get(p.papel === 'headline2' ? 'headline' : p.papel), linhas: p.indicesDoBloco },
        // Palavra entre [colchetes] na copy sai destacada no estilo da marca.
        destaque,
      })
      avisos.push(...r.avisos)
      if (r.recusa) {
        recusas.push({ papel: r.recusa.papel, id, linhasDaCopy: p.linhas, estilo, familiasMedidas: r.recusa.familiasMedidas, destaque, orcamento: r.recusa.orcamento })
        continue
      }
      if (r.bloco.escala < 1) avisos.push(`${p.papel}: fonte reduzida a ${Math.round(r.bloco.escala * 100)}% para caber na coluna`)
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
        linhasDaCopy: p.linhas,
        estilo,
        destaque,
        ...(vaoAntes !== null ? { vaoAntes } : {}),
        ...(p.texto?.recuo ? { recuo: Math.round(p.texto.recuo * escalaDoFormato) } : {}),
        ...(p.texto && p.texto.elementos.length > 0 ? { elementos: p.texto.elementos, escalaDosElementos } : {}),
      })
    }
  }
  return { montados, recusas, arranjos, arranjoPorGrupo, elementosPorTexto, segundaVoz, avisos, familiasCandidatas: [...familiasCandidatas] }
}
