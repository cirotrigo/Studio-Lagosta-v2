/**
 * O registro da copy de uma ARTE (`Generation.fieldValues.copyAutoral =
 * { original, efetiva, comparavel, lacunas? }`) acompanha o PNG — módulo PURO.
 *
 * PR3-F02 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): a arte
 * re-renderizada (a página ajustada à mão, a recuperação forçada) trocava o
 * PNG e deixava `efetiva` da versão anterior; a recomposição que não
 * conseguia ler o contrato fazia o mesmo. `ver-geracao` apresentava o texto
 * antigo como `desenhada`, com `comparavel: true`, para a imagem nova. Quem
 * troca o PNG de uma arte que carrega o registro grava o registro de novo:
 * a efetiva medida nas camadas desenhadas, ou — quando não dá para medir —
 * `efetiva: null`, `comparavel: false` e o motivo em `lacunas`. Nunca a
 * efetiva antiga como se fosse a atual. O `original` fica.
 */

/**
 * O registro da copy autoral numa ARTE SEM CAMADAS — a via de IA e a melhoria
 * (F1 de "Marca simples, copy melhor", PR 5, 12/09/2026). Módulo PURO, sem
 * Prisma.
 *
 * Na via de modelo e no compositor a copy "efetiva" sai das CAMADAS gravadas.
 * Na IA não há camada: o que se sabe é o texto ENVIADO ao modelo de imagem e
 * o que a visão LEU de volta. O registro declara isso em vez de fingir uma
 * efetiva: `original` (o contrato), `enviada` (os blocos como foram ao prompt,
 * já na caixa da marca), `conferencia` (a transcrição por visão, o que faltou,
 * se passou) e `lacunas`. `comparavel` continua sendo autoria conhecida — quem
 * lê (`ver-geracao`) compara `original` com `conferencia.lida` sabendo que é
 * transcrição, não camada.
 */

import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import type { CopyAutoral } from './contrato'
import { tentarCopyEfetivaDasCamadas } from './efetiva'
import { lerCopyAutoral } from './serializar'
import { normalizeForComparison } from '@/lib/ai/text-comparison'
import { CANAIS_AUTOMATICOS, type CanalDaArte } from '@/lib/creatives/canal'
import { blocosEmOrdem, copyComparavel, HistoricoDaCopyCheio, orientacaoDosProblemas, orientacaoEmFrase, tentarAplicarRevisao, type Autor, type BlocoAutoral } from '.'

export interface RegistroDaCopyDaArte {
  original: CopyAutoral
  efetiva: CopyAutoral | null
  comparavel: boolean
  lacunas?: string[]
}

function registroAnterior(anterior: unknown): Record<string, unknown> | null {
  return anterior && typeof anterior === 'object' && !Array.isArray(anterior) ? (anterior as Record<string, unknown>) : null
}

/** O registro de quem NÃO conseguiu medir a copy desta imagem; `null` quando a arte não carregava registro nenhum. */
export function copyDaArteIndisponivel(anterior: unknown, motivo: string): RegistroDaCopyDaArte | null {
  const ant = registroAnterior(anterior)
  const original = ant ? lerCopyAutoral(ant.original).copy : null
  if (!original) return null
  return { original, efetiva: null, comparavel: false, lacunas: [`a copy desenhada nesta imagem não pôde ser medida: ${motivo}`] }
}

/**
 * O registro para o PNG que desenha `camadas`. A base da leitura é o contrato
 * da página (o que ela mostra, com as revisões da equipe); sem ele, a efetiva
 * anterior da arte. `null` quando a arte não carregava registro (não se inventa um).
 */
export function registroDaCopyDaArte(args: { anterior: unknown; contratoDaPagina: unknown; camadas: unknown; superficie: string }): { registro: RegistroDaCopyDaArte | null; aviso: string | null } {
  const ant = registroAnterior(args.anterior)
  const original = ant ? lerCopyAutoral(ant.original).copy : null
  if (!original) return { registro: null, aviso: null }
  const indisponivel = (motivo: string) => ({ registro: copyDaArteIndisponivel(args.anterior, motivo), aviso: `A copy desenhada na imagem nova não pôde ser medida (${motivo}); a arte ficou marcada como não comparável.` })
  const base = (args.contratoDaPagina == null ? null : lerCopyAutoral(args.contratoDaPagina).copy) ?? lerCopyAutoral(ant!.efetiva).copy ?? original
  const lidas = lerCamadas(args.camadas)
  if (!lidas.legivel) return indisponivel('camadas da página ilegíveis')
  const leitura = tentarCopyEfetivaDasCamadas(base, lidas.camadas as unknown as Layer[], { superficie: args.superficie })
  if (leitura.ok === false) return indisponivel(leitura.aviso)
  const { efetiva, lacunas } = leitura.leitura
  return { registro: { original, efetiva, comparavel: original.origem.autor !== 'desconhecido', ...(lacunas.length ? { lacunas } : {}) }, aviso: null }
}

/** A lacuna que toda arte sem camadas carrega — dita, nunca escondida. */
export const LACUNA_SEM_CAMADAS =
  'a arte não tem camadas: o texto desenhado só é conhecido pela transcrição por visão (conferencia.lida)'

export interface ConferenciaDaCopy {
  /** O que a visão leu na arte pronta (transcrição crua, por bloco). */
  lida: string[]
  /** Blocos esperados que a visão não encontrou (normalizados). */
  faltando: string[]
  /** `null` = a conferência não rodou (visão indisponível, peça sem texto). */
  passou: boolean | null
  /** De onde veio a régua da conferência: `copy` (o texto enviado), `visao`, `linhagem`, `nenhuma`. */
  regua: string
  /** Blocos que só casaram com tolerância de UMA edição por palavra. */
  grafiaDivergente?: Array<{ esperado: string; lido: string }>
}

export interface RegistroDaCopyNaArte {
  original: CopyAutoral
  /**
   * Os blocos como foram ENVIADOS ao modelo de imagem, lidos do PROMPT que
   * saiu (`enviadaNoPrompt`). Ausente quando o prompt não permite dizer — o
   * prompt pronto de quem chamou, um molde que reescreve o bloco, a geração
   * que nem chegou a montar o prompt —, e a lacuna diz por quê.
   */
  enviada?: string[]
  comparavel: boolean
  lacunas: string[]
  conferencia?: ConferenciaDaCopy
}

/** Os blocos com texto, em ordem, cada um com as linhas do autor unidas por "\n" — o que a via de IA envia. */
export function textoEnviadoDoContrato(copy: CopyAutoral): string[] {
  return blocosEmOrdem(copy)
    .filter((b) => b.linhas.some((l) => l.trim().length > 0))
    .map((b) => b.linhas.join('\n'))
}

export function registroParaIA(original: CopyAutoral, enviada: string[] | null, lacunas: string[] = []): RegistroDaCopyNaArte {
  return { original, ...(enviada ? { enviada } : {}), comparavel: copyComparavel(original), lacunas: [LACUNA_SEM_CAMADAS, ...lacunas] }
}

/** A lacuna do registro criado ANTES de o prompt existir (na criação da Generation, antes do runner). */
export const LACUNA_PROMPT_AINDA_NAO_MONTADO = 'o texto enviado ao modelo só é conhecido quando o prompt é montado'

/**
 * O que o prompt que SAIU carrega de cada bloco (PR5-10 da revisão final do
 * Codex, 18/09/2026): `enviada` era gravada como a transformação que o
 * sistema APLICARIA à copy, mas nem todo caminho a aplica — o prompt pronto de
 * quem chamou vai verbatim, e os moldes e o prompt montado por código colapsam
 * espaços (e com eles a quebra). A comparação escrita × enviada × lida
 * atribuía ao gerador uma diferença que nasceu no registro.
 *
 * `formas` são as grafias possíveis de cada bloco, em ordem de preferência
 * (a da caixa da marca, a crua…); cada uma vale também com os espaços
 * colapsados. O primeiro que o prompt CONTÉM como BLOCO INTEIRO é o enviado.
 * Bloco que não aparece em forma nenhuma torna o conjunto indeterminável:
 * `enviada` fica `null` e a lacuna diz qual bloco — nunca se grava um palpite.
 *
 * 🔴 A ocorrência tem de ser o bloco INTEIRO e ainda LIVRE (PR5-11 da revisão
 * final do Codex, 21/09/2026). `includes` cru achava `R$ 20` dentro de
 * `"R$ 200"` e `Venha hoje` dentro de `"Venha hoje mesmo"`, e devolvia
 * `enviada` como se a copy tivesse saído intacta: a diferença que ENTROU no
 * prompt ia para a conta do gerador. E a mesma ocorrência servia a vários
 * blocos — dois blocos iguais com uma aparição só passavam como dois enviados.
 */

/**
 * 🔴 A unidade é o BLOCO COMPLETO, nunca a vizinhança de um pedaço
 * (PR5-11-R2 da revisão final do Codex, 21/09/2026). A 1ª correção perguntava
 * "o que vem antes e depois desta ocorrência?" — e `Venha hoje` dentro de
 * `- "Venha hoje\nmesmo"` começa depois de uma aspa e termina antes de `\n`,
 * então passava: metade de um bloco citado voltava como `enviada`, e a
 * amplificação que já estava no prompt ia para a conta do gerador. Pior, as
 * duas LINHAS de um único bloco entre aspas podiam servir a dois blocos
 * esperados diferentes.
 *
 * Aqui o prompt é partido nas unidades que os caminhos da casa escrevem:
 * dentro de ASPAS, tudo até a aspa de fechamento é UMA unidade (a quebra
 * interna não encerra nada) — `- "bloco"` do `buildArtePrompt` e do
 * `[TEXTO EXATO]` da melhoria, `"bloco"` por linha do `prompt-da-referencia`;
 * FORA delas, a delimitação é por LINHA — o bloco sozinho na linha do
 * `prompt-do-manual`. O bloco esperado tem de ser IGUAL a uma unidade inteira
 * e ainda livre. Prompt pronto de quem chamou que embuta a copy no meio de uma
 * frase corrida não permite dizer o que saiu: vira lacuna, que é o
 * comportamento pedido.
 */
const ASPAS: Record<string, string> = { '"': '"', '“': '”', '«': '»' }

function unidadesDoPrompt(prompt: string): string[] {
  const unidades: string[] = []
  let fora = ''
  const fecharLinhas = () => {
    for (const linha of fora.split('\n')) {
      const t = linha.trim()
      if (t) unidades.push(t)
    }
    fora = ''
  }
  for (let i = 0; i < prompt.length; i++) {
    const c = prompt[i]
    const fecha = ASPAS[c]
    if (fecha) {
      const fim = prompt.indexOf(fecha, i + 1)
      if (fim !== -1) {
        fecharLinhas()
        unidades.push(prompt.slice(i + 1, fim))
        i = fim
        continue
      }
    }
    fora += c
  }
  fecharLinhas()
  return unidades
}

const colapsado = (s: string) => s.replace(/\s+/g, ' ').trim()

export function enviadaNoPrompt(prompt: string | null | undefined, formas: string[][]): { enviada: string[] | null; lacuna: string | null } {
  if (!prompt) return { enviada: null, lacuna: 'o prompt enviado não foi registrado: o texto enviado ao modelo não é determinável' }
  const unidades = unidadesDoPrompt(prompt)
  const total = Math.max(0, ...formas.map((f) => f.length))
  const enviada: string[] = []
  // Cada unidade serve a UM bloco: dois blocos iguais precisam de duas aparições.
  const tomadas = new Set<number>()
  for (let i = 0; i < total; i++) {
    const candidatas = formas.flatMap((f) => (typeof f[i] === 'string' ? [f[i], colapsado(f[i])] : [])).filter((c) => c.length > 0)
    let achada: string | null = null
    for (const c of candidatas) {
      const livre = unidades.findIndex((u, n) => !tomadas.has(n) && (u === c || colapsado(u) === c))
      if (livre !== -1) {
        tomadas.add(livre)
        achada = c
        break
      }
    }
    if (achada === null) {
      const exemplo = colapsado(formas.find((f) => typeof f[i] === 'string')?.[i] ?? '').slice(0, 40)
      return { enviada: null, lacuna: `o bloco ${i + 1} ("${exemplo}") não aparece no prompt enviado como bloco inteiro: o texto enviado ao modelo não é determinável` }
    }
    enviada.push(achada)
  }
  return { enviada, lacuna: null }
}

/** O registro com o `enviada` lido do prompt (ou a lacuna, quando não dá para dizer). */
export function comEnviada(registro: RegistroDaCopyNaArte, lido: { enviada: string[] | null; lacuna: string | null }): RegistroDaCopyNaArte {
  const { enviada: _antes, ...resto } = registro
  const lacunas = resto.lacunas.filter((l) => l !== LACUNA_PROMPT_AINDA_NAO_MONTADO)
  return { ...resto, ...(lido.enviada ? { enviada: lido.enviada } : {}), lacunas: lido.lacuna ? [...lacunas, lido.lacuna] : lacunas }
}

/**
 * O contrato da Generation de ORIGEM de uma melhoria — só quando a imagem
 * melhorada É a arte daquela Generation (PR5-08 da revisão final do Codex,
 * 18/09/2026). Melhorar o slide 2 pela agenda manda o `generationId` do post
 * (a arte do slide 1) com a URL do slide 2; o serviço já marca
 * `skipTextVerification` e descarta os textos esperados, e o contrato tem de
 * cair junto — senão a melhoria de B gravava a copy autoral de A como a sua,
 * e ela seguia pela cadeia. Sem o contrato certo, a ausência é DITA.
 */
export function contratoDaOrigemDaMelhoria(fieldValues: unknown, opcoes: { outraImagem: boolean }): { contrato: CopyAutoral | null; aviso: string | null } {
  const r = fieldValues && typeof fieldValues === 'object' && !Array.isArray(fieldValues) ? (fieldValues as Record<string, unknown>).copyAutoral : null
  const contrato = r && typeof r === 'object' && !Array.isArray(r) ? lerCopyAutoral((r as Record<string, unknown>).original).copy : null
  if (!contrato) return { contrato: null, aviso: null }
  if (opcoes.outraImagem) {
    return { contrato: null, aviso: 'a imagem melhorada é outro slide do post: o contrato da copy da Generation de origem descreve outra imagem e não foi herdado' }
  }
  return { contrato, aviso: null }
}

export function comConferencia(registro: RegistroDaCopyNaArte, conferencia: ConferenciaDaCopy): RegistroDaCopyNaArte {
  return { ...registro, conferencia }
}

/** O resultado da conferência por visão no formato do registro; `null` = ela não rodou. */
export function conferenciaDoCheck(
  check: { passed: boolean; missing: string[]; extracted: string[]; grafiaDivergente?: Array<{ esperado: string; lido: string }> } | null,
  regua: string,
): ConferenciaDaCopy {
  if (!check) return { lida: [], faltando: [], passou: null, regua }
  return {
    lida: check.extracted.slice(0, 40),
    faltando: check.missing,
    passou: check.passed,
    regua,
    ...(check.grafiaDivergente && check.grafiaDivergente.length > 0 ? { grafiaDivergente: check.grafiaDivergente } : {}),
  }
}

/**
 * A IDENTIDADE de um contrato para a chave de deduplicação da geração: quem
 * escreveu, e cada bloco com id, função, ordem, linhas EXATAS, grupo de leitura
 * e a voz 2 declarada. Dois pedidos com os mesmos TEXTOS e contratos
 * diferentes (ids, papéis ou autoria) são peças diferentes; pedido SEM contrato
 * devolve `null`, e quem monta a chave o distingue do pedido com contrato —
 * sem isso o pedido legado e o pedido com contrato colidiam na janela e o
 * segundo saía `reused` sem o contrato gravado (PR5-01 da revisão do Codex,
 * 12/09/2026).
 */
export function identidadeDoContrato(copy: CopyAutoral | null | undefined): string | null {
  if (!copy) return null
  return JSON.stringify([
    copy.origem.autor,
    blocosEmOrdem(copy).map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.grupoDeLeitura ?? null, b.estilo?.linhasNaVoz2 ?? null]),
    // O HISTÓRICO autoral também é identidade: `autorDoBloco` decide quem foi o
    // último a tocar cada bloco pelas revisões, e dois contratos com os mesmos
    // blocos e revisões de autores diferentes são histórias diferentes — o
    // segundo pedido não pode herdar a geração (e a autoria) do primeiro
    // (PR5-05 da revisão do Codex, 12/09/2026). Serialização estável: só os
    // campos que decidem autoria, na ordem em que as revisões aconteceram.
    copy.revisoes.map((r) => [r.autor, r.em ?? null, [...r.blocos].sort(), r.motivo ?? null]),
  ])
}

export type ResultadoDaRevisaoPosicional = { copy: CopyAutoral; mudou: boolean } | { descartado: string }

/**
 * A revisão do REFINO: o planejador recebeu a copy `antes` (os textos como
 * foram ao prompt — na ORDEM DOS SLOTS da arte, já na caixa da origem) e
 * devolveu `depois`, bloco a bloco na mesma ordem. O que decide se um bloco
 * MUDOU é a comparação EXATA entre entrada e saída do planejador — acento e
 * quebra de linha contam (PR5-04: a tolerância da régua por visão apagava a
 * correção "familia → família" do histórico). O bloco do CONTRATO que recebe
 * a mudança é LOCALIZADO pelo texto de `antes` (normalizado só para achar —
 * a caixa da origem é transformação do sistema), nunca pela posição: a ordem
 * dos slots não é a ordem do contrato (PR5-03: a headline trocada caía no
 * pré-título). Bloco sem correspondência única é descartado com o motivo, e
 * os blocos que não mudaram mantêm as linhas do autor.
 */
/**
 * Quem ASSINA a revisão de copy nascida de um pedido feito por aquele canal.
 *
 * 🔴 O refino que troca texto era assinado por `claude` SEMPRE (PR5-13 da
 * revisão final do Codex, 21/09/2026), e a rota da interface chama o mesmo
 * serviço do conector: a pessoa pedia a troca pela tela e o histórico dizia
 * que quem mexeu foi o assistente — a autoria errada seguindo pela cadeia nas
 * melhorias seguintes. É o oposto do que o contrato existe para fazer.
 *
 * A distinção já existe na casa e é o CANAL (`creatives/canal.ts`), decidido
 * na porta de entrada: `studio` é a pessoa logada no app; os automáticos
 * (`claude-ai`, `claude-code`, `claudinho`) são o assistente. Canal ausente é
 * job antigo, enfileirado antes deste código: `desconhecido`, que é o
 * conservador — atribuir a alguém por palpite é o defeito, não a omissão.
 */
export function autorDoPedido(canal: CanalDaArte | null | undefined): Autor {
  if (canal === 'studio') return 'equipe'
  if (canal && (CANAIS_AUTOMATICOS as readonly string[]).includes(canal)) return 'claude'
  return 'desconhecido'
}

export function revisaoDoRefino(
  contrato: CopyAutoral,
  antes: string[],
  depois: string[],
  quem: { autor: Autor; superficie: string; em?: string },
  motivo: string,
): ResultadoDaRevisaoPosicional {
  if (antes.length !== depois.length) {
    return { descartado: `o planejador devolveu ${depois.length} bloco(s) para ${antes.length} enviado(s) e não há como saber qual bloco é qual` }
  }
  const mudancas = antes.map((a, i) => ({ i, antes: a, depois: depois[i] })).filter((m) => m.antes !== m.depois)
  if (mudancas.length === 0) return { copy: contrato, mudou: false }
  const emOrdem = blocosEmOrdem(contrato)
  const comTexto = emOrdem.filter((b) => b.linhas.some((l) => l.trim().length > 0))
  const chave = (t: string) => normalizeForComparison(t.replace(/\[|\]/g, ''))
  const novos = new Map<string, string[]>()
  for (const m of mudancas) {
    const candidatos = comTexto.filter((b) => !novos.has(b.id) && chave(b.linhas.join('\n')) === chave(m.antes))
    if (candidatos.length !== 1) {
      return {
        descartado:
          candidatos.length === 0
            ? `o texto enviado na posição ${m.i + 1} ("${m.antes.slice(0, 40)}") não corresponde a nenhum bloco do contrato`
            : `o texto enviado na posição ${m.i + 1} ("${m.antes.slice(0, 40)}") corresponde a ${candidatos.length} blocos do contrato`,
      }
    }
    novos.set(candidatos[0].id, m.depois.split('\n'))
  }
  const blocos: BlocoAutoral[] = emOrdem.map((b) => {
    const linhas = novos.get(b.id)
    if (!linhas) return b
    const { estilo: estiloAntigo, ...semEstilo } = b
    const voz2 = estiloAntigo?.linhasNaVoz2?.filter((i) => i < linhas.length) ?? []
    const { linhasNaVoz2: _fora, ...restoDoEstilo } = estiloAntigo ?? {}
    const estilo = { ...restoDoEstilo, ...(voz2.length > 0 ? { linhasNaVoz2: voz2 } : {}) }
    return { ...semEstilo, linhas, ...(Object.keys(estilo).length > 0 ? { estilo } : {}) }
  })
  // `tentarAplicarRevisao` confere o RESULTADO inteiro (9238098f). Nenhuma recusa derruba a melhoria: histórico cheio
  // ou contrato que não cabe voltam `descartado` com o motivo (vira lacuna no registro da run).
  const revisada = tentarAplicarRevisao(contrato, blocos, { autor: quem.autor, motivo, superficie: quem.superficie, ...(quem.em ? { em: quem.em } : {}) })
  if (revisada.historicoCheio) return { descartado: `o histórico da copy chegou ao limite de ${contrato.revisoes.length} revisões e a troca pedida não foi registrada no contrato` }
  if (!revisada.copy) return { descartado: `a revisão do refino deixou o contrato inválido (${revisada.problemas.map((p) => p.mensagem).join('; ')})${orientacaoEmFrase(orientacaoDosProblemas(revisada.problemas)).replace(/\.$/, '')}` }
  return { copy: revisada.copy, mudou: revisada.copy.revisoes.length !== contrato.revisoes.length }
}

/**
 * Uma lista POSICIONAL de textos aplicada sobre um contrato: vira REVISÃO
 * (de `quem`) quando casa posição a posição com os blocos que têm texto; a
 * segunda voz por índice acompanha a linha que sumiu. Quando não casa (número
 * de blocos diferente, ou o contrato ficaria inválido), devolve `descartado`
 * com o motivo — manter um contrato que não descreve mais o texto seria
 * mentir para a métrica. É a mesma regra do item de plano (PR 3) e do pedido
 * de refino da melhoria (PR 5): "troque a frase X por Y" é revisão EXPLÍCITA
 * do autor que pediu, nunca mudança silenciosa.
 */
export function revisaoPosicional(
  contrato: CopyAutoral,
  lista: string[],
  quem: { autor: Autor; superficie: string; em?: string },
  motivo: string,
): ResultadoDaRevisaoPosicional {
  const emOrdem = blocosEmOrdem(contrato)
  // "Com texto" é o MESMO critério do espelho do item (`espelhoDoContrato`, PR3-F06):
  // bloco de linhas só em branco fica fora da lista e fica intacto no contrato.
  const temTexto = (b: BlocoAutoral) => b.linhas.join('\n').trim() !== ''
  const comTexto = emOrdem.filter(temTexto)
  if (comTexto.length !== lista.length) {
    return { descartado: `a edição posicional mudou o número de blocos com texto (${comTexto.length} → ${lista.length}) e não há como saber qual bloco é qual` }
  }
  const novos: BlocoAutoral[] = emOrdem.map((b) => {
    if (!temTexto(b)) return b
    const linhas = lista[comTexto.indexOf(b)].split('\n')
    const { estilo: estiloAntigo, ...semEstilo } = b
    const voz2 = estiloAntigo?.linhasNaVoz2?.filter((i) => i < linhas.length) ?? []
    const { linhasNaVoz2: _fora, ...restoDoEstilo } = estiloAntigo ?? {}
    const estilo = { ...restoDoEstilo, ...(voz2.length > 0 ? { linhasNaVoz2: voz2 } : {}) }
    return { ...semEstilo, linhas, ...(Object.keys(estilo).length > 0 ? { estilo } : {}) }
  })
  // Histórico CHEIO PROPAGA de propósito: a edição posicional é do item de plano, e `plano-service` a devolve como 409
  // dizendo o que fazer — descartar o contrato aqui apagaria a autoria que o histórico guarda. O resultado que o leitor
  // recusaria (`tentarAplicarRevisao`, 9238098f) é descartado com o motivo e a orientação, como no PR 3.
  const revisada = tentarAplicarRevisao(contrato, novos, { autor: quem.autor, motivo, superficie: quem.superficie, ...(quem.em ? { em: quem.em } : {}) })
  if (revisada.historicoCheio) throw new HistoricoDaCopyCheio(contrato, revisada.mudancas)
  if (!revisada.copy) return { descartado: `a edição posicional deixou o contrato inválido (${revisada.problemas.map((p) => p.mensagem).join('; ')})${orientacaoEmFrase(orientacaoDosProblemas(revisada.problemas)).replace(/\.$/, '')}` }
  return { copy: revisada.copy, mudou: revisada.copy.revisoes.length !== contrato.revisoes.length }
}
