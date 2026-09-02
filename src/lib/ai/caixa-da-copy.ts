/**
 * A CAIXA da copy é tipografia, e ela chega decidida na string.
 *
 * POR QUE ISTO EXISTE
 *
 * O prompt de arte reproduz a copy verbatim, e o modelo copia a string LITERAL
 * que lê. Medido em 16/08/2026, com duas repetições de cada lado:
 *
 * - Instrução no prompt ("se o bloco vier em maiúsculas, a caixa é decisão
 *   sua"): 2 de 2 peças saíram em CAIXA ALTA do mesmo jeito. A linha
 *   `- "DESACELERE E DESFRUTE"`, três linhas acima, vence a instrução sobre ela.
 * - Mesma copy apresentada como "Desacelere e desfrute": 2 de 2 em caixa
 *   natural, com a conferência de texto passando.
 *
 * E a copy chega gritando: 85% das copies escritas no chat (55 de 65) têm o
 * primeiro bloco todo em maiúsculas — é como se escreve manchete num briefing.
 * O gerador da casa (`propor-semana`) escreve em caixa natural: 0 de 31.
 *
 * POR QUE TITLE CASE, E NÃO CAIXA DE FRASE
 *
 * Caixa de frase minúscula tudo depois da primeira palavra, e os blocos reais
 * em caixa alta estão cheios de nome próprio: "PRAIA DO CANTO", "RUA ELESBÃO
 * LINHARES, 52", "ESPETO GAÚCHO". Viraria "Praia do canto" — erro visível.
 * Title Case acerta nome próprio POR CONSTRUÇÃO; o preço é capitalizar
 * substantivo comum, o que lê como estilo editorial, não como defeito. É,
 * aliás, o que o DNA da Real Gelateria pede em letras: "caixa alta moderada ou
 * Title Case".
 *
 * O QUE ISTO NÃO FAZ
 *
 * Não decide se a manchete sai em caixa alta — decide apenas que a STRING para
 * de mandar nisso. Quem decide passa a ser a identidade da marca no prompt, que
 * é onde a regra de cada cliente já está escrita. Marca cujo DNA pede caixa
 * alta continua recebendo caixa alta do modelo.
 *
 * O texto GRAVADO não muda: isto roda na montagem do prompt. A conferência de
 * texto compara com `normalizeForComparison`, que termina em `.toUpperCase()` —
 * mudar a caixa nunca reprova uma arte.
 */

/**
 * A caixa que a MANCHETE desta marca pede, quando a marca pede alguma.
 *
 * As duas direções existem pela MESMA razão, e é a razão medida acima: a caixa
 * da arte é a caixa da string, e nenhuma instrução de prompt reverte isso.
 * Cliente ausente deste mapa recebe a copy como ela foi escrita.
 *
 * 🔴 `alta` nasceu do TERO em 17/08/2026, e o caso prova a lei uma terceira
 * vez. A peça tinha um MODELO escolhido à mão, e o MODELO SPINE dizia, com
 * todas as letras, `1. título · caixa ALTA` mais a regra "esta regra vence
 * qualquer outro palpite sobre caixa". O DNA dizia caixa alta em dois pontos
 * ("Didot em caixa alta e tracking largo"; "nível 1 em serif âmbar, caixa alta
 * espaçada"). Contra `- "Almoço executivo"` no bloco de copy, os três
 * perderam: as duas peças da leva saíram em caixa natural e o cliente reprovou
 * as duas ("A headline deve ser em caixa alta").
 *
 * O que mudou para o TERO precisar disto agora: até 16/08 a copy chegava
 * gritando por acidente, e era esse acidente que o protegia. As descrições das
 * tools passaram a pedir caixa natural a TODOS os clientes — o que resolveu a
 * Real Gelateria e desprotegeu quem pede caixa alta.
 */
export type CaixaDaManchete = 'natural' | 'alta'

export const CAIXA_DA_MANCHETE = new Map<number, CaixaDaManchete>([
  [1, 'natural'], // Real Gelateria — "caixa alta moderada ou Title Case"
  [2, 'natural'], // O Quintal Parrilla — proíbe caixa alta contínua fora de uma fonte
  [3, 'alta'], // TERO — "Didot em caixa alta e tracking largo" (pedido do Ciro, 17/08/2026)
  [5, 'alta'], // Bacana — manchete em CAIXA ALTA (Ciro, 02/09/2026, ao ver a bancada da carteira: "as letras devem ser em caixa alta")
  [11, 'natural'], // Wine Vix — "Title Case, com uma palavra em dourado"
  [12, 'natural'], // Empório Fonseca — "Trajan caixa mista" na promessa
])

/**
 * Clientes em que a copy gritada é DESFEITA antes de virar prompt.
 *
 * 🔴 Lista explícita, e não uma regra derivada do DNA em prosa, porque a
 * correção NÃO é neutra — foi medida em 16/08/2026, 2 repetições por cliente:
 *
 * - Real Gelateria (DNA: "caixa alta moderada ou Title Case"): a manchete saía
 *   "DESACELERE E DESFRUTE" e passou a sair "Desacelere e desfrute". Acerto.
 * - By Rock (DNA: "caixa alta para manchetes que precisam de impacto visual"):
 *   a manchete saía "HAPPY HOUR / TODO DIA" e passou a sair em Title Case nas
 *   duas rodadas. A regra de caixa alta da marca vive a ~68% de um DNA longo e
 *   NÃO segurou sozinha. Mudança de look que ninguém pediu.
 *
 * Por isso só entram aqui os clientes cujo DNA pede caixa natural. Os outros
 * (Seu Quinto, By Rock, Lagosta Criativa, Espeto Gaúcho, TERO) seguem com a
 * copy chegando como foi escrita — decisão do Ciro em 16/08/2026.
 *
 * ⚠️ MUDOU O DNA de um cliente? Esta lista não acompanha sozinha. Antes de
 * incluir ou tirar alguém, rode `scripts/medir-modelo-a-seguir.ts` contra uma
 * geração real dele: o que se olha é se a manchete sai na caixa que a marca
 * quer.
 */
export const PROJETOS_COM_CAIXA_NATURAL = new Set<number>(
  [...CAIXA_DA_MANCHETE].filter(([, caixa]) => caixa === 'natural').map(([id]) => id),
)

/**
 * Palavras que ficam em minúscula no meio de um título em português. A primeira
 * e a última palavra do bloco são sempre capitalizadas, mesmo estando aqui.
 */
const PALAVRAS_MENORES = new Set([
  'a', 'ao', 'aos', 'as', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'é',
  'em', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas',
  'pelo', 'pelos', 'por', 'pra', 'pro', 'que', 'se', 'sem', 'sob', 'sobre',
  'um', 'uma', 'umas', 'uns',
])

/**
 * Siglas que ficam em CAIXA ALTA — lista explícita, e não uma regra de tamanho.
 *
 * A primeira versão protegia todo token de até 3 letras, achando que pegaria
 * "OFF" e "DJ". Pegou "EM", "NO", "DO", "OS" e "RUA": rodada contra os 69
 * blocos reais do banco, saíam coisas como "Adega E Bistrô NA Praia DO Canto" e
 * "RUA Elesbão Linhares". Palavra curta comum é a MAIORIA das palavras curtas —
 * a sigla é a exceção, e exceção se enumera.
 */
const SIGLAS = new Set([
  'OFF', 'DJ', 'VIP', 'IPA', 'APA', 'CD', 'TV', 'ES', 'RJ', 'SP', 'MG', 'BA',
  'PDV', 'CEP', 'SAC', 'CNPJ', 'MC', 'XP',
])

const soLetras = (s: string) => [...s].filter((c) => /\p{L}/u.test(c))

/** Todas as letras do texto são maiúsculas (e há letra suficiente para julgar). */
export function estaTodoEmCaixaAlta(texto: string, minimoDeLetras = 5): boolean {
  const letras = soLetras(texto)
  if (letras.length < minimoDeLetras) return false
  return letras.every((c) => c === c.toLocaleUpperCase('pt-BR'))
}

/** Domínio, e-mail ou caminho — vai para minúscula inteiro, nunca Title Case. */
function pareceEndereco(token: string): boolean {
  return /^[^\s]+\.(com|br|com\.br|net|org|app|io)\b/i.test(token) || token.includes('@')
}

function capitalizar(palavra: string): string {
  // A capitalização cai na primeira LETRA, não no primeiro caractere: "(hoje"
  // e "'pausa" precisam pular o sinal de pontuação da frente.
  let feito = false
  return [...palavra]
    .map((c) => {
      if (feito || !/\p{L}/u.test(c)) return c
      feito = true
      return c.toLocaleUpperCase('pt-BR')
    })
    .join('')
}

function palavraEmTitleCase(
  bruta: string,
  ehExtremo: boolean,
  protegidas: Map<string, string>,
): string {
  if (pareceEndereco(bruta)) return bruta.toLocaleLowerCase('pt-BR')

  const minuscula = bruta.toLocaleLowerCase('pt-BR')
  const nua = minuscula.replace(/[^\p{L}]/gu, '')

  // Nome protegido (o da marca) volta com a grafia oficial, não com Title Case
  // genérico: "SABORES REAL" precisa de "Real", e "By Rock" de "By Rock".
  const oficial = protegidas.get(nua)
  if (oficial) return minuscula.replace(nua, oficial)

  if (SIGLAS.has(nua.toLocaleUpperCase('pt-BR'))) return bruta

  // Token colado a número é unidade: "11H" → "11h", "22H" → "22h".
  if (/\d/.test(bruta)) return bruta.toLocaleLowerCase('pt-BR')

  if (!ehExtremo && PALAVRAS_MENORES.has(nua)) return minuscula
  return capitalizar(minuscula)
}

/**
 * Sobe a MANCHETE para caixa alta. Bloco que já está em caixa alta passa
 * intacto, e a função é idempotente por construção.
 *
 * Vale só para a manchete — o primeiro bloco —, e não para a copy inteira, por
 * duas razões medidas nas peças do TERO: o apoio é Montserrat 300/400 em caixa
 * natural nas artes aprovadas da marca, e o CTA ("Vem provar") sai em caixa
 * natural nas peças que o cliente elogiou. Gritar tudo trocaria um defeito por
 * outro.
 */
export function paraCaixaAlta(bloco: string): string {
  return bloco.toLocaleUpperCase('pt-BR')
}

/**
 * Converte para Title Case um bloco que chegou TODO em maiúsculas. Bloco que
 * já veio em caixa natural (ou curto demais para julgar) passa intacto.
 *
 * `nomesDaMarca` são as palavras que devem voltar com a grafia oficial — em
 * geral os tokens do nome do projeto.
 */
export function paraCaixaNatural(bloco: string, nomesDaMarca: string[] = []): string {
  if (!estaTodoEmCaixaAlta(bloco)) return bloco

  const protegidas = new Map<string, string>()
  for (const nome of nomesDaMarca) {
    for (const token of nome.split(/\s+/)) {
      const nua = token.replace(/[^\p{L}]/gu, '')
      if (nua.length >= 2) protegidas.set(nua.toLocaleLowerCase('pt-BR'), token)
    }
  }

  // Linha a linha: num bloco de duas linhas cada uma é um nível visual próprio,
  // e a primeira palavra de cada uma se capitaliza como começo de frase.
  return bloco
    .split(/(\r?\n)/)
    .map((linha) => {
      if (!linha.trim()) return linha
      const tokens = linha.split(/(\s+)/)
      const dePalavra = tokens.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0)
      const primeiro = dePalavra[0]
      const ultimo = dePalavra[dePalavra.length - 1]
      return tokens
        .map((t, i) =>
          t.trim() ? palavraEmTitleCase(t, i === primeiro || i === ultimo, protegidas) : t,
        )
        .join('')
    })
    .join('')
}

/**
 * A caixa que a ARTE DE ORIGEM já tem, bloco a bloco — para a melhoria.
 *
 * 🔴 A caixa da arte é a caixa da STRING (lei medida três vezes em 16-17/08):
 * a melhoria recebe a copy do banco em caixa natural ("Domingo pede aquele
 * churrasco Bacana"), põe em [TEXTO EXATO] e o modelo redesenha em natural —
 * enquanto a arte de origem estava em CAIXA ALTA. Foi a única reprovação do
 * Ciro na bancada da carteira de 02/09/2026 ("só o Bacana não ficou bom pois
 * as letras devem ser em caixa alta").
 *
 * Fonte da verdade é a ORIGEM: para cada bloco esperado, se a transcrição da
 * arte original o mostra todo em maiúsculas, o bloco vai ao prompt em
 * maiúsculas. Sem transcrição casando, vale o mapa da marca (`alta` → só o
 * primeiro bloco). A régua da conferência continua a copy como veio — a
 * comparação ignora caixa.
 */
export function aplicarCaixaDaOrigem(
  expectedTexts: string[],
  transcricaoDaOrigem: string[],
  caixaDaMarca?: CaixaDaManchete,
): string[] {
  const normal = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
  const origem = transcricaoDaOrigem.map((t) => ({ bruto: t, chave: normal(t) }))
  return expectedTexts.map((bloco, i) => {
    const chave = normal(bloco)
    if (!chave) return bloco
    // O bloco esperado casa com a transcrição que o CONTÉM ou está CONTIDA
    // nele (a visão quebra o lockup em linhas).
    const casados = origem.filter((o) => o.chave.length >= 3 && (o.chave.includes(chave) || chave.includes(o.chave)))
    if (casados.length > 0) {
      // Só as letras do bloco esperado importam: um pedaço em caixa alta e
      // outro não (lockup "Domingo pede aquele churrasco" + "Bacana") é
      // resolvido pelo pedaço que casa por inteiro.
      const inteiro = casados.find((o) => o.chave === chave)
      const amostra = inteiro ? [inteiro] : casados
      const todoAlto = amostra.every((o) => estaTodoEmCaixaAlta(o.bruto, 3))
      return todoAlto ? paraCaixaAlta(bloco) : bloco
    }
    if (caixaDaMarca === 'alta' && i === 0) return paraCaixaAlta(bloco)
    return bloco
  })
}
