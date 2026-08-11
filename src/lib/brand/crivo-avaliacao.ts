/**
 * Conferência automática do crivo de aprovação.
 *
 * O crivo antigo mostrava as perguntas do DNA como caixas de marcar, e o
 * quadradinho significava "eu li" — não "conforme". Como o único caminho para
 * frente era marcar TUDO (14 perguntas no Wine Vix, 35 no Quintal) e a
 * polaridade era mista ("algumas reprovam no sim, outras no não") num aviso de
 * texto que ninguém carrega na cabeça, ele virou o pedágio que se paga sem
 * ler: exatamente o que o desenho dizia querer evitar.
 *
 * A decisão de 10/08/2026 (Ciro) inverte o ônus: **o sistema confere o que
 * consegue verificar sozinho, mostrando a evidência, e o humano responde só o
 * que exige olho.** Uma pergunta sobre horário se responde comparando o
 * agendamento com a base de conhecimento; uma sobre o enquadramento da foto,
 * não — e fingir que sim seria o mesmo pedágio com carimbo de máquina.
 *
 * Três contratos que sustentam isso:
 *
 * 1. **A imagem não entra aqui.** A avaliação é de DADO (dia/hora em BRT,
 *    copy, base, DNA, fontes cadastradas). Tudo que depende de ver a arte é
 *    `preciso-de-olho` por construção, e o prompt proíbe o modelo de fingir
 *    que viu. Quem olha pixel é o QA de visão (`creative-qa.ts`), que responde
 *    outra pergunta.
 * 2. **Reprova AVISA, nunca veta** — a mesma regra da conferência de arte. A
 *    UI oferece "Voltar e ajustar" e "Agendar mesmo assim"; a base de
 *    conhecimento pode estar velha, e recusar publicação por metadado é pior
 *    que publicar com aviso.
 * 3. **Falha degrada para o crivo manual, nunca bloqueia.** Modelo fora do ar,
 *    timeout, resposta torta: tudo vira `preciso-de-olho` com as perguntas
 *    ORIGINAIS. Ninguém fica sem agendar porque a OpenAI piscou.
 *
 * ⚠️ Isto NÃO transforma `approvalChecklist` em prompt de geração — a regra da
 * casa continua valendo. O crivo é lido aqui como PERGUNTA a ser respondida
 * sobre uma peça pronta, nunca como instrução de como desenhá-la.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { loadBrandContext, type BrandContext } from '@/lib/brand/brand-context'
import {
  agendamentoEmBrasilia,
  crivoManual,
  parseApprovalChecklist,
  reconciliarVeredito,
  type AgendamentoEmBrasilia,
  type AvaliacaoDoCrivo,
  type PecaParaCrivo,
} from '@/lib/brand/approval-checklist'
import { getProjectPromptKnowledgeContext } from '@/lib/knowledge/search'

/** Modelo barato: é leitura de evidência contra pergunta, não raciocínio. */
const MODELO = 'gpt-4o-mini'

/**
 * Teto do tempo de espera. A tela mostra "Conferindo a peça…" enquanto isso;
 * passar disso é pior que cair no crivo manual, porque quem está agendando
 * fica parado olhando um spinner.
 */
const TIMEOUT_MS = 45_000

/**
 * Teto de perguntas numa avaliação. O Quintal tem 35 e cabe folgado; o teto
 * existe para um DNA colado errado (um manual inteiro no campo) não virar uma
 * chamada gigante — nesse caso o crivo manual é a resposta honesta.
 */
const MAX_PERGUNTAS = 60

/**
 * 🔴 Todo campo é OPCIONAL de propósito.
 *
 * Com eles obrigatórios, o zod recusava a resposta INTEIRA quando o modelo
 * omitia um só — e ele omite: medido em 11/08/2026 no By Rock, o gpt-4o-mini
 * devolveu 15 vereditos corretos e bem formados, mas sem `simSignifica` na
 * maioria dos itens, e as 3 tentativas caíram no crivo manual por causa disso.
 * Quinze respostas boas jogadas fora por um campo ausente é o pior negócio
 * possível aqui.
 *
 * Quem exige rigor é `reconciliarVeredito`, que já trata cada campo como
 * suspeito e devolve para o olho humano o que não vier completo. Validação de
 * saída de modelo é reconciliação, não parse.
 */
const respostaSchema = z.object({
  itens: z.array(
    z.object({
      indice: z.number().int().describe('O número da pergunta, exatamente como recebido'),
      // O ECO. Escrever a pergunta antes de julgá-la ancora a resposta nela —
      // e dá ao código como CONFERIR que a resposta foi para o lugar certo.
      eco: z
        .string()
        .optional()
        .describe(
          'Copie as primeiras 6 a 10 palavras da pergunta que você está respondendo, exatamente como estão escritas.',
        ),
      // Primeiro campo depois do índice, e de propósito: a pergunta "isto dá
      // para responder sem ver a arte?" precisa ser respondida ANTES do
      // veredito, senão o modelo já entrou no mérito e justifica o que
      // imaginou. O código usa isto como TRAVA, não como sugestão.
      dependeDeVerAImagem: z
        .boolean()
        .optional()
        .describe(
          'true quando responder exige OLHAR a arte (foto, cena, layout, cores usadas, fontes usadas, logo, emoji na arte, área segura, legibilidade, comparação com a peça anterior). false quando dá para responder pelos dados fornecidos.',
        ),
      veredito: z.enum(['conforme', 'reprova', 'preciso-de-olho']).optional(),
      evidencia: z
        .string()
        .optional()
        .describe(
          'Uma frase curta citando o dado concreto que sustenta o veredito. Em preciso-de-olho, diga o que a pessoa deve olhar.',
        ),
      // Ordem importa: o modelo escreve este campo ANTES de decidir se
      // reescreve a pergunta, então o julgamento de polaridade fica explícito
      // na resposta em vez de implícito num booleano. Quem converte isso em
      // "inverter ou não" é o CÓDIGO, não o modelo.
      simSignifica: z
        .enum(['certa', 'errada'])
        .optional()
        .describe(
          'Se alguém responder SIM a esta pergunta, exatamente como ela está escrita, isso quer dizer que a peça está "certa" ou "errada"? Responda SEMPRE, em toda pergunta.',
        ),
      perguntaInvertida: z
        .string()
        .optional()
        .describe(
          'Preencha SÓ quando simSignifica for "errada": a mesma pergunta invertida, de modo que SIM passe a significar que a peça está certa. Quando simSignifica for "certa", string VAZIA.',
        ),
    }),
  ),
})

/**
 * Tudo que o sistema já sabe sobre a peça, reunido num lugar só.
 *
 * Separado do prompt de propósito: é o que a rota devolve para auditoria e o
 * que um teste consegue montar à mão sem chamar modelo nenhum.
 */
export interface PacoteDeEvidencias {
  marca: string
  agendamento: AgendamentoEmBrasilia | null
  formato: string | null
  copy: string[]
  legenda: string | null
  /** Base de conhecimento do projeto, já formatada (horários, campanhas, cardápio). */
  conhecimento: string
  /** Avisos da busca na base — "nada relevante encontrado" é evidência também. */
  avisosDaBase: string[]
  fontes: { title: string | null; subtitle: string | null; body: string | null }
  cores: Array<{ name: string; hexCode: string }>
  dna: {
    toneOfVoice: string | null
    contentRules: string | null
    composition: string | null
    visualStyle: string | null
    photoDirection: string | null
  }
}

export interface ResultadoDaAvaliacao extends AvaliacaoDoCrivo {
  evidencias: PacoteDeEvidencias | null
}

/** A consulta que vai à base: o que a peça diz, mais quando ela sai. */
function consultaDaBase(peca: PecaParaCrivo, agendamento: AgendamentoEmBrasilia | null): string {
  return [
    ...peca.copy,
    peca.legenda ?? '',
    agendamento ? `${agendamento.diaDaSemana} às ${agendamento.hora}` : '',
    peca.formato ?? '',
  ]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' \n')
}

/** O que a base do projeto tem a dizer sobre esta peça. */
export interface ConhecimentoDaPeca {
  conhecimento: string
  avisos: string[]
}

/**
 * Consulta a base do projeto. Nunca lança: sem ela a conferência apenas
 * responde menos perguntas sozinha, e manda o resto para o olho humano.
 *
 * Só precisa do `projectId` — por isso pode correr em paralelo com o
 * carregamento do DNA, que é a outra metade do tempo de espera.
 */
export async function buscarConhecimento(
  projectId: number,
  peca: PecaParaCrivo,
): Promise<ConhecimentoDaPeca> {
  const consulta = consultaDaBase(peca, agendamentoEmBrasilia(peca.quando))
  if (consulta.length === 0) return { conhecimento: '', avisos: [] }
  try {
    const resultado = await getProjectPromptKnowledgeContext(
      consulta,
      { projectId },
      { topKPerCategory: 2, maxTokens: 1400, minScore: 0.55 },
    )
    return { conhecimento: resultado.context, avisos: resultado.warnings }
  } catch (error) {
    console.warn('[crivo] base de conhecimento indisponível:', error)
    return {
      conhecimento: '',
      avisos: ['A base de conhecimento do projeto não pôde ser consultada.'],
    }
  }
}

/** Reúne num objeto só tudo que o sistema sabe sobre a peça. */
export function montarEvidencias(
  contexto: BrandContext,
  peca: PecaParaCrivo,
  daBase: ConhecimentoDaPeca,
): PacoteDeEvidencias {
  const agendamento = agendamentoEmBrasilia(peca.quando)
  const { conhecimento, avisos: avisosDaBase } = daBase

  return {
    marca: contexto.projectName,
    agendamento,
    formato: peca.formato ?? null,
    copy: peca.copy.map((c) => c.trim()).filter(Boolean),
    legenda: peca.legenda?.trim() || null,
    conhecimento,
    avisosDaBase,
    fontes: contexto.fonts,
    cores: contexto.colors,
    dna: {
      toneOfVoice: contexto.dna.toneOfVoice,
      contentRules: contexto.dna.contentRules,
      composition: contexto.dna.composition,
      visualStyle: contexto.dna.visualStyle,
      photoDirection: contexto.dna.photoDirection,
    },
  }
}

/** As evidências em texto, na ordem em que ajudam a responder as perguntas. */
export function evidenciasEmTexto(e: PacoteDeEvidencias): string {
  const blocos: string[] = []

  blocos.push(`MARCA: ${e.marca}`)

  if (e.agendamento) {
    blocos.push(
      `QUANDO A PEÇA VAI AO AR (horário de Brasília): ${e.agendamento.diaDaSemana}, ${e.agendamento.data}, às ${e.agendamento.hora}`,
    )
  } else {
    blocos.push('QUANDO A PEÇA VAI AO AR: não informado — não é possível conferir dia nem horário.')
  }

  if (e.formato) blocos.push(`FORMATO: ${e.formato}`)

  blocos.push(
    e.copy.length > 0
      ? `TEXTOS DA PEÇA (o que está escrito na arte):\n${e.copy.map((c) => `- "${c}"`).join('\n')}`
      : 'TEXTOS DA PEÇA: nenhum (peça sem copy, foto pura).',
  )

  if (e.legenda) blocos.push(`LEGENDA DO POST:\n"${e.legenda}"`)

  blocos.push(
    e.conhecimento.trim().length > 0
      ? `BASE DE CONHECIMENTO DO CLIENTE (horários, campanhas vigentes, cardápio, diferenciais):\n${e.conhecimento}`
      : 'BASE DE CONHECIMENTO DO CLIENTE: nada relevante foi encontrado para esta peça. Não invente horário, preço nem regra.',
  )

  if (e.avisosDaBase.length > 0) {
    blocos.push(`AVISOS DA BASE: ${e.avisosDaBase.join(' ')}`)
  }

  const fontes = [
    e.fontes.title ? `título: ${e.fontes.title}` : null,
    e.fontes.subtitle ? `subtítulo: ${e.fontes.subtitle}` : null,
    e.fontes.body ? `corpo: ${e.fontes.body}` : null,
  ].filter(Boolean)
  blocos.push(
    fontes.length > 0
      ? `FONTES OFICIAIS CADASTRADAS (${fontes.join(', ')}). Atenção: isto é o que a marca DEVE usar; não diz o que a arte de fato usou — isso só se vê olhando.`
      : 'FONTES OFICIAIS CADASTRADAS: nenhuma.',
  )

  if (e.cores.length > 0) {
    blocos.push(
      `PALETA OFICIAL: ${e.cores.map((c) => `${c.name} (${c.hexCode})`).join(', ')}. Também é o que a marca DEVE usar, não o que a arte usou.`,
    )
  }

  const dna = [
    e.dna.contentRules ? `REGRAS DE CONTEÚDO:\n${e.dna.contentRules}` : null,
    e.dna.toneOfVoice ? `TOM DE VOZ:\n${e.dna.toneOfVoice}` : null,
    e.dna.composition ? `COMPOSIÇÃO:\n${e.dna.composition}` : null,
    e.dna.visualStyle ? `ESTILO VISUAL:\n${e.dna.visualStyle}` : null,
    e.dna.photoDirection ? `DIREÇÃO FOTOGRÁFICA:\n${e.dna.photoDirection}` : null,
  ].filter(Boolean)
  if (dna.length > 0) blocos.push(`DNA DA MARCA:\n${dna.join('\n\n')}`)

  return blocos.join('\n\n')
}

const INSTRUCOES = [
  'Você é o revisor de uma agência de conteúdo para restaurantes. Recebeu o CRIVO DE APROVAÇÃO de uma marca — as perguntas que alguém responde antes de uma peça ir para a agenda — e as EVIDÊNCIAS que o sistema conseguiu reunir sobre esta peça.',
  '',
  '🔴 VOCÊ NÃO RECEBEU A ARTE. Nenhuma imagem foi enviada e nenhuma será. Você tem apenas os dados listados em EVIDÊNCIAS: o horário, os textos, a base de conhecimento e o DNA.',
  '',
  '=== TAREFA 1: dá para responder sem ver a arte? ===',
  '',
  'Antes de julgar qualquer coisa, preencha "dependeDeVerAImagem".',
  'É `true` sempre que responder exigir OLHAR a peça: conteúdo e enquadramento da foto, cena, ambiente, pessoas, rótulos, layout, diagramação, posição e tamanho do texto, cores usadas, fontes usadas, logotipo, área segura, legibilidade, corte, emoji dentro da arte, elementos gráficos, comparação com a peça anterior.',
  'A lista de fontes e a paleta que você recebeu dizem o que a marca DEVE usar — NÃO dizem o que esta arte usou. Pergunta sobre a fonte ou a cor da arte é `true`.',
  'Também é `true` o que depende de informação que você não tem: histórico de peças anteriores, autorização de imagem, se um show foi confirmado, se existe foto no acervo, quantas peças com preço já saíram no dia.',
  'É `false` quando os dados bastam: dia da semana, horário, o que a copy diz ou deixa de dizer, conferência contra a base de conhecimento.',
  '',
  '=== TAREFA 2: o veredito ===',
  '',
  'Com "dependeDeVerAImagem" = true, o veredito é SEMPRE "preciso-de-olho". Não julgue o que você não viu, nem invente uma justificativa plausível para isso.',
  'Com false, escolha:',
  '- "conforme": as evidências mostram que a peça está de acordo. Só quando o DADO estiver ali.',
  '- "reprova": as evidências mostram um conflito concreto (ex.: a copy diz 17h–20h e a base diz que o happy hour é 16h–19h).',
  '- "preciso-de-olho": os dados que você tem não respondem.',
  '',
  'NUNCA invente horário, preço, dia de funcionamento, cardápio ou regra. Se a base de conhecimento não cobre o assunto, é "preciso-de-olho" — não "conforme".',
  'Só marque "reprova" quando puder citar o conflito. Suspeita não é reprovação: na dúvida, "preciso-de-olho".',
  '',
  'CONDICIONAIS: muitas perguntas começam com "Se…". Quando a condição NÃO se aplica a esta peça, o veredito é "conforme" — a regra foi respeitada por não ter sido acionada. Exemplo: "Se é peça de almoço, está em dia útil?" numa peça de happy hour é "conforme", com evidência "não é peça de almoço". Nunca reprove por isso.',
  '',
  'EVIDÊNCIA: uma frase curta, em português, citando o dado concreto.',
  '- conforme: "agendado para terça 17:00, dentro do horário 10h–22h da base".',
  '- reprova: "a copy anuncia 17h–20h, mas o happy hour cadastrado é 16h–19h".',
  '- preciso-de-olho: diga o que a pessoa deve olhar — "só olhando a arte para saber se a foto é do salão da casa".',
  '',
  '=== TAREFA 3: a REDAÇÃO da pergunta ===',
  '',
  '🔴 Esta parte é sobre COMO A PERGUNTA ESTÁ ESCRITA, não sobre a peça. Vários exemplos abaixo são perguntas visuais: elas continuam com "dependeDeVerAImagem" = true e veredito "preciso-de-olho". Reescrever uma pergunta NÃO é respondê-la.',
  '',
  'Na tela, a pessoa MARCA uma caixa para dizer "conferi, está certo". Para isso funcionar, responder SIM à pergunta precisa ser uma coisa BOA. O crivo desta marca mistura os dois tipos, e é isso que confunde quem aprova.',
  'Em cada pergunta, faça o teste e preencha "simSignifica": se alguém responder SIM à pergunta como ela está escrita, a peça está "certa" ou "errada"?',
  '',
  'SIM = "errada" (o crivo pergunta por um DEFEITO; escreva a invertida):',
  '- "O layout é igual ao da peça anterior?" → "O layout é diferente do da peça anterior?"',
  '- "Existe mais de uma oferta na mesma peça?" → "A peça tem uma oferta só?"',
  '- "Tem emoji dentro da arte?" → "A arte está sem emoji?"',
  '- "Aparece alguma palavra da lista de proibidas?" → "A copy está livre das palavras proibidas?"',
  '- "O vermelho está ocupando mais que um acento pequeno?" → "O vermelho é só um acento pequeno?"',
  '',
  'SIM = "certa" (o crivo pergunta por um ACERTO; deixe perguntaInvertida vazia):',
  '- "Gramática impecável?"',
  '- "A foto acontece dentro do salão real da casa?"',
  '- "O texto ocupa no máximo um quarto do quadro?"',
  '- "O CTA é cópia literal de um dos seis?"',
  '',
  'Julgue cada uma pelo que ela pergunta, sem cota: há crivo com muitas de um tipo e nenhuma do outro, e a maioria das perguntas já está escrita como acerto.',
  '🔴 Ao inverter, REESCREVA a frase — não basta enfiar um "não" nela. "Tem emoji dentro da arte?" vira "A arte está sem emoji?", nunca "A arte não tem emoji?". Inversão feita com "não" é descartada pelo sistema.',
  '🔴 O erro a nunca cometer é negativar uma pergunta que já estava boa: transformar "Gramática impecável?" em "A gramática NÃO está impecável?" faria a pessoa marcar o oposto do que quis dizer.',
  'Ao inverter, mantenha o vocabulário da marca, seja curto e não junte duas perguntas numa.',
  '',
  'Seja BREVE: a pessoa está esperando na tela para agendar. Evidência de uma linha, sem repetir a pergunta dentro dela.',
  '',
  'Responda TODAS as perguntas, uma vez cada, usando o índice exatamente como recebido.',
  '🔴 Em "eco", copie as primeiras 6 a 10 palavras da pergunta que você está respondendo, exatamente como aparecem na lista. É o que garante que a sua resposta não vá parar na pergunta errada — e resposta desalinhada é descartada.',
  '🔴 Lembre, agora que leu tudo: você NÃO recebeu a arte. Toda pergunta sobre o que aparece nela é "dependeDeVerAImagem" = true e "preciso-de-olho".',
].join('\n')

/** O prompt inteiro, montado. Exportado para inspeção e teste. */
export function montarPrompt(evidencias: PacoteDeEvidencias, perguntas: string[]): string {
  return [
    INSTRUCOES,
    '',
    '=== EVIDÊNCIAS ===',
    evidenciasEmTexto(evidencias),
    '',
    '=== CRIVO DE APROVAÇÃO DA MARCA ===',
    perguntas.map((p, i) => `${i}. ${p}`).join('\n'),
  ].join('\n')
}

/**
 * Confere a peça contra o crivo da marca.
 *
 * Nunca lança: qualquer problema vira crivo manual. É contrato — quem chama
 * está no caminho do AGENDAR, e o pior desfecho possível é a pessoa não
 * conseguir agendar porque o revisor automático caiu.
 */
export async function avaliarCrivo(
  projectId: number,
  peca: PecaParaCrivo,
): Promise<ResultadoDaAvaliacao> {
  // As duas leituras correm juntas: a base só precisa do `projectId`, e
  // esperar o DNA para só então consultá-la somava dois tempos de rede na cara
  // de quem está parado olhando o spinner.
  const conhecimentoPrometido = buscarConhecimento(projectId, peca)

  let contexto: BrandContext | null = null
  try {
    contexto = await loadBrandContext(projectId)
  } catch (error) {
    console.error('[crivo] não foi possível carregar o DNA:', error)
    void conhecimentoPrometido.catch(() => {})
    return { ...crivoManual([], 'O DNA da marca não pôde ser carregado.'), evidencias: null }
  }

  const perguntas = parseApprovalChecklist(contexto?.dna.approvalChecklist ?? null)
  if (!contexto || perguntas.length === 0) {
    // Sem crivo cadastrado não há o que conferir — e a bancada nem abre o
    // modal nesse caso. Devolvido como avaliação vazia e NÃO degradada.
    return {
      itens: [],
      degradado: false,
      avaliadoEm: new Date().toISOString(),
      evidencias: null,
    }
  }

  if (perguntas.length > MAX_PERGUNTAS) {
    return {
      ...crivoManual(
        perguntas,
        `O crivo desta marca tem ${perguntas.length} perguntas (o teto da conferência automática é ${MAX_PERGUNTAS}).`,
      ),
      evidencias: null,
    }
  }

  const evidencias = montarEvidencias(contexto, peca, await conhecimentoPrometido)

  try {
    const { object } = await generateObject({
      model: openai(MODELO),
      temperature: 0,
      // ~90 tokens por pergunta (evidência + pergunta reescrita), com folga
      // para as 35 do Quintal.
      maxOutputTokens: 6_000,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      schema: respostaSchema,
      messages: [{ role: 'user', content: montarPrompt(evidencias, perguntas) }],
    })

    const itens = reconciliarVeredito(perguntas, object.itens)
    const resultado: ResultadoDaAvaliacao = {
      itens,
      degradado: false,
      avaliadoEm: new Date().toISOString(),
      evidencias,
    }

    await registrarNaGeneration(peca.generationId, resultado)
    return resultado
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'erro desconhecido'
    console.warn('[crivo] conferência automática indisponível — caindo no crivo manual:', motivo)
    return {
      ...crivoManual(perguntas, 'A conferência automática não respondeu.'),
      evidencias,
    }
  }
}

/**
 * Guarda o resultado em `Generation.fieldValues.crivo`.
 *
 * MERGE, nunca substituição: `fieldValues` é o registro atômico da run (prompt,
 * refs, params, veredito) que galeria, MCP e QA leem. Sobrescrever o objeto
 * inteiro para acrescentar um campo apagaria a procedência da arte.
 *
 * Telemetria não derruba fluxo: qualquer erro aqui vira log. A avaliação já
 * está na mão de quem está agendando — perdê-la no banco é o menor dos males.
 */
async function registrarNaGeneration(
  generationId: string | null | undefined,
  resultado: ResultadoDaAvaliacao,
): Promise<void> {
  if (!generationId) return
  try {
    const atual = await db.generation.findUnique({
      where: { id: generationId },
      select: { fieldValues: true },
    })
    if (!atual) return

    const anterior = (atual.fieldValues ?? {}) as Record<string, unknown>
    await db.generation.update({
      where: { id: generationId },
      data: {
        fieldValues: {
          ...anterior,
          crivo: {
            avaliadoEm: resultado.avaliadoEm,
            degradado: resultado.degradado,
            // O resumo é o que se consulta depois; a lista inteira fica junto
            // para ninguém precisar reconstruir o "por quê" de cabeça.
            resumo: resumirVereditos(resultado),
            itens: resultado.itens.map((i) => ({
              indice: i.indice,
              pergunta: i.pergunta,
              veredito: i.veredito,
              evidencia: i.evidencia,
            })),
          },
        } as never,
      },
    })
  } catch (error) {
    console.warn('[crivo] não foi possível gravar a avaliação na Generation:', error)
  }
}

/** Quantos itens em cada veredito — o número que se olha primeiro. */
export function resumirVereditos(avaliacao: Pick<AvaliacaoDoCrivo, 'itens'>): {
  conforme: number
  reprova: number
  precisaDeOlho: number
} {
  return {
    conforme: avaliacao.itens.filter((i) => i.veredito === 'conforme').length,
    reprova: avaliacao.itens.filter((i) => i.veredito === 'reprova').length,
    precisaDeOlho: avaliacao.itens.filter((i) => i.veredito === 'preciso-de-olho').length,
  }
}
