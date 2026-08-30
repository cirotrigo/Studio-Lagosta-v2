/**
 * Vocabulário da captura de sinais de uso (F1).
 *
 * Um SINAL é a unidade do aprendizado por uso: "isto foi proposto, aquilo foi
 * escolhido". As duas metades moram na mesma linha (`LearningSignal`) e
 * qualquer uma delas pode estar vazia:
 *
 *   - sugestão SEM desfecho  → proposta ainda em aberto (ou que expirou);
 *   - desfecho SEM sugestão  → **escolha absoluta**, a pessoa decidiu sem que
 *     o sistema tivesse proposto nada. Nas primeiras semanas, antes de a dica
 *     de copy existir, é o ÚNICO corpus que haverá — por isso não é caso
 *     especial nem linha órfã: é uma linha completa com a metade de cima nula.
 *
 * Este módulo NÃO importa Prisma nem `@/lib/db`, de propósito: o compositor da
 * bancada é client e vai precisar dos rótulos (mesma razão de
 * `learning-scope.ts`, `art-direction.ts` e `approval-checklist.ts`).
 *
 * Por que TEXT no banco em vez de enum do Postgres: é o precedente da F0.2
 * (`SocialPost.origem` é TEXT "porque o vocabulário ainda se move na fase de
 * captura") e há uma razão operacional — as migrations da casa são escritas à
 * mão e aplicadas com `migrate deploy`, que roda cada migration numa
 * transação, e `ALTER TYPE … ADD VALUE` não pode ser usado no mesmo bloco em
 * que é criado. Vocabulário que ainda vai crescer na F2 fica em TEXT; a
 * validação mora aqui, num só lugar.
 */

/** O que foi proposto/decidido. */
export type TipoDeSinal =
  /** Quando postar: dia e hora (o `sugerirPosts` emite estes). */
  | 'slot'
  /** O texto da peça — headline, subtítulo, legenda. */
  | 'copy'
  /** A imagem: foto do acervo, do Drive, upload. */
  | 'foto'
  /** A página-modelo que serve de base para a arte. */
  | 'modelo'
  /**
   * A ARTE PRONTA, julgada por gente: "gostei" / "preciso melhorar".
   *
   * É o par que faltava do registro atômico — toda geração já grava
   * `{prompt, refs, params}` em `Generation.fieldValues`, e este sinal amarra
   * a opinião humana ao prompt exato que a produziu. Também é o KPI honesto de
   * qualidade desde que os vereditos por IA foram desligados (10-11/08/2026).
   */
  | 'arte'
  /**
   * A arte que estava no post foi SUBSTITUÍDA por outra, com o post ainda em
   * rascunho — a recusa mais explícita que existe sobre uma peça pronta.
   *
   * Não entra em `arte` de propósito: lá o `escolhido` carrega um veredito
   * (`gostei`/`melhorar`) e o relatório de feedback filtra por `tipo: 'arte'`
   * com teto de linhas — linhas sem veredito comeriam o orçamento da leitura e
   * empurrariam feedback de verdade para fora da janela.
   */
  | 'troca-de-arte'
  /**
   * Um item de um PLANO de conteúdo (F3) foi reprovado com motivo, ANTES de
   * virar arte.
   *
   * Não cabe em `arte` (não há arte para julgar nem prompt a que amarrar o
   * julgamento) nem em `copy`/`slot`/`modelo`: a recusa é da PROPOSTA inteira
   * — o tema, o horário, o modelo e o texto juntos —, e espalhá-la pelos três
   * inventaria três opiniões onde houve uma. Quando o item JÁ tem arte, a
   * reprovação vira feedback de arte (`tipo: 'arte'`), que é o sinal mais
   * valioso porque carrega o prompt atrás.
   */
  | 'item-de-plano'
  /**
   * A LEGENDA do post (a caption do Instagram), registrada quando o post entra
   * na agenda e revisada quando alguém a edita depois.
   *
   * Não cabe em `copy` de propósito: `copy` são os textos DA ARTE, com diff
   * contra a dica de copy do plano — o consumidor (perfil, mineração) trata
   * aquele shape como slots chaveados. O post do fluxo de canvas nasce só com
   * legenda e SEM `slotValues`, então sem este tipo ele ficava fora do corpus
   * inteiro (o caso descoberto em 29/08/2026: o caminho que mais cresce era o
   * único que não ensinava nada).
   */
  | 'legenda'

export const TIPOS_DE_SINAL: TipoDeSinal[] = [
  'slot',
  'copy',
  'foto',
  'modelo',
  'arte',
  'troca-de-arte',
  'item-de-plano',
  'legenda',
]

/**
 * Como a proposta terminou.
 *
 * `escolha-propria` é o desfecho das linhas SEM sugestão — e é o que mantém a
 * conta do KPI honesta: o denominador é "sugestões emitidas"
 * (`sugeridoEm IS NOT NULL`), então a escolha absoluta entra no corpus sem
 * entrar na taxa de aceitação.
 */
export type Desfecho =
  /** Foi usado exatamente como veio. */
  | 'aceita-como-veio'
  /** Foi usado, mas alterado (a copy mudou, o horário andou). */
  | 'editada'
  /** Foi substituído por outra coisa (outro modelo, outra foto). */
  | 'trocada'
  /** Foi recusado sem substituto. */
  | 'descartada'
  /** Ninguém decidiu dentro da janela — a proposta perdeu a validade. */
  | 'expirada'
  /** Não houve sugestão nenhuma: a pessoa escolheu do zero. */
  | 'escolha-propria'

export const DESFECHOS: Desfecho[] = [
  'aceita-como-veio',
  'editada',
  'trocada',
  'descartada',
  'expirada',
  'escolha-propria',
]

/** Onde a decisão foi tomada. */
export type Superficie =
  | 'bancada'
  | 'chat'
  | 'editor'
  | 'agenda'
  /** Decidido por mecanismo, não por gente (a varredura que expira propostas). */
  | 'sistema'
  /** A galeria de criativos — onde a arte pronta é aberta em tamanho grande. */
  | 'galeria'

export const SUPERFICIES: Superficie[] = [
  'bancada',
  'chat',
  'editor',
  'agenda',
  'sistema',
  'galeria',
]

/**
 * Força do desfecho — a ordem em que uma revisão pode SOBRESCREVER a anterior.
 *
 * O desfecho não fecha no agendamento: a F4 exige que a janela vá até a
 * publicação, porque uma edição posterior (`editar-post`, `ajustar-arte`, a
 * agenda) diz mais sobre a proposta do que o "aceitei" de dez minutos antes.
 * Sem essa regra, a taxa de aceitação infla sozinha.
 *
 * Só sobe: `aceita-como-veio` → `editada`/`trocada`/`descartada` é permitido;
 * o caminho de volta, não. `expirada` é o mais fraco (só vale sobre o vazio) e
 * `escolha-propria` não participa — é o desfecho de uma linha que nasce
 * decidida.
 */
const FORCA: Record<Desfecho, number> = {
  expirada: 1,
  'aceita-como-veio': 2,
  editada: 3,
  trocada: 3,
  descartada: 4,
  'escolha-propria': 0,
}

/** `true` quando o novo desfecho é evidência mais forte que o já gravado. */
export function desfechoVenceOAnterior(anterior: Desfecho | null | undefined, novo: Desfecho): boolean {
  if (!anterior) return true
  if (anterior === novo) return false
  if (novo === 'escolha-propria' || anterior === 'escolha-propria') return false
  return FORCA[novo] > FORCA[anterior]
}

/** Os desfechos que só fazem sentido com uma sugestão do outro lado. */
export function exigeSugestao(desfecho: Desfecho): boolean {
  return desfecho !== 'escolha-propria'
}

function normalizarTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
  return limpo || null
}

/** Aceita variações de caixa/acento/underscore. `undefined` = desconhecido. */
export function normalizarTipo(valor: unknown): TipoDeSinal | undefined {
  const limpo = normalizarTexto(valor)
  return TIPOS_DE_SINAL.find((t) => t === limpo)
}

/** Idem para o desfecho. Nunca inventa: valor estranho vira `undefined`. */
export function normalizarDesfecho(valor: unknown): Desfecho | undefined {
  const limpo = normalizarTexto(valor)
  return DESFECHOS.find((d) => d === limpo)
}

/** Idem para a superfície. */
export function normalizarSuperficie(valor: unknown): Superficie | undefined {
  const limpo = normalizarTexto(valor)
  return SUPERFICIES.find((s) => s === limpo)
}

/**
 * Por que a pessoa TROCOU a foto proposta (F4) — o chip opcional pós-troca.
 *
 * Vai em `escolhido.motivo` do sinal de foto (Json — a coluna segue TEXT
 * livre, pela mesma razão dos tipos acima). **Nunca obrigatório, nunca
 * bloqueia**: pedágio se paga sem ler. O vocabulário é fechado porque o motivo
 * refina o score (`prato-antigo` rebaixa global; `nao-e-o-assunto` rebaixa só
 * no tema) — texto livre não agrega.
 */
export const MOTIVOS_DE_TROCA_DE_FOTO = [
  'escura',
  'prato-antigo',
  'nao-e-o-assunto',
  'repetida',
  'outro',
] as const

export type MotivoDeTrocaDeFoto = (typeof MOTIVOS_DE_TROCA_DE_FOTO)[number]

/** Valor fora do vocabulário é DESCARTADO em silêncio por quem grava. */
export function motivoDeTrocaValido(valor: unknown): valor is MotivoDeTrocaDeFoto {
  return (
    typeof valor === 'string' &&
    (MOTIVOS_DE_TROCA_DE_FOTO as readonly string[]).includes(valor)
  )
}
