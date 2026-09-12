/**
 * A VOZ COMPACTA da marca — o contrato PURO (F2/F5 de "Marca simples, copy
 * melhor", PR 7, 12/09/2026). Sem Prisma: quem grava é `voz-service.ts`.
 *
 * O que ela resolve: o DNA de texto (`toneOfVoice` + `contentRules`) chegou a
 * 5–12 mil caracteres por cliente, ensina frases já reprovadas, empilha regra
 * nova sobre regra velha e guarda fato (preço) no meio da identidade (§2.1 do
 * plano). A voz é CURTA (teto de 4.000 caracteres no prompt), versionada, e
 * as regras têm ESCOPO, MOTIVO, DATA e SUBSTITUIÇÃO explícita — regra nova
 * que contradiz a antiga aponta o conflito em vez de só acrescentar.
 *
 * A PRECEDÊNCIA mora aqui, num lugar só (`precedenciaDaVoz`): a voz nova só
 * vale para um cliente MIGRADO (`migradaEm` preenchido); até lá o legado
 * manda. Ter a voz gravada sem migrar é o estado da prévia (PR 13) — quem
 * decide migrar é o Ciro, cliente a cliente.
 */

import { z } from 'zod'

export const VERSAO_DA_VOZ = 'voz-v1' as const
export const ESCOPOS_DA_REGRA = ['copy', 'arte', 'ambas'] as const
export type EscopoDaRegra = (typeof ESCOPOS_DA_REGRA)[number]
/** Teto do texto que a voz vira no prompt de copy — a voz é síntese, não arquivo. */
export const TETO_DO_PROMPT_DA_VOZ = 4000

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

export const regraDaVozSchema = z
  .object({
    id: z.string().min(1).max(80),
    /** A regra, na forma imperativa em que vale daqui para a frente. */
    texto: z.string().min(1).max(240),
    /** O caso concreto que a gerou — sem ele a regra não se explica daqui a três meses. */
    motivo: z.string().min(1).max(300),
    /** Dia do aprendizado (AAAA-MM-DD). */
    em: z.string().regex(DATA_ISO),
    /** Onde a regra manda: só na copy, só na arte, ou nas duas. */
    escopo: z.enum(ESCOPOS_DA_REGRA).default('ambas'),
    /** A regra que esta SUBSTITUI (fica inativa, no histórico). */
    substitui: z.string().min(1).optional(),
    /** Regra substituída fica `false` — continua no histórico, sai do prompt. */
    ativa: z.boolean().default(true),
  })
  .strict()
export type RegraDaVoz = z.infer<typeof regraDaVozSchema>

export const antesDepoisSchema = z
  .object({ antes: z.string().min(1).max(200), depois: z.string().min(1).max(200), motivo: z.string().min(1).max(200) })
  .strict()

export const vozSchema = z
  .object({
    versao: z.literal(VERSAO_DA_VOZ),
    /** Como a marca fala, em poucas linhas — a descrição que o Claude lê primeiro. */
    descricao: z.string().min(1).max(600),
    /** Como a marca se dirige à pessoa (você, tu, a gente, "o cliente"…). */
    tratamento: z.string().min(1).max(160).optional(),
    /** Frases APROVADAS, como saíram — o exemplo vale mais que o adjetivo. */
    exemplos: z.array(z.string().min(1).max(200)).max(12).default([]),
    /** Reescritas aprovadas: o que estava, o que ficou, por quê. */
    antesDepois: z.array(antesDepoisSchema).max(12).default([]),
    /** Termos próprios da casa (nomes de prato, expressões) — grafia exata. */
    termos: z.array(z.string().min(1).max(60)).max(40).default([]),
    /** Poucas proibições, curtas. Fato (preço, horário) NUNCA entra aqui — vai para a base. */
    proibicoes: z.array(z.string().min(1).max(160)).max(20).default([]),
    /** Regras recentes, com escopo, motivo, data e substituição. */
    regras: z.array(regraDaVozSchema).max(60).default([]),
  })
  .strict()
export type VozCompacta = z.infer<typeof vozSchema>

export interface ProblemaDaVoz {
  caminho: string
  mensagem: string
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Palavras que não dizem de que ASSUNTO a regra fala — o "nunca", o "usar", o
 * "sempre" aparecem em quase toda regra e inflavam a diferença entre "nunca
 * usar X" e "X aprovado" (medido nas regras reais: 0,2 sem a lista, 0,8 com).
 */
const PALAVRAS_VAZIAS = new Set([
  'nunca', 'sempre', 'usar', 'use', 'usa', 'como', 'para', 'pode', 'podem', 'deve', 'devem', 'nao', 'sem', 'com', 'uma', 'umas', 'uns', 'que', 'dos', 'das', 'nos', 'nas', 'por', 'pelo', 'pela', 'este', 'esta', 'isso', 'isto', 'mais', 'menos', 'muito', 'tudo', 'cada', 'quando', 'onde', 'ser', 'ter', 'aqui', 'ali', 'ate', 'apos', 'antes', 'depois', 'sobre', 'entre', 'seu', 'sua', 'seus', 'suas', 'ele', 'ela', 'eles', 'elas', 'meu', 'minha', 'nosso', 'nossa', 'todo', 'toda', 'todos', 'todas', 'foi', 'sao', 'esta', 'estao', 'fica', 'ficam', 'vai', 'vao', 'ter', 'tem', 'mas', 'ainda', 'entao', 'assim', 'bem', 'mal', 'muito', 'pouco', 'so', 'apenas', 'tambem', 'jamais', 'evitar', 'evite', 'proibido', 'aprovado', 'aprovada', 'regra', 'texto', 'copy', 'arte', 'peca',
])

/** Palavras significativas de uma frase (≥ 3 letras, sem acento, minúsculas, sem as vazias e sem número solto). */
export function palavrasDeRegra(texto: string): Set<string> {
  return new Set(
    semAcento(texto.toLowerCase())
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !PALAVRAS_VAZIAS.has(p)),
  )
}

/** Frases ENTRE ASPAS de uma regra ("Vem pro fogo"): quando as duas citam a mesma, falam do mesmo assunto. */
export function frasesCitadas(texto: string): Set<string> {
  const achadas = new Set<string>()
  for (const m of texto.matchAll(/["“”']([^"“”']{3,80})["“”']/g)) achadas.add(semAcento(m[1].toLowerCase()).replace(/\s+/g, ' ').trim())
  return achadas
}

/**
 * Semelhança entre duas regras: Jaccard das palavras significativas, ou 1
 * quando uma contém a outra (normalizadas). É o que aponta CONFLITO — regra
 * nova sobre o MESMO assunto da antiga. Aproximação declarada: quem decide
 * se é substituição ou convivência é a pessoa (`substitui` / `conviver`).
 */
export function semelhancaDeRegras(a: string, b: string): number {
  const na = semAcento(a.toLowerCase()).replace(/\s+/g, ' ').trim()
  const nb = semAcento(b.toLowerCase()).replace(/\s+/g, ' ').trim()
  if (!na || !nb) return 0
  if (na === nb || na.includes(nb) || nb.includes(na)) return 1
  const pa = palavrasDeRegra(a)
  const pb = palavrasDeRegra(b)
  let jaccard = 0
  if (pa.size > 0 && pb.size > 0) {
    let comuns = 0
    for (const p of pa) if (pb.has(p)) comuns++
    jaccard = comuns / (pa.size + pb.size - comuns)
  }
  const ca = frasesCitadas(a)
  for (const frase of frasesCitadas(b)) if (ca.has(frase)) return Math.max(jaccard, 0.75)
  return jaccard
}

/** Acima disto duas regras falam do MESMO assunto ("Nunca usar 'Vem pro fogo' como CTA" × "CTA aprovado: Vem pro fogo!" dá 0,8 com as palavras vazias fora; "Horário e CTA vão para o rodapé" × "Emoji nunca" dá 0). */
export const LIMIAR_DE_CONFLITO = 0.4

export function escoposSeCruzam(a: EscopoDaRegra, b: EscopoDaRegra): boolean {
  return a === 'ambas' || b === 'ambas' || a === b
}

/** Problemas de COERÊNCIA que o zod não vê (todos, nunca só o primeiro). */
export function problemasDeCoerenciaDaVoz(voz: VozCompacta): ProblemaDaVoz[] {
  const problemas: ProblemaDaVoz[] = []
  const ids = new Map<string, number>()
  voz.regras.forEach((r, i) => {
    ids.set(r.id, (ids.get(r.id) ?? 0) + 1)
    if (r.substitui) {
      const alvo = voz.regras.find((x) => x.id === r.substitui)
      if (!alvo) problemas.push({ caminho: `regras.${i}.substitui`, mensagem: `a regra "${r.id}" substitui "${r.substitui}", que não existe` })
      else if (alvo.ativa) problemas.push({ caminho: `regras.${i}.substitui`, mensagem: `a regra "${r.id}" substitui "${r.substitui}", mas a substituída continua ativa` })
      if (r.substitui === r.id) problemas.push({ caminho: `regras.${i}.substitui`, mensagem: `a regra "${r.id}" não pode substituir a si mesma` })
    }
  })
  for (const [id, n] of ids) if (n > 1) problemas.push({ caminho: 'regras', mensagem: `id de regra repetido: "${id}" (${n}×)` })
  const tamanho = vozParaPrompt(voz, { escopo: 'copy' }).length
  if (tamanho > TETO_DO_PROMPT_DA_VOZ) {
    problemas.push({ caminho: 'voz', mensagem: `a voz passa de ${TETO_DO_PROMPT_DA_VOZ} caracteres no prompt (${tamanho}): é síntese, não arquivo — encurte exemplos e regras, e leve fato para a base` })
  }
  return problemas
}

/** Lê e valida a voz; devolve TODOS os problemas, nunca só o primeiro. */
export function lerVoz(entrada: unknown): { voz: VozCompacta | null; problemas: ProblemaDaVoz[] } {
  const parsed = vozSchema.safeParse(entrada)
  if (!parsed.success) {
    return { voz: null, problemas: parsed.error.issues.map((i) => ({ caminho: i.path.join('.') || 'voz', mensagem: i.message })) }
  }
  const problemas = problemasDeCoerenciaDaVoz(parsed.data)
  return problemas.length > 0 ? { voz: null, problemas } : { voz: parsed.data, problemas: [] }
}

export function regrasAtivas(voz: VozCompacta, escopo: 'copy' | 'arte'): RegraDaVoz[] {
  return voz.regras.filter((r) => r.ativa && escoposSeCruzam(r.escopo, escopo))
}

function diaCurto(em: string): string {
  const [a, m, d] = em.split('-')
  return `${d}/${m}/${a}`
}

/**
 * A voz como TEXTO de prompt — compacta, em seções curtas, só o que serve ao
 * escopo pedido. É o único texto de identidade que o gerador de COPY recebe
 * quando o cliente está migrado; regra inativa (substituída) não entra.
 */
export function vozParaPrompt(voz: VozCompacta, opcoes: { escopo: 'copy' | 'arte' }): string {
  const linhas: string[] = []
  linhas.push(`COMO A MARCA FALA: ${voz.descricao.trim()}`)
  if (voz.tratamento) linhas.push(`Tratamento: ${voz.tratamento.trim()}`)
  if (voz.termos.length > 0) linhas.push(`Termos próprios (grafia exata): ${voz.termos.join(' · ')}`)
  if (voz.proibicoes.length > 0) linhas.push(`Nunca: ${voz.proibicoes.map((p) => p.trim()).join(' | ')}`)
  if (voz.exemplos.length > 0) linhas.push(`Exemplos aprovados:\n${voz.exemplos.map((e) => `- ${e.trim()}`).join('\n')}`)
  if (voz.antesDepois.length > 0) linhas.push(`Reescritas aprovadas (antes → depois, por quê):\n${voz.antesDepois.map((r) => `- "${r.antes}" → "${r.depois}" (${r.motivo})`).join('\n')}`)
  const regras = regrasAtivas(voz, opcoes.escopo)
  if (regras.length > 0) {
    linhas.push(`Regras recentes (decisão da casa, vencem o resto):\n${regras.map((r) => `- ${r.texto} (${diaCurto(r.em)} — ${r.motivo})`).join('\n')}`)
  }
  return linhas.join('\n\n')
}

/** Regras ATIVAS que falam do mesmo assunto de `texto` no escopo dado. */
export function conflitosDeRegra(voz: VozCompacta, texto: string, escopo: EscopoDaRegra, opcoes: { exceto?: string } = {}): RegraDaVoz[] {
  return voz.regras.filter((r) => r.ativa && r.id !== opcoes.exceto && escoposSeCruzam(r.escopo, escopo) && semelhancaDeRegras(r.texto, texto) >= LIMIAR_DE_CONFLITO)
}

/** Proibições da voz que falam do mesmo assunto de `texto` (aviso, não conflito de regra). */
export function proibicoesRelacionadas(voz: VozCompacta, texto: string): string[] {
  return voz.proibicoes.filter((p) => semelhancaDeRegras(p, texto) >= LIMIAR_DE_CONFLITO)
}

export function idDeRegra(voz: VozCompacta, em: string): string {
  const base = `regra-${em}`
  let n = 1
  while (voz.regras.some((r) => r.id === `${base}-${n}`)) n++
  return `${base}-${n}`
}

export interface NovaRegra {
  texto: string
  motivo: string
  em: string
  escopo?: EscopoDaRegra
  /** Id da regra que esta substitui (ela fica inativa, no histórico). */
  substitui?: string
  /** Manter as duas mesmo com conflito apontado — decisão explícita de quem confirma. */
  conviver?: boolean
}

export type ResultadoDeRegra =
  | { ok: true; voz: VozCompacta; regra: RegraDaVoz; substituida: RegraDaVoz | null; conflitos: RegraDaVoz[]; proibicoesRelacionadas: string[] }
  | { ok: false; erro: 'SUBSTITUIDA_NAO_EXISTE' | 'SUBSTITUIDA_INATIVA' | 'CONFLITO_DE_REGRA' | 'REGRA_INVALIDA' | 'VOZ_RESULTANTE_INVALIDA'; mensagem: string; conflitos: RegraDaVoz[]; proibicoesRelacionadas: string[] }

/**
 * "Virar regra" na voz: SUBSTITUI quando `substitui` vem (a antiga fica
 * inativa, no histórico), APONTA CONFLITO quando outra regra ativa fala do
 * mesmo assunto e ninguém disse o que fazer, e só acrescenta quando não há
 * conflito ou a pessoa mandou `conviver`. Puro: devolve a voz nova, nunca grava.
 */
export function aplicarRegraNaVoz(voz: VozCompacta, nova: NovaRegra): ResultadoDeRegra {
  const escopo = nova.escopo ?? 'ambas'
  const texto = nova.texto.trim()
  const motivo = nova.motivo.trim()
  const conflitos = conflitosDeRegra(voz, texto, escopo, { exceto: nova.substitui })
  const relacionadas = proibicoesRelacionadas(voz, texto)
  if (!texto || !motivo || !DATA_ISO.test(nova.em)) {
    return { ok: false, erro: 'REGRA_INVALIDA', mensagem: 'A regra precisa de texto, motivo e data (AAAA-MM-DD).', conflitos, proibicoesRelacionadas: relacionadas }
  }
  let substituida: RegraDaVoz | null = null
  if (nova.substitui) {
    substituida = voz.regras.find((r) => r.id === nova.substitui) ?? null
    if (!substituida) return { ok: false, erro: 'SUBSTITUIDA_NAO_EXISTE', mensagem: `Não há regra "${nova.substitui}" na voz.`, conflitos, proibicoesRelacionadas: relacionadas }
    if (!substituida.ativa) return { ok: false, erro: 'SUBSTITUIDA_INATIVA', mensagem: `A regra "${nova.substitui}" já foi substituída antes.`, conflitos, proibicoesRelacionadas: relacionadas }
  }
  if (conflitos.length > 0 && !nova.conviver) {
    return {
      ok: false,
      erro: 'CONFLITO_DE_REGRA',
      mensagem: `A regra nova fala do mesmo assunto de ${conflitos.length === 1 ? 'uma regra ativa' : `${conflitos.length} regras ativas`} (${conflitos.map((c) => `"${c.id}"`).join(', ')}). Diga o que fazer: substitui (a antiga sai) ou conviver (as duas ficam).`,
      conflitos,
      proibicoesRelacionadas: relacionadas,
    }
  }
  const regra: RegraDaVoz = { id: idDeRegra(voz, nova.em), texto, motivo, em: nova.em, escopo, ...(nova.substitui ? { substitui: nova.substitui } : {}), ativa: true }
  const regras = voz.regras.map((r) => (substituida && r.id === substituida.id ? { ...r, ativa: false } : r))
  const vozNova: VozCompacta = { ...voz, regras: [...regras, regra] }
  /**
   * A PRÉVIA já passa pelo contrato inteiro (PR7-03 da revisão do Codex,
   * 12/09/2026): regra comprida demais, a 61ª regra ou o prompt acima do teto
   * eram aceitos aqui e só recusados na gravação — a pessoa confirmava uma
   * proposta que falhava com VOZ_INVALIDA. O que não pode ser gravado não
   * pode ser proposto.
   */
  const conferida = lerVoz(vozNova)
  if (!conferida.voz) {
    return {
      ok: false,
      erro: 'VOZ_RESULTANTE_INVALIDA',
      mensagem: `A voz com esta regra não passa no contrato: ${conferida.problemas.map((p) => `${p.caminho}: ${p.mensagem}`).join(' · ')}`,
      conflitos,
      proibicoesRelacionadas: relacionadas,
    }
  }
  return { ok: true, voz: conferida.voz, regra, substituida, conflitos, proibicoesRelacionadas: relacionadas }
}

/**
 * O VOCABULÁRIO da voz — só o que é grafia APROVADA: descrição, tratamento,
 * termos da casa, exemplos e o lado "depois" das reescritas. Fica de fora o
 * lado "antes" (a grafia que a marca corrigiu), as proibições e os motivos:
 * postos no vocabulário, eles PROTEGIAM o erro que a reescrita existe para
 * tirar — "churasco → churrasco" gravado fazia a revisão ortográfica engolir
 * a sugestão certa (PR7-02 da revisão do Codex, 12/09/2026).
 */
export function vocabularioDaVoz(voz: VozCompacta): string {
  return [voz.descricao, voz.tratamento ?? '', ...voz.termos, ...voz.exemplos, ...voz.antesDepois.map((r) => r.depois)].filter((t) => t && t.trim()).join('\n')
}

/** Linhas da seção legada ("Regras aprendidas na prática") que falam do mesmo assunto — só AVISO: em prosa não há substituição mecânica. */
export function conflitosNoTextoLegado(secao: string | null, texto: string): string[] {
  if (!secao) return []
  return secao
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter((l) => l.length >= 8 && semelhancaDeRegras(l, texto) >= LIMIAR_DE_CONFLITO)
}

export interface ContextoDeVoz {
  /** De onde a identidade de COPY veio: a voz nova (cliente migrado), o DNA legado, ou nada. */
  fonte: 'voz' | 'legado' | 'nenhuma'
  /** O texto de identidade para o gerador de copy (a voz compacta, ou o `toneOfVoice` legado). */
  texto: string | null
  /** As regras da marca separadas — só no legado (`contentRules`); na voz elas já estão em `texto`. */
  regrasDaMarca: string | null
  /** Versão do CONTEÚDO da voz (null no legado). */
  versao: number | null
  migradaEm: string | null
  /** Voz gravada mas ainda não migrada (a prévia do PR 13) — o legado continua mandando. */
  vozPendente: boolean
  /**
   * As regras ATIVAS de escopo `arte`/`ambas` da voz, como texto — só no
   * cliente migrado. Os prompts de IMAGEM continuam lendo `contentRules` do
   * DNA (proibição não é estilo); esta é a parte NOVA que nasceu depois da
   * migração e que o DNA não tem. Legado: null.
   */
  regrasDeArte: string | null
  /**
   * O que conta como GRAFIA DA CASA para a revisão ortográfica: na voz, só os
   * campos positivos (`vocabularioDaVoz` — nunca o "antes" das reescritas nem
   * as proibições); no legado, o `toneOfVoice`. É separado de `texto` de
   * propósito: o texto do prompt carrega o erro corrigido para o modelo NÃO
   * repeti-lo, e isso não é vocabulário aprovado.
   */
  vocabulario: string | null
}

/** O contexto de quem não tem voz nem DNA de texto — para fixtures de teste e páginas sem identidade. */
export const SEM_VOZ: ContextoDeVoz = { fonte: 'nenhuma', texto: null, regrasDaMarca: null, versao: null, migradaEm: null, vozPendente: false, regrasDeArte: null, vocabulario: null }

/** As regras ativas de ARTE como bloco de prompt — vazio vira null. */
export function regrasDeArteParaPrompt(voz: VozCompacta): string | null {
  const regras = regrasAtivas(voz, 'arte')
  if (regras.length === 0) return null
  return `Regras recentes da marca para a ARTE (decisão da casa, vencem o resto):\n${regras.map((r) => `- ${r.texto} (${diaCurto(r.em)} — ${r.motivo})`).join('\n')}`
}

/**
 * A PRECEDÊNCIA, num lugar só: a voz nova vence quando o cliente foi migrado
 * (`migradaEm`); o legado só vale enquanto ele não migrou — mesmo que já
 * exista uma voz gravada (é a prévia). Voz migrada que não passa no contrato
 * NÃO derruba a copy: cai no legado e avisa por `vozPendente`.
 */
export function precedenciaDaVoz(args: {
  registro: { voz: unknown; versao: number; migradaEm: Date | string | null } | null | undefined
  dna: { toneOfVoice: string | null | undefined; contentRules: string | null | undefined }
}): ContextoDeVoz {
  const tom = args.dna.toneOfVoice?.trim() || null
  const regras = args.dna.contentRules?.trim() || null
  const legado = (): ContextoDeVoz => ({
    fonte: tom || regras ? 'legado' : 'nenhuma',
    texto: tom,
    regrasDaMarca: regras,
    versao: null,
    migradaEm: null,
    vozPendente: !!args.registro,
    regrasDeArte: null,
    vocabulario: tom,
  })
  if (!args.registro || !args.registro.migradaEm) return legado()
  const { voz } = lerVoz(args.registro.voz)
  if (!voz) return legado()
  const migradaEm = args.registro.migradaEm instanceof Date ? args.registro.migradaEm.toISOString() : String(args.registro.migradaEm)
  return {
    fonte: 'voz',
    texto: vozParaPrompt(voz, { escopo: 'copy' }),
    regrasDaMarca: null,
    versao: args.registro.versao,
    migradaEm,
    vozPendente: false,
    regrasDeArte: regrasDeArteParaPrompt(voz),
    vocabulario: vocabularioDaVoz(voz),
  }
}

/** O snapshot SOMENTE LEITURA do DNA de texto no momento da migração — o caminho de volta. */
export function arquivoDoDna(dna: { toneOfVoice: string | null; contentRules: string | null; updatedAt?: Date | null }, em: Date = new Date()) {
  return {
    arquivadoEm: em.toISOString(),
    toneOfVoice: dna.toneOfVoice,
    contentRules: dna.contentRules,
    dnaAtualizadoEm: dna.updatedAt ? dna.updatedAt.toISOString() : null,
  }
}

export function vozVazia(descricao: string): VozCompacta {
  return { versao: VERSAO_DA_VOZ, descricao, exemplos: [], antesDepois: [], termos: [], proibicoes: [], regras: [] }
}
