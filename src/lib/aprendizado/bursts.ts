/**
 * Detecção de BURST: o aglomerado de posts do mesmo pilar numa janela curta
 * que quase sempre é uma campanha que ninguém marcou como tal (F2).
 *
 * Por que isto importa mais do que parece: enquanto a campanha passa por
 * rotina, ela ensina cadência. Um festival de duas semanas com peça toda
 * quinta às 11h faz o sistema concluir que o cliente "costuma postar quinta às
 * 11h" — e continuar sugerindo esse horário meses depois de o festival acabar.
 * Foi o que se viu no Wine Vix em 11/08/2026: 4 peças do Festival Italiano em
 * 4 dias, todas marcadas ROTINA.
 *
 * O detector PROPÕE; quem confirma é gente, com um clique. Ele não marca
 * campanha sozinho — errar para mais tiraria posts legítimos da cadência, e
 * essa perda é silenciosa.
 *
 * Módulo PURO: recebe posts já classificados e devolve candidatas.
 */

/**
 * Dias sem nenhuma peça do mesmo pilar que quebram o aglomerado em dois.
 *
 * 🔴 Precisa ser MENOR que 7. Com 8 (o primeiro valor tentado), a rotina
 * semanal do cliente — uma peça de happy hour toda sexta, o ano inteiro —
 * virava UM aglomerado só de 8 peças em 56 dias, sem nada "fora" dele para
 * servir de linha de base; passava por campanha e teria tirado a rotina
 * verdadeira da cadência. Campanha publica mais junto que uma vez por semana;
 * é isso que a separa do hábito.
 */
export const GAP_MAXIMO_DIAS = 5
/** Menos que isto é coincidência, não campanha. */
export const MINIMO_DE_POSTS = 3
/** Aglomerado mais longo que isto é linha editorial, não campanha. */
export const MAXIMO_DE_DURACAO_DIAS = 60
/** Quantas vezes a densidade tem de superar a linha de base do próprio pilar. */
export const FATOR_SOBRE_A_BASE = 2

/**
 * Piso absoluto de densidade (peças por dia) dentro do aglomerado.
 *
 * Existe para o caso em que a linha de base é ZERO — assunto que só aparece
 * naquela janela. Sem o piso, três peças espalhadas em seis semanas contariam
 * como campanha só por serem as únicas daquele assunto. 0,4 é uma peça a cada
 * dois dias e meio.
 */
export const DENSIDADE_MINIMA = 0.4
/** Aglomerado cujo último post é mais recente que isto pode estar em curso. */
export const DIAS_PARA_EM_ANDAMENTO = 7

const DIA_MS = 24 * 3600_000

export interface PostClassificado {
  id: string
  pilar: string | null
  quando: Date
  /** Já pertence a uma campanha? Aglomerado já resolvido não vira candidata. */
  campaignId?: string | null
  /** Texto curto para a pessoa reconhecer a campanha na tela. */
  amostraDeTexto?: string | null
}

export interface CampanhaCandidata {
  pilar: string
  inicio: Date
  fim: Date
  /** Dias entre a primeira e a última peça (mínimo 1). */
  duracaoEmDias: number
  postIds: string[]
  /** Peças por dia dentro do aglomerado. */
  densidade: number
  /** Peças por dia do mesmo pilar FORA do aglomerado. */
  linhaDeBase: number
  /** Fração das peças daquele pilar que estão dentro do aglomerado (0..1). */
  concentracao: number
  /** O último post é recente demais para cravar que a campanha terminou. */
  emAndamento: boolean
  /** Frases dos posts, para reconhecer a campanha de olho. */
  amostras: string[]
  /** Por que isto foi proposto, em português. */
  motivo: string
}

function dias(a: Date, b: Date): number {
  return Math.max(1, Math.round(Math.abs(b.getTime() - a.getTime()) / DIA_MS))
}

function formatarBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Encontra as campanhas candidatas.
 *
 * O agrupamento é por LACUNA (single-linkage): peças do mesmo pilar separadas
 * por menos de `GAP_MAXIMO_DIAS` pertencem ao mesmo aglomerado. É o critério
 * que corresponde ao que uma campanha é na prática — uma sequência densa com
 * começo e fim —, e não depende de escolher o tamanho de janela certo, que era
 * o problema de varrer janelas fixas.
 *
 * `agora` é injetável para o teste não depender do relógio.
 */
export function detectarCampanhas(
  posts: PostClassificado[],
  opcoes: { agora?: Date; minimoDePosts?: number } = {},
): CampanhaCandidata[] {
  const agora = opcoes.agora ?? new Date()
  const minimo = opcoes.minimoDePosts ?? MINIMO_DE_POSTS

  const porPilar = new Map<string, PostClassificado[]>()
  for (const p of posts) {
    // `outro` e `sem-texto` não formam campanha: o primeiro é o balde do que
    // não se encaixou, o segundo é o do que ninguém conseguiu ler. Detectar
    // "campanha de sem-texto" seria detectar o próprio buraco de instrumentação.
    if (!p.pilar || p.pilar === 'outro' || p.pilar === 'sem-texto') continue
    const lista = porPilar.get(p.pilar) ?? []
    lista.push(p)
    porPilar.set(p.pilar, lista)
  }

  const candidatas: CampanhaCandidata[] = []

  for (const [pilar, todos] of porPilar) {
    const ordenados = [...todos].sort((a, b) => a.quando.getTime() - b.quando.getTime())

    const grupos: PostClassificado[][] = []
    let atual: PostClassificado[] = []
    for (const p of ordenados) {
      if (atual.length === 0) {
        atual = [p]
        continue
      }
      const anterior = atual[atual.length - 1]
      if (p.quando.getTime() - anterior.quando.getTime() <= GAP_MAXIMO_DIAS * DIA_MS) atual.push(p)
      else {
        grupos.push(atual)
        atual = [p]
      }
    }
    if (atual.length > 0) grupos.push(atual)

    for (const grupo of grupos) {
      if (grupo.length < minimo) continue
      // Aglomerado já resolvido (alguém marcou a campanha) não volta a
      // aparecer como candidata.
      if (grupo.every((p) => p.campaignId)) continue

      const inicio = grupo[0].quando
      const fim = grupo[grupo.length - 1].quando
      const duracaoEmDias = dias(inicio, fim)
      if (duracaoEmDias > MAXIMO_DE_DURACAO_DIAS) continue

      const densidade = grupo.length / duracaoEmDias
      if (densidade < DENSIDADE_MINIMA) continue
      const fora = ordenados.filter((p) => p.quando < inicio || p.quando > fim)
      const spanTotal = dias(ordenados[0].quando, ordenados[ordenados.length - 1].quando)
      const diasFora = Math.max(1, spanTotal - duracaoEmDias)
      const linhaDeBase = fora.length / diasFora

      if (linhaDeBase > 0 && densidade < FATOR_SOBRE_A_BASE * linhaDeBase) continue

      const concentracao = grupo.length / ordenados.length
      const emAndamento = agora.getTime() - fim.getTime() <= DIAS_PARA_EM_ANDAMENTO * DIA_MS

      const motivo =
        fora.length === 0
          ? `${grupo.length} peças deste assunto em ${duracaoEmDias} dia(s), e ele não aparece em mais nenhum outro momento do histórico.`
          : `${grupo.length} peças deste assunto entre ${formatarBR(inicio)} e ${formatarBR(fim)} — ${(densidade / Math.max(linhaDeBase, 1e-9)).toFixed(1)}× mais denso que o resto do histórico, onde o assunto sai a cada ${(1 / Math.max(linhaDeBase, 1e-9)).toFixed(0)} dias.`

      candidatas.push({
        pilar,
        inicio,
        fim,
        duracaoEmDias,
        postIds: grupo.map((p) => p.id),
        densidade,
        linhaDeBase,
        concentracao,
        emAndamento,
        amostras: Array.from(
          new Set(grupo.map((p) => (p.amostraDeTexto ?? '').trim()).filter(Boolean)),
        ).slice(0, 4),
        motivo,
      })
    }
  }

  // Mais peças primeiro; empate, a mais recente.
  return candidatas.sort(
    (a, b) => b.postIds.length - a.postIds.length || b.fim.getTime() - a.fim.getTime(),
  )
}
