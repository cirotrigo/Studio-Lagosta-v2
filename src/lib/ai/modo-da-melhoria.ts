/**
 * O MODO da melhoria — o que a pessoa quer que aconteça com a arte pronta.
 *
 * Módulo PURO (sem Prisma, sem SDK): o modal da galeria, a bancada e o
 * catálogo do MCP precisam do vocabulário e dos rótulos, e são client ou
 * carregam sem env (mesma razão de `qualidade-arte.ts` e `art-direction.ts`).
 *
 * Por que existe (05/09/2026, `docs/PLANO-2026-09-05-ARTES-COMO-O-CHATGPT.md`):
 * a melhoria só sabia PRESERVAR desde 04/09 (regras da casa: "a estrutura é
 * dada, nada se move de zona, nada se cria"). Está certo para a peça que sai
 * do compositor ou do canvas, com halo e assinatura aprovados — e é o oposto
 * do que se quer quando a origem é uma tabela chapada exportada do editor. O
 * Ciro levou uma dessas ao ChatGPT com "melhore a diagramação, deixe no estilo
 * real gelato" e voltou uma peça editorial com pills, filetes e a serifa da
 * marca; a mesma peça pelo Studio saía igual à origem. Medido no A/B da F0:
 * o prompt de produção (22 mil chars, preservador) contra um prompt curto de
 * redesenho com o manual da marca como referência.
 *
 * Três modos, e a diferença entre eles é o que o gerador PODE mudar:
 *
 *  - `rediagramar`: a peça já foi diagramada por quem cuida da marca. Muda só
 *    onde o conjunto do texto pousa sobre a foto, o respiro e a quebra de linha.
 *    Blocos, ordem, agrupamento, fontes, cores e foto ficam.
 *  - `redesenhar`: a peça é matéria-prima. O gerador refaz a diagramação no
 *    estilo da marca (manual do designer e prancha tipográfica como
 *    referência), com a copy verbatim e a foto intocada.
 *  - `refinar`: a peça é uma melhoria anterior e a pessoa pede UMA mudança
 *    ("troque a frase X por Y", "remova o selo"). Muda só o que foi pedido e
 *    nada mais — é o segundo e o terceiro turno da conversa do ChatGPT. Aqui,
 *    e SÓ aqui, a copy esperada pode mudar: o pedido pode trocar texto.
 */

export type ModoDaMelhoria = 'rediagramar' | 'redesenhar' | 'refinar'

export const MODOS_DA_MELHORIA: ModoDaMelhoria[] = ['rediagramar', 'redesenhar', 'refinar']

export const MODO_DA_MELHORIA_PADRAO: ModoDaMelhoria = 'rediagramar'

/**
 * Rótulos para quem NÃO é técnico (mesma regra que proíbe DRAFT/SCHEDULED na
 * conversa): falam do que acontece com a arte, nunca de prompt ou de modelo.
 */
export const ROTULO_DO_MODO: Record<ModoDaMelhoria, { titulo: string; descricao: string }> = {
  rediagramar: {
    titulo: 'Ajustar a leitura',
    descricao:
      'Mantém os textos, as fontes, as cores e a foto. Só melhora onde o texto pousa, o respiro e a quebra das linhas.',
  },
  redesenhar: {
    titulo: 'Redesenhar no estilo da marca',
    descricao:
      'Refaz a diagramação inteira com o manual da marca como referência: hierarquia, ornamentos e tipografia. A copy e a foto não mudam.',
  },
  refinar: {
    titulo: 'Só o que eu pedir',
    descricao:
      'Faz exatamente a mudança pedida (trocar uma frase, tirar um elemento, mover um bloco) e mantém todo o resto igual.',
  },
}

/**
 * De onde a arte veio, no vocabulário do `fieldValues.source` da Generation.
 * `null`/`undefined` é o export do editor (Generation sem `fieldValues`).
 */
export interface OrigemDaArte {
  source?: string | null
  /** A arte É uma melhoria anterior (tem `sourceGenerationId`). */
  ehMelhoria?: boolean
}

/**
 * Origens cuja diagramação foi APROVADA por alguém antes de chegar aqui: o
 * compositor (assinatura da marca, halo por papel), o canvas de design
 * (`arte-enviada`, com halo e margens próprias) e a mídia que já está num post.
 * Para elas, redesenhar é jogar fora trabalho aprovado — o padrão preserva.
 */
const ORIGENS_DIAGRAMADAS = new Set(['compositor', 'arte-enviada', 'post-midia', 'post-schedule', 'impresso-mesa'])

/**
 * O padrão por origem — o botão do modal já vem marcado nele.
 *
 *  - melhoria anterior → `refinar` (a pessoa está iterando a MESMA peça);
 *  - compositor / canvas / mídia de post → `rediagramar` (diagramação aprovada);
 *  - tudo o mais (export do editor sem `fieldValues`, `arte-rapida`,
 *    `ajuste-arte`, `arte-livre`, `arte-ia`) → `redesenhar`: são peças que
 *    nasceram de template chapado ou de uma primeira rodada de IA, e o que se
 *    quer delas é o acabamento de marca.
 *
 * É heurística, não regra: quem pede escolhe. A decisão de produto continua
 * sendo do Ciro (o plano registra isso) — o botão resolve enquanto não há
 * regra melhor.
 */
export function modoPadraoDaMelhoria(origem: OrigemDaArte): ModoDaMelhoria {
  if (origem.ehMelhoria) return 'refinar'
  const source = origem.source ?? null
  if (source && ORIGENS_DIAGRAMADAS.has(source)) return 'rediagramar'
  return 'redesenhar'
}

export function ehModoDaMelhoria(valor: unknown): valor is ModoDaMelhoria {
  return typeof valor === 'string' && (MODOS_DA_MELHORIA as string[]).includes(valor)
}
