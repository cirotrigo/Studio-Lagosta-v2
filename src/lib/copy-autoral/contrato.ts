/**
 * O CONTRATO DA COPY AUTORAL (F1 de "Marca simples, copy melhor", 12/09/2026).
 *
 * Quem escreve é o Claude, no chat; o Studio é guardião da FIDELIDADE — o texto
 * escrito chega inteiro à arte, e cada transformação no caminho tem nome e
 * dono. Até aqui a copy viajava como `string[]` posicional (`ItemDePlano.
 * copyProposta`) ou como `Bloco[]` por papel (`spec.blocos`), e o caminho até a
 * arte cortava, reordenava ou transformava o texto em pelo menos uma dezena de
 * pontos sem que ninguém ficasse sabendo (seção 6 do plano).
 *
 * O que o contrato guarda, por bloco:
 *  - `id`: identidade ESTÁVEL do bloco, dada pelo autor (é por ela que a copy
 *    escrita se compara com a copy desenhada, bloco a bloco);
 *  - `funcao`: o que o texto FAZ (pré-título, manchete, apoio, chamada, serviço,
 *    livre) — separada de como aparece;
 *  - `grupoDeLeitura`: os blocos que se leem como UMA frase (pré-título que
 *    termina no conector da manchete); é do AUTOR, não deduzido do papel;
 *  - `ordem`: a ordem de leitura, explícita (a ordem do array não é contrato);
 *  - `linhas`: o texto EXATO, linha a linha, com caixa, acento e os [colchetes]
 *    de destaque como o autor escreveu — nenhuma normalização aqui;
 *  - `fatos`: as entradas da base que sustentam o que o bloco afirma (preço,
 *    horário, data, promoção só passam com lastro — a trava é da guarda, e a
 *    referência é o que a torna auditável);
 *  - `estilo`: o estilo pedido (o papel da assinatura de que herda, e a segunda
 *    voz da manchete DECLARADA pelo autor, nunca inferida da última linha).
 *
 * E, na copy inteira: `versao` do contrato, a `origem` (quem escreveu) e o
 * histórico de `revisoes` — cada mudança com autor (claude · equipe · sistema ·
 * desconhecido), data, motivo e o que mudou. "Desconhecido" existe de
 * propósito: o adaptador do legado NÃO inventa autoria.
 *
 * Distinções que o contrato preserva e o legado perdia:
 *  - campo OMITIDO (o autor não escreveu aquele bloco) ≠ bloco VAZIO (o autor
 *    mandou `linhas: []` de propósito — no legado os dois viravam "sem texto");
 *  - caixa mista, acento e quebra são CONTEÚDO do autor (a caixa vem da string,
 *    lei de 16-17/08/2026), e os colchetes são MARCAÇÃO que só quem desenha
 *    remove.
 *
 * Módulo PURO (zod + tipos), sem Prisma: a bancada e o servidor local importam
 * sem env, e os testes rodam sem banco.
 */

import { z } from 'zod'

export const VERSAO_DO_CONTRATO = 'copy-autoral-v1' as const

/** Teto de linhas por bloco — e, por consequência, do índice que a voz 2 pode apontar. */
export const MAX_LINHAS = 12

/** Teto de blocos numa copy. */
export const MAX_BLOCOS_NA_COPY = 40

/**
 * Teto de ids tocados numa revisão. Trocar TODOS os blocos por outros toca os
 * que saem e os que entram — até `2 × MAX_BLOCOS_NA_COPY`. Com o teto igual ao
 * de blocos, `aplicarRevisao` produzia uma revisão que o próprio leitor
 * recusava (PR2-02 da revisão final do Codex, 13/09/2026).
 */
export const MAX_BLOCOS_TOCADOS_POR_REVISAO = 2 * MAX_BLOCOS_NA_COPY

/**
 * Teto do histórico. Chegando nele, `aplicarRevisao` RECUSA a mudança
 * (`HistoricoDaCopyCheio`) — nunca apaga revisão antiga para abrir espaço:
 * autoria e registro de remoção não se descartam.
 */
export const MAX_REVISOES_DA_COPY = 200

/** O que o texto FAZ. `livre` é o bloco sem papel de assinatura (camada extra, F3). */
export const FUNCOES = ['pre', 'headline', 'apoio', 'cta', 'servico', 'livre'] as const
export type FuncaoDoBloco = (typeof FUNCOES)[number]

/** Quem mexeu na copy. `desconhecido` é o legado sem registro — nunca se inventa autor. */
export const AUTORES = ['claude', 'equipe', 'sistema', 'desconhecido'] as const
export type Autor = (typeof AUTORES)[number]

/** Um id de bloco: curto, estável, sem espaço — é chave de comparação e de camada. */
export const idDeBlocoSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'id de bloco: letras, dígitos, ponto, traço e sublinhado, começando por letra ou dígito')

export const referenciaDeFatoSchema = z
  .object({
    /** Id da entrada da base (`KnowledgeBaseEntry.id`) que sustenta o bloco. */
    entradaId: z.string().min(1).max(60),
    /** O trecho do bloco que a entrada sustenta (preço, horário…), como escrito. */
    trecho: z.string().min(1).max(200).optional(),
  })
  .strict()
export type ReferenciaDeFato = z.infer<typeof referenciaDeFatoSchema>

export const estiloDoBlocoSchema = z
  .object({
    /**
     * O papel da ASSINATURA de que o bloco herda fonte, peso, cor, tracking,
     * sombra e fundo. Uma linha de serviço pode herdar o estilo do apoio sem
     * virar apoio (função ≠ estilo).
     */
    herdaDe: z.enum(FUNCOES.filter((f) => f !== 'livre') as unknown as [FuncaoDoBloco, ...FuncaoDoBloco[]]).optional(),
    /**
     * A SEGUNDA VOZ da manchete, declarada pelo autor: os índices (0-based) das
     * linhas que saem na voz 2. Até aqui a última linha mudava de voz sozinha,
     * e ao passar de duas para três linhas o destaque trocava de trecho.
     */
    linhasNaVoz2: z.array(z.number().int().min(0).max(MAX_LINHAS - 1)).max(MAX_LINHAS).optional(),
    /**
     * Onde a camada EXTRA pousa (F3): `principal` (junto do bloco da manchete),
     * `topo` ou `rodape`. Grupo VISUAL ≠ grupo de LEITURA: este controla posição;
     * `grupoDeLeitura` liga trechos de uma frase. Só vale com `herdaDe`.
     */
    grupoVisual: z.enum(['principal', 'topo', 'rodape']).optional(),
  })
  .strict()
export type EstiloDoBloco = z.infer<typeof estiloDoBlocoSchema>

export const blocoAutoralSchema = z
  .object({
    id: idDeBlocoSchema,
    funcao: z.enum(FUNCOES),
    /** Os blocos que se leem como UMA frase. Um nome de grupo, do autor. Sem grupo = frase própria. */
    /**
     * Nome livre (1–60): o leitor v1 sempre aceitou qualquer string aqui, e
     * restringir o alfabeto rejeitaria copy já gravada (R01 da revisão do
     * Codex, 12/09/2026). A separação entre grupo declarado e bloco solto é
     * feita pela CHAVE interna de `gruposDeLeitura`, não pelo nome.
     */
    grupoDeLeitura: z.string().min(1).max(60).optional(),
    /** A ordem de leitura. Explícita e única na copy. */
    ordem: z.number().int().min(0).max(99),
    /**
     * O texto EXATO, uma linha por item, como o autor escreveu — caixa, acento,
     * quebra e [colchetes] preservados. Linha vazia é permitida DENTRO do bloco
     * (respiro que o autor quis); bloco vazio (`[]`) é decisão explícita.
     */
    linhas: z.array(z.string().max(300)).max(MAX_LINHAS),
    fatos: z.array(referenciaDeFatoSchema).max(8).optional(),
    estilo: estiloDoBlocoSchema.optional(),
  })
  .strict()
export type BlocoAutoral = z.infer<typeof blocoAutoralSchema>

export const revisaoDaCopySchema = z
  .object({
    /** ISO 8601. */
    em: z.string().min(1).max(40),
    autor: z.enum(AUTORES),
    /** Por que mudou, em uma frase ("a Roberta trocou o CTA", "acento corrigido pelo revisor"). */
    motivo: z.string().min(1).max(300),
    /** Os ids dos blocos tocados nesta revisão (alterados, acrescentados e removidos — até o dobro do teto de blocos). */
    blocos: z.array(idDeBlocoSchema).max(MAX_BLOCOS_TOCADOS_POR_REVISAO),
    /**
     * Os blocos REMOVIDOS nesta revisão, com o que diziam — é o que deixa o
     * histórico citar um id que não está mais na copy sem inventar bloco.
     */
    removidos: z
      .array(z.object({ id: idDeBlocoSchema, funcao: z.enum(FUNCOES), linhas: z.array(z.string().max(300)).max(MAX_LINHAS) }).strict())
      .max(MAX_BLOCOS_NA_COPY)
      .optional(),
    /** O que mudou em cada bloco alterado, por campo (`linhas`, `ordem`, `estilo`…). */
    campos: z.record(idDeBlocoSchema, z.array(z.string().min(1).max(30)).max(10)).optional(),
    /** Superfície por onde a mudança entrou (chat, editor, bancada, agendamento, sistema). */
    superficie: z.string().min(1).max(40).optional(),
  })
  .strict()
export type RevisaoDaCopy = z.infer<typeof revisaoDaCopySchema>

export const copyAutoralSchema = z
  .object({
    versao: z.literal(VERSAO_DO_CONTRATO),
    /** Quem ESCREVEU a copy original. O adaptador do legado grava `desconhecido`. */
    origem: z
      .object({
        autor: z.enum(AUTORES),
        em: z.string().min(1).max(40).optional(),
        superficie: z.string().min(1).max(40).optional(),
      })
      .strict(),
    blocos: z.array(blocoAutoralSchema).min(1).max(MAX_BLOCOS_NA_COPY),
    /** Histórico das mudanças DEPOIS da origem, do mais antigo ao mais novo. */
    revisoes: z.array(revisaoDaCopySchema).max(MAX_REVISOES_DA_COPY),
    /**
     * O que o contrato NÃO sabe sobre esta copy — preenchido pelo adaptador do
     * legado (grupo de leitura inferido pela posição, autoria ausente…). Quem
     * lê decide se a copy é comparável; quem grava nunca apaga a lista.
     */
    lacunas: z.array(z.string().min(1).max(200)).max(20).optional(),
  })
  .strict()
export type CopyAutoral = z.infer<typeof copyAutoralSchema>
