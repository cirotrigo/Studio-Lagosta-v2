/**
 * Revisão ortográfica da copy — o CONTRATO.
 *
 * Módulo SEM dependências de propósito: quem consome é o compositor da
 * bancada, que é client. `revisao-ortografica.ts` puxa o Prisma e o SDK de IA,
 * e `@/lib/db` **lança no import** quando falta `DATABASE_URL` — arrastar isso
 * para o bundle do navegador (ou para um teste unitário) é o mesmo defeito que
 * já obrigou `approval-checklist.ts`, `art-direction.ts`, `learning-scope.ts` e
 * `text-comparison.ts` a morarem fora dos seus serviços.
 *
 * O que mora aqui é a parte que decide o que é erro DE VERDADE:
 *
 * 1. **Reconciliação, não parse.** A saída do modelo é tratada como suspeita
 *    até provar o contrário — mesma regra do crivo (`reconciliarVeredito`).
 *    Todo campo é opcional no schema, e o rigor está em conferir cada item
 *    contra o texto que a pessoa realmente escreveu.
 * 2. **O vocabulário da marca protege a forma que a casa REALMENTE escreve.**
 *    É o coração do desenho, e a comparação é direcional — ver
 *    `protegidoPelaMarca`. "chopp" e "picanha" ficam de pé porque estão no
 *    cardápio; "disponivel" cai porque quem está no cardápio é "disponível".
 * 3. **A FORMA da troca decide se ela é ortografia**, não o rótulo que o
 *    modelo deu ao próprio trabalho — ver `trocaPlausivel`. Reescrita
 *    disfarçada de correção é descartada pelo código.
 */

/** O que o modelo devolve, antes de ser conferido. Tudo opcional de propósito. */
export interface SuspeitaBruta {
  trecho?: string | null
  sugestao?: string | null
  motivo?: string | null
}

/** Uma suspeita já reconciliada: existe no texto e vale a pena mostrar. */
export interface Suspeita {
  /** O trecho errado, exatamente como está no texto da pessoa. */
  trecho: string
  /** Como ficaria corrigido. Clicar nela aplica — é o usuário aceitando. */
  sugestao: string
  /** Uma frase curta ("falta o acento", "concordância"). */
  motivo: string
}

export interface RevisaoOrtografica {
  suspeitas: Suspeita[]
  /**
   * A revisão não pôde ser feita (modelo fora do ar, timeout, projeto sem
   * marca). A UI trata como SILÊNCIO — nunca como erro na cara de quem digita.
   */
  indisponivel: boolean
}

/**
 * O vocabulário da casa, na forma que a reconciliação consome.
 *
 * `termos` e `corpus` vêm em MINÚSCULAS mas COM acento: a comparação precisa
 * distinguir "disponível" de "disponivel", que é o par que a revisão persegue.
 */
export interface VocabularioDaMarca {
  /** Palavras distintas que aparecem em algum texto da marca. */
  termos: string[]
  /** Tudo junto, em minúsculas — para casar expressões de mais de uma palavra. */
  corpus: string
}

/**
 * Teto de suspeitas mostradas. A linha embaixo do campo é discreta por
 * contrato; vinte apontamentos ali viram o pedágio que o crivo já provou que
 * ninguém lê.
 */
export const MAX_SUSPEITAS = 6

/** Texto curto demais não vale uma chamada de modelo. */
export const MIN_CARACTERES_PARA_REVISAR = 8

const REGEX_TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu

/** Minúsculas e espaços colapsados. Acento MANTIDO — é o objeto da revisão. */
export function normalizar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')
}

/** Sem acento nenhum, para descobrir se duas grafias só diferem nisso. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * `true` quando trecho e sugestão são a MESMA palavra escrita com acentuação
 * diferente ("disponivel" × "disponível"), e `false` quando a troca mexe nas
 * letras ("chopp" × "chope").
 */
export function soMudaAcento(trecho: string, sugestao: string): boolean {
  const a = normalizar(trecho)
  const b = normalizar(sugestao)
  if (a === b) return false
  return semAcento(a) === semAcento(b)
}

/** As palavras de um trecho, em minúsculas e com acento. */
function palavras(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length > 0)
}

/**
 * Teto de palavras num recorte de concordância.
 *
 * Erro de concordância é LOCAL: artigo, adjetivo, substantivo e verbo vizinhos
 * ("os melhor prato"). Recorte maior que isto é reescrita de frase com nome de
 * correção — medido em 11/08/2026, quando o gpt-4o-mini devolveu
 * "rock, petisco e boa companhia" → "rock, petiscos e boa companhia", que é
 * preferência de estilo, não erro.
 */
const MAX_PALAVRAS_EM_CONCORDANCIA = 3

/**
 * A troca proposta cabe numa correção de CONCORDÂNCIA?
 *
 * Concordância mexe na TERMINAÇÃO ("os melhor prato" → "os melhores pratos"),
 * nunca no radical, e num punhado de palavras vizinhas. Quando o modelo
 * recorta mais de uma palavra e devolve algo cujo radical mudou — ou recorta
 * meia frase —, o que ele fez foi REESCREVER a copy, e reescrever copy de
 * cliente não é trabalho desta revisão.
 *
 * 🔴 Todos os alarmes falsos medidos em 11/08/2026 passaram por aqui, e nenhum
 * deles seria pego por regra de prompt: "A NOITE PEDE" → "A NOITE PIDE" (com
 * motivo plausível e uma palavra que não existe) e o recorte de cinco palavras
 * acima. A trava é do CÓDIGO — mesma lição do crivo, onde "você não viu a
 * imagem" não sobreviveu como instrução.
 *
 * Palavra curta (até 3 letras) é artigo, preposição ou pronome: ali a troca é
 * do vocábulo inteiro ("a problema" → "o problema") e não há radical que
 * comparar.
 */
export function concordanciaPlausivel(trecho: string, sugestao: string): boolean {
  const antes = palavras(trecho)
  const depois = palavras(sugestao)
  if (antes.length === 0 || antes.length !== depois.length) return false
  if (antes.length > MAX_PALAVRAS_EM_CONCORDANCIA) return false

  return antes.every((palavra, i) => {
    const nova = depois[i]
    if (palavra === nova) return true
    const a = semAcento(palavra)
    const b = semAcento(nova)
    if (a === b) return true
    if (a.length <= 3 && b.length <= 3) return true
    return a.slice(0, 3) === b.slice(0, 3)
  })
}

/**
 * A troca proposta tem a FORMA de uma correção de ortografia?
 *
 * A forma decide, não o rótulo que o modelo deu ao próprio trabalho:
 *
 * - só muda o acento → é acentuação, por construção;
 * - uma palavra vira uma palavra → é grafia;
 * - mais de uma palavra → só passa como concordância (ver acima).
 */
export function trocaPlausivel(trecho: string, sugestao: string): boolean {
  if (soMudaAcento(trecho, sugestao)) return true
  const antes = palavras(trecho)
  const depois = palavras(sugestao)
  if (antes.length === 1 && depois.length === 1) return true
  return concordanciaPlausivel(trecho, sugestao)
}

/**
 * Junta os textos da marca num vocabulário consultável.
 *
 * Fontes típicas: nome do projeto, títulos e conteúdo da base de conhecimento
 * (cardápio, campanhas, diferenciais) e as seções do DNA. Quanto mais amplo,
 * menos alarme falso — o custo de proteger uma palavra demais é baixo, o de
 * acusar o nome de um prato é a morte da funcionalidade.
 */
export function extrairVocabulario(fontes: Array<string | null | undefined>): VocabularioDaMarca {
  const texto = fontes.filter(Boolean).join('\n')
  const corpus = normalizar(texto)
  const termos = new Set<string>()
  for (const match of corpus.matchAll(REGEX_TOKEN)) {
    const termo = match[0]
    if (termo.length >= 2) termos.add(termo)
  }
  return { termos: Array.from(termos), corpus }
}

/**
 * A palavra (ou expressão) é da casa — isto é, o vocabulário PROTEGE a forma
 * que a pessoa escreveu?
 *
 * A comparação é DIRECIONAL, e é o que faz a proteção não cegar a revisão:
 *
 * - só o trecho é palavra da casa → protege. É assim que "picanha" não vira
 *   "picanhã" e "chopp" não vira "chope" no By Rock (medido: `picanha` e
 *   `chopp` estão no vocabulário, `picanhã` e `chope` não).
 * - só a sugestão é palavra da casa → NÃO protege: a casa escreve do outro
 *   jeito, e o aviso é justamente o que falta. É o caso do Wine Vix, cujo
 *   vocabulário tem `disponível` e não tem `disponivel`.
 * - as duas são → empate, e aí quem decide é o acento: acentuação é a classe
 *   de erro que esta revisão existe para pegar, então a proteção cai. Não é
 *   hipótese: o Espeto Gaúcho tem `almoço` E `almoco` na base, e sem esta
 *   ressalva um typo lá dentro cegaria a revisão para o "ALMOCO" de todas as
 *   artes futuras.
 * - nenhuma é → não é palavra da casa, a proteção não se aplica.
 */
export function protegidoPelaMarca(
  trecho: string,
  sugestao: string,
  vocabulario: VocabularioDaMarca,
): boolean {
  const alvo = normalizar(trecho)
  if (!alvo) return false
  const proposta = normalizar(sugestao)

  const conhece = (termo: string) =>
    termo.includes(' ') ? vocabulario.corpus.includes(termo) : vocabulario.termos.includes(termo)

  if (!conhece(alvo)) return false
  if (!conhece(proposta)) return true

  return !soMudaAcento(trecho, sugestao)
}

/**
 * Confere item a item o que o modelo devolveu, contra o texto que a pessoa
 * escreveu e contra o vocabulário da marca.
 *
 * Descarta, nesta ordem: campo vazio ou comprido demais; trecho que NÃO
 * aparece literalmente no texto (o modelo parafraseou ou inventou); sugestão
 * que não muda nada; troca sem forma de correção ortográfica (reescrita
 * disfarçada); palavra da casa; repetição. É a mesma postura do crivo — saída
 * de modelo se valida por reconciliação, nunca por parse.
 */
export function reconciliarSuspeitas(
  textos: string[],
  brutas: SuspeitaBruta[] | null | undefined,
  vocabulario: VocabularioDaMarca,
): Suspeita[] {
  if (!Array.isArray(brutas)) return []

  const alvo = normalizar(textos.filter(Boolean).join('\n'))
  const vistas = new Set<string>()
  const suspeitas: Suspeita[] = []

  for (const bruta of brutas) {
    if (suspeitas.length >= MAX_SUSPEITAS) break

    const trecho = (bruta?.trecho ?? '').replace(/\s+/g, ' ').trim()
    const sugestao = (bruta?.sugestao ?? '').replace(/\s+/g, ' ').trim()
    if (!trecho || !sugestao) continue
    if (trecho.length > 80 || sugestao.length > 80) continue

    const chave = normalizar(trecho)
    if (vistas.has(chave)) continue

    // O trecho tem de EXISTIR no texto — é o que amarra a resposta ao que foi
    // enviado. Sem isso, um modelo que reescreve a frase para "explicar" o
    // erro produz uma correção que a UI não conseguiria aplicar.
    if (!alvo.includes(chave)) continue

    if (normalizar(sugestao) === chave) continue
    if (!trocaPlausivel(trecho, sugestao)) continue
    if (protegidoPelaMarca(trecho, sugestao, vocabulario)) continue

    vistas.add(chave)
    suspeitas.push({
      trecho,
      sugestao,
      motivo: (bruta?.motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'possível erro',
    })
  }

  return suspeitas
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Aplica a sugestão ao texto, preservando a CAIXA de cada ocorrência.
 *
 * A copy da bancada é escrita em maiúsculas na maior parte das peças; trocar
 * "DISPONIVEL" por "disponível" consertaria o acento e estragaria o desenho.
 * Ocorrência toda em maiúsculas recebe a sugestão em maiúsculas; ocorrência
 * capitalizada recebe a sugestão capitalizada; o resto vai como veio.
 */
export function aplicarSugestao(texto: string, suspeita: Suspeita): string {
  if (!texto) return texto
  const regex = new RegExp(escaparRegex(suspeita.trecho), 'gi')
  return texto.replace(regex, (encontrado) => {
    // DUAS letras, não uma: "R$ 49,90" tem só o "R" maiúsculo e não é caixa
    // alta — tratá-lo como tal devolvia "R$ 49,90 POR PESSOA".
    const letras = encontrado.match(/\p{L}/gu) ?? []
    if (letras.length >= 2 && encontrado === encontrado.toLocaleUpperCase('pt-BR')) {
      return suspeita.sugestao.toLocaleUpperCase('pt-BR')
    }
    const primeira = encontrado[0]
    if (primeira && primeira === primeira.toLocaleUpperCase('pt-BR') && /\p{L}/u.test(primeira)) {
      return suspeita.sugestao.charAt(0).toLocaleUpperCase('pt-BR') + suspeita.sugestao.slice(1)
    }
    return suspeita.sugestao
  })
}

/** Aplica a sugestão a vários campos de uma vez (copy, slides, legenda). */
export function aplicarSugestaoEmTodos(textos: string[], suspeita: Suspeita): string[] {
  return textos.map((t) => aplicarSugestao(t, suspeita))
}

/**
 * Nomes próprios e termos distintos da marca, para o prompt.
 *
 * Heurística deliberadamente simples: palavra iniciada em maiúscula FORA do
 * começo da frase é quase sempre nome próprio ("Aerosmith", "Chopp",
 * "Torresmo Rock", "Praia do Canto"). Mandar a base inteira ao modelo custaria
 * tokens e latência num caminho que roda a cada pausa da digitação; mandar
 * nada devolve o alarme falso que mata a funcionalidade.
 */
export function termosDaMarca(fontes: Array<string | null | undefined>, max = 200): string[] {
  const texto = fontes.filter(Boolean).join('\n')
  const frequencia = new Map<string, { forma: string; vezes: number }>()

  for (const frase of texto.split(/[\n.!?:;]+/)) {
    const tokens = frase.match(/[\p{L}\p{N}][\p{L}\p{N}'’&-]*/gu)
    if (!tokens) continue
    // O primeiro token da frase começa em maiúscula por gramática, não por ser
    // nome próprio — entra na lista só quando reaparece no meio de outra.
    for (const token of tokens.slice(1)) {
      if (token.length < 3) continue
      const inicial = token[0]
      if (inicial !== inicial.toLocaleUpperCase('pt-BR')) continue
      if (!/\p{L}/u.test(inicial)) continue
      const chave = normalizar(token)
      const atual = frequencia.get(chave)
      if (atual) atual.vezes += 1
      else frequencia.set(chave, { forma: token, vezes: 1 })
    }
  }

  return Array.from(frequencia.values())
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, max)
    .map((t) => t.forma)
}
