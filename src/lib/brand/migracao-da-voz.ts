/**
 * A MIGRAÇÃO DA VOZ — o contrato PURO (PR 13 de "Marca simples, copy melhor",
 * 12/09/2026). Sem Prisma: quem lê o DNA e grava a voz é o script
 * `scripts/migrar-voz-da-marca.ts`, por cima de `voz-service.ts`.
 *
 * O que ele resolve: a troca do DNA de texto (5–12 mil caracteres por
 * cliente) pela voz compacta é decisão do Ciro, cliente a cliente, e a
 * decisão precisa ser tomada sobre uma PRÉVIA que ele viu — o antes (o DNA
 * como está), o depois (a voz como o gerador de copy a lerá), o que a voz
 * cobre do que o DNA aprendeu e o que ela NÃO cobre, e os FATOS (preço,
 * horário, data, promoção) que hoje vivem dentro da identidade e que a voz
 * recusa por contrato — fato vai para a base, nunca para a voz.
 *
 * Regras:
 * - A prévia tem VERSÃO (`versaoDaPrevia`: hash do DNA de texto + da voz
 *   proposta). O manifesto de aprovação cita essa versão, e a aplicação
 *   recusa quando a prévia mudou por baixo (DNA editado, voz retocada) —
 *   prévia refeita pede aprovação nova.
 * - O manifesto é FECHADO: todo cliente termina como `migrar`, `manter-legado`
 *   (decisão explícita) ou `pendente` (ainda sem resposta). Nada é decidido
 *   por omissão.
 * - Fato detectado no DNA vira SUGESTÃO na prévia; só entra na base o que o
 *   manifesto listar por extenso (trecho exato + categoria + título), e o
 *   trecho tem de existir na prévia daquela versão. Nada é preenchido por
 *   inferência.
 * - Cobertura das "Regras aprendidas na prática" é APROXIMAÇÃO declarada
 *   (`semelhancaDeRegras`, o mesmo detector de conflito da voz): serve para
 *   a pessoa ver o que pode ter ficado de fora, não para decidir sozinha.
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { dadosProibidos, type TipoProibido } from '@/lib/aprendizado/causa-do-diff'
import { lerVoz, LIMIAR_DE_CONFLITO, semelhancaDeRegras, TETO_DO_PROMPT_DA_VOZ, vozParaPrompt, type ProblemaDaVoz, type VozCompacta } from './voz'

export const VERSAO_DO_MANIFESTO = 'manifesto-voz-v1' as const
export const DECISOES = ['migrar', 'manter-legado', 'pendente'] as const
export type DecisaoDaMigracao = (typeof DECISOES)[number]

/**
 * Categorias da base que um FATO tirado do DNA pode receber. `TOM_DE_VOZ`
 * fica de fora de propósito: identidade nunca volta para a base (regra de
 * 30/07/2026) — é justamente o que a voz vem substituir.
 */
export const CATEGORIAS_DE_FATO = ['ESTABELECIMENTO_INFO', 'HORARIOS', 'CARDAPIO', 'DELIVERY', 'POLITICAS', 'CAMPANHAS', 'DIFERENCIAIS', 'FAQ'] as const
export type CategoriaDeFato = (typeof CATEGORIAS_DE_FATO)[number]

export interface DnaDeTexto {
  toneOfVoice: string | null
  contentRules: string | null
  /** Só informativo na prévia; a versão é do CONTEÚDO. */
  updatedAt?: Date | string | null
}

export type OrigemNoDna = 'toneOfVoice' | 'contentRules'

export interface FatoDetectado {
  /** A frase inteira em que o dado apareceu — é o que o manifesto cita para levar à base. */
  trecho: string
  /** Preço/horário/data/promoção (`dadosProibidos`) ou `condicao` operacional (`condicoesOperacionais`) — os MESMOS detectores da voz (PR13-12). */
  tipos: TipoDeFatoNaVoz[]
  termos: string[]
  origem: OrigemNoDna
}

/** Um dado dentro da voz: preço/horário/data/promoção (`dadosProibidos`) ou uma CONDIÇÃO operacional (mecânica, janela de dias e período). */
export type TipoDeFatoNaVoz = TipoProibido | 'condicao'

export interface FatoNaVoz {
  caminho: string
  trecho: string
  tipos: TipoDeFatoNaVoz[]
}

export interface RegraLegada {
  /** A linha da seção "Regras aprendidas na prática", sem o "(data — motivo)" do fim. */
  texto: string
  em: string | null
  origem: OrigemNoDna
  situacao: 'coberta' | 'sem-correspondente'
  /** Ids das regras (ou índice das proibições, `proibicao:N`) da voz que falam do mesmo assunto. */
  correspondentes: string[]
}

export interface PreviaDaMigracao {
  projectId: number
  nome: string
  versaoDaPrevia: string
  geradaEm: string
  antes: {
    toneOfVoiceChars: number
    contentRulesChars: number
    regrasLegadas: number
    dnaAtualizadoEm: string | null
    /** Os textos INTEGRAIS que a voz vai substituir — a prévia é revisável só com eles na mão (PR13-05). */
    toneOfVoice: string | null
    contentRules: string | null
  }
  depois: {
    prompt: string
    chars: number
    teto: number
    regras: number
    exemplos: number
    termos: number
    proibicoes: number
  }
  regrasLegadas: RegraLegada[]
  fatos: {
    noLegado: FatoDetectado[]
    /** Precisa estar VAZIO: fato dentro da voz é problema, nunca aviso. */
    naVoz: FatoNaVoz[]
  }
  /** A voz proposta não passa no contrato — a prévia sai mesmo assim, para a pessoa ver por quê. */
  problemasDaVoz: ProblemaDaVoz[]
  avisos: string[]
}

const CABECALHO_LEGADO = /regras aprendidas na pr[aá]tica\s*:?/i
/**
 * O rodapé "(AAAA-MM-DD — motivo)" de uma regra aprendida, no FIM da linha. O
 * motivo pode ter frases, aspas e parênteses internos ("(2026-09-04 — Em
 * 03/09 o Ciro editou … "TRADIÇÃO GAÚCHA NO" e explicou …)"): a captura é
 * gulosa até o último parêntese da linha (PR13-08).
 */
const RODAPE_DA_LINHA = /\s*\((\d{4}-\d{2}-\d{2})\s*[—–-].*\)\s*$/
/** Marcador de LISTA no começo da linha: traço, asterisco, bolinha ou "1." / "1)". Nunca um número que é parte da frase ("20% de desconto"). */
const MARCADOR_DE_LISTA = /^\s*(?:[-*•]|\d{1,2}[.)])\s+/

/** As linhas da seção "Regras aprendidas na prática" de um texto do DNA (sem o "(data — motivo)"). */
export function linhasDaSecaoLegada(texto: string | null | undefined): Array<{ texto: string; em: string | null }> {
  if (!texto) return []
  const partes = texto.split(CABECALHO_LEGADO)
  if (partes.length < 2) return []
  const linhas: Array<{ texto: string; em: string | null }> = []
  for (const secao of partes.slice(1)) {
    for (const crua of secao.split('\n')) {
      const semMarcador = crua.replace(/^\s*[-*•]\s*/, '').trim()
      if (!semMarcador) continue
      // A seção termina no primeiro parágrafo que não é item de lista.
      if (!/^\s*[-*•]\s*/.test(crua)) break
      const m = semMarcador.match(RODAPE_DA_LINHA)
      linhas.push({ texto: semMarcador.replace(RODAPE_DA_LINHA, '').trim(), em: m ? m[1] : null })
    }
  }
  return linhas.filter((l) => l.texto.length >= 8)
}

/**
 * As frases de um texto do DNA: linha a linha, o rodapé de regra aprendida
 * sai ANTES da divisão em frases (um rodapé com duas frases virava dois
 * fragmentos que a expressão não reconhecia mais — PR13-08), o marcador de
 * lista sai sem engolir número que é conteúdo ("20% de desconto" ficava "% de
 * desconto" — PR13-06), e só então cada linha é partida em frases.
 */
function frasesDe(texto: string): string[] {
  const frases: string[] = []
  for (const linhaCrua of texto.split(/\n+/)) {
    const linha = linhaCrua.replace(RODAPE_DA_LINHA, '').replace(MARCADOR_DE_LISTA, '').trim()
    if (!linha) continue
    for (const f of linha.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú"“(])/)) {
      const frase = f.trim()
      if (frase.length >= 6) frases.push(frase)
    }
  }
  return frases
}

const DIA = '(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?'
const CONDICOES_OPERACIONAIS: Array<{ re: RegExp; rotulo: string }> = [
  { re: /\bem dobro\b|\bdobro\b/i, rotulo: 'mecânica "em dobro"' },
  { re: /\bleve\s+\d+\b|\bpague\s+\d+\b|\bleve\s+\w+\s+pague\b/i, rotulo: 'mecânica leve/pague' },
  { re: new RegExp(`\\b(?:de|das?)\\s+${DIA}\\s+(?:a|à|até)\\s+${DIA}`, 'i'), rotulo: 'janela de dias' },
  { re: /\bno\s+(?:jantar|almo[çc]o)\b|\bà\s+noite\b|\bde\s+manh[ãa]\b/i, rotulo: 'período do dia' },
  { re: /\ba partir d[aeo]s?\s+\d/i, rotulo: 'a partir de horário' },
]

/**
 * CONDIÇÕES operacionais que o detector de preço/horário/data/promoção não
 * pega e que também são fato da base, não voz: a mecânica ("chopp e drinks
 * selecionados em dobro"), a janela de dias ("de segunda a quinta") e o
 * período ("no jantar") — as duas que sobraram na proposta do TERO (PR13-07).
 * Texto entre aspas é vocabulário citado (o que a regra proíbe ou exige), não
 * condição.
 */
export function condicoesOperacionais(texto: string): string[] {
  const semCitacoes = texto.replace(/"[^"]*"|“[^”]*”|'[^']*'/g, ' ')
  return CONDICOES_OPERACIONAIS.filter((c) => c.re.test(semCitacoes)).map((c) => c.rotulo)
}

/**
 * Frases do DNA de texto que carregam DADO (preço, horário, data, promoção) —
 * o que a voz recusa e a base recebe. O rodapé "(AAAA-MM-DD — motivo)" de uma
 * regra aprendida é METADADO da regra (quando e por que ela nasceu), não fato:
 * sai antes da leitura, senão toda regra legada virava "data" na prévia.
 */
export function fatosNoDna(dna: DnaDeTexto): FatoDetectado[] {
  const achados: FatoDetectado[] = []
  const vistos = new Set<string>()
  for (const origem of ['toneOfVoice', 'contentRules'] as const) {
    const texto = dna[origem]
    if (!texto) continue
    for (const frase of frasesDe(texto)) {
      const dados = dadosProibidos(frase)
      // A condição operacional ("em dobro", "de segunda a quinta, no jantar") é fato aqui pela MESMA régua que a
      // recusa na voz: o que sai da voz por ser condição tem de poder entrar na base pela prévia (PR13-12).
      const condicoes = condicoesOperacionais(frase)
      const tipos: TipoDeFatoNaVoz[] = [...dados.tipos, ...(condicoes.length > 0 ? (['condicao'] as const) : [])]
      if (tipos.length === 0) continue
      const chave = `${origem}:${frase}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      achados.push({ trecho: frase, tipos, termos: [...dados.termos, ...condicoes], origem })
    }
  }
  return achados
}

const PALAVRA_DE_PROMOCAO_NUA = /^(descontos?|gratis|cortesia|promocao)$/i

/**
 * Dado dentro da VOZ proposta — tem de dar vazio; é o que impede o preço de
 * voltar pela identidade. Em PROIBIÇÃO e REGRA, a palavra nua "promoção",
 * "desconto", "grátis" ou "cortesia" não é dado: é o vocabulário que a regra
 * proíbe ("a palavra promoção não existe"). Percentual e "leve X pague Y"
 * continuam sendo dado em qualquer campo.
 */
export function fatosNaVoz(voz: VozCompacta): FatoNaVoz[] {
  const achados: FatoNaVoz[] = []
  const olhar = (caminho: string, trecho: string, opcoes: { proibicaoOuRegra?: boolean; soPrecoEHorario?: boolean; vocabulario?: boolean } = {}) => {
    const dados = dadosProibidos(trecho)
    let tipos: TipoDeFatoNaVoz[] = dados.tipos
    if (opcoes.soPrecoEHorario) tipos = tipos.filter((t) => t === 'preco' || t === 'horario')
    if (opcoes.proibicaoOuRegra && tipos.includes('promocao')) {
      const termosDePromocao = dados.termos.filter((t) => /%|^\d|leve\d+pague/.test(t) || !PALAVRA_DE_PROMOCAO_NUA.test(t))
      if (termosDePromocao.length === 0) tipos = tipos.filter((t) => t !== 'promocao')
    }
    // Condição operacional é fato em qualquer campo de copy E nas regras. Ficam de fora o motivo da regra (é
    // história) e o VOCABULÁRIO: "happy em dobro" nos termos é o NOME que a casa dá à mecânica, não a promessa
    // de que ela vale — a promessa (o que dobra, quando) é o que a regra e o exemplo não podem carregar.
    if (!opcoes.soPrecoEHorario && !opcoes.vocabulario && condicoesOperacionais(trecho).length > 0) tipos = [...tipos, 'condicao']
    if (tipos.length > 0) achados.push({ caminho, trecho, tipos })
  }
  olhar('descricao', voz.descricao)
  if (voz.tratamento) olhar('tratamento', voz.tratamento)
  voz.exemplos.forEach((e, i) => olhar(`exemplos.${i}`, e))
  voz.antesDepois.forEach((r, i) => olhar(`antesDepois.${i}.depois`, r.depois))
  voz.termos.forEach((t, i) => olhar(`termos.${i}`, t, { vocabulario: true }))
  voz.proibicoes.forEach((p, i) => olhar(`proibicoes.${i}`, p, { proibicaoOuRegra: true }))
  voz.regras.forEach((r, i) => {
    if (!r.ativa) return
    olhar(`regras.${i}.texto`, r.texto, { proibicaoOuRegra: true })
    olhar(`regras.${i}.motivo`, r.motivo, { soPrecoEHorario: true })
  })
  return achados
}

/** Cada linha legada, coberta ou não por regra/proibição da voz que fale do mesmo assunto. */
export function coberturaDasRegrasLegadas(dna: DnaDeTexto, voz: VozCompacta): RegraLegada[] {
  const saida: RegraLegada[] = []
  for (const origem of ['toneOfVoice', 'contentRules'] as const) {
    for (const linha of linhasDaSecaoLegada(dna[origem])) {
      const correspondentes: string[] = []
      for (const r of voz.regras) if (r.ativa && semelhancaDeRegras(r.texto, linha.texto) >= LIMIAR_DE_CONFLITO) correspondentes.push(r.id)
      voz.proibicoes.forEach((p, i) => {
        if (semelhancaDeRegras(p, linha.texto) >= LIMIAR_DE_CONFLITO) correspondentes.push(`proibicao:${i}`)
      })
      voz.antesDepois.forEach((ad, i) => {
        if (semelhancaDeRegras(`${ad.antes} ${ad.depois} ${ad.motivo}`, linha.texto) >= LIMIAR_DE_CONFLITO) correspondentes.push(`antesDepois:${i}`)
      })
      saida.push({ texto: linha.texto, em: linha.em, origem, situacao: correspondentes.length > 0 ? 'coberta' : 'sem-correspondente', correspondentes })
    }
  }
  return saida
}

function jsonEstavel(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(',')}]`
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${jsonEstavel(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(valor)
}

/** A versão da prévia é do CONTEÚDO: o DNA de texto como está + a voz proposta. Mudou um, muda a versão, e a aprovação anterior não vale. */
export function versaoDaPrevia(args: { dna: DnaDeTexto; voz: unknown }): string {
  return createHash('sha256')
    .update(jsonEstavel({ toneOfVoice: args.dna.toneOfVoice ?? null, contentRules: args.dna.contentRules ?? null, voz: args.voz }))
    .digest('hex')
    .slice(0, 16)
}

export function montarPrevia(args: { projectId: number; nome: string; dna: DnaDeTexto; voz: unknown; agora?: Date }): PreviaDaMigracao {
  const lida = lerVoz(args.voz)
  const voz = lida.voz
  const avisos: string[] = []
  const regrasLegadas = voz ? coberturaDasRegrasLegadas(args.dna, voz) : []
  const naVoz = voz ? fatosNaVoz(voz) : []
  const noLegado = fatosNoDna(args.dna)
  const prompt = voz ? vozParaPrompt(voz, { escopo: 'copy' }) : ''
  const semCorrespondente = regrasLegadas.filter((r) => r.situacao === 'sem-correspondente')
  if (semCorrespondente.length > 0) avisos.push(`${semCorrespondente.length} regra(s) aprendida(s) do DNA sem correspondente na voz — confira se foram absorvidas na descrição/exemplos ou se ficaram de fora de propósito.`)
  if (naVoz.length > 0) avisos.push(`a voz proposta carrega DADO (${naVoz.map((f) => f.caminho).join(', ')}): fato vai para a base, nunca para a voz.`)
  if (noLegado.length > 0) avisos.push(`${noLegado.length} frase(s) do DNA carregam dado (preço, horário, data ou promoção): quem quiser mantê-las lista cada uma no manifesto, com categoria e título, para virar entrada da base.`)
  if (!voz) avisos.push('a voz proposta não passa no contrato; a migração deste cliente é impossível até corrigir.')
  const dnaAtualizadoEm = args.dna.updatedAt ? (args.dna.updatedAt instanceof Date ? args.dna.updatedAt.toISOString() : String(args.dna.updatedAt)) : null
  return {
    projectId: args.projectId,
    nome: args.nome,
    versaoDaPrevia: versaoDaPrevia({ dna: args.dna, voz: args.voz }),
    geradaEm: (args.agora ?? new Date()).toISOString(),
    antes: {
      toneOfVoiceChars: args.dna.toneOfVoice?.length ?? 0,
      contentRulesChars: args.dna.contentRules?.length ?? 0,
      regrasLegadas: regrasLegadas.length,
      dnaAtualizadoEm,
      toneOfVoice: args.dna.toneOfVoice ?? null,
      contentRules: args.dna.contentRules ?? null,
    },
    depois: {
      prompt,
      chars: prompt.length,
      teto: TETO_DO_PROMPT_DA_VOZ,
      regras: voz ? voz.regras.filter((r) => r.ativa).length : 0,
      exemplos: voz?.exemplos.length ?? 0,
      termos: voz?.termos.length ?? 0,
      proibicoes: voz?.proibicoes.length ?? 0,
    },
    regrasLegadas,
    fatos: { noLegado, naVoz },
    problemasDaVoz: lida.problemas,
    avisos,
  }
}

export function previaParaMarkdown(p: PreviaDaMigracao): string {
  const L: string[] = []
  L.push(`# ${p.nome} (projeto ${p.projectId}) — prévia da migração da voz`)
  L.push('')
  L.push(`Versão da prévia: \`${p.versaoDaPrevia}\` · gerada em ${p.geradaEm}`)
  L.push('')
  L.push('## Antes (o DNA de texto que a copy lê hoje)')
  L.push('')
  L.push(`- toneOfVoice: ${p.antes.toneOfVoiceChars} caracteres · contentRules: ${p.antes.contentRulesChars} caracteres${p.antes.dnaAtualizadoEm ? ` · DNA atualizado em ${p.antes.dnaAtualizadoEm}` : ''}`)
  L.push(`- ${p.antes.regrasLegadas} regra(s) em "Regras aprendidas na prática"`)
  L.push('')
  // Os textos INTEGRAIS, como estão no banco (caixa, acentos, linhas e ordem):
  // sem eles a prévia mostra só o que os detectores reconhecem, e vocabulário,
  // exemplos e instruções fora das seções reconhecidas sumiriam sem comparação.
  for (const [rotulo, texto] of [['toneOfVoice', p.antes.toneOfVoice], ['contentRules', p.antes.contentRules]] as const) {
    L.push(`### ${rotulo} — texto integral`)
    L.push('')
    L.push('```text')
    L.push(texto && texto.length > 0 ? texto : '(vazio)')
    L.push('```')
    L.push('')
  }
  L.push(`## Depois (a voz compacta, como o gerador de copy a lerá — ${p.depois.chars} de ${p.depois.teto} caracteres)`)
  L.push('')
  L.push('```')
  L.push(p.depois.prompt || '(a voz não passa no contrato)')
  L.push('```')
  L.push('')
  if (p.problemasDaVoz.length > 0) {
    L.push('## ⚠️ A voz proposta NÃO passa no contrato')
    L.push('')
    for (const pr of p.problemasDaVoz) L.push(`- \`${pr.caminho}\`: ${pr.mensagem}`)
    L.push('')
  }
  L.push('## Regras aprendidas no DNA × a voz')
  L.push('')
  if (p.regrasLegadas.length === 0) L.push('(o DNA não tem a seção "Regras aprendidas na prática")')
  for (const r of p.regrasLegadas) {
    L.push(`- ${r.situacao === 'coberta' ? '✓' : '○'} [${r.origem}${r.em ? `, ${r.em}` : ''}] ${r.texto}${r.correspondentes.length > 0 ? ` → ${r.correspondentes.join(', ')}` : ' → SEM correspondente na voz'}`)
  }
  L.push('')
  L.push('## Fatos no DNA (não entram na voz; vão para a base se você listar no manifesto)')
  L.push('')
  if (p.fatos.noLegado.length === 0) L.push('(nenhuma frase com preço, horário, data ou promoção)')
  for (const f of p.fatos.noLegado) L.push(`- [${f.origem} · ${f.tipos.join('/')}] ${f.trecho}`)
  L.push('')
  if (p.fatos.naVoz.length > 0) {
    L.push('## ⚠️ Dado dentro da voz proposta (precisa sair)')
    L.push('')
    for (const f of p.fatos.naVoz) L.push(`- \`${f.caminho}\` (${f.tipos.join('/')}): ${f.trecho}`)
    L.push('')
  }
  if (p.avisos.length > 0) {
    L.push('## Avisos')
    L.push('')
    for (const a of p.avisos) L.push(`- ${a}`)
    L.push('')
  }
  return L.join('\n')
}

// ── o manifesto ─────────────────────────────────────────────────────────────

export const fatoParaABaseSchema = z
  .object({
    /** O trecho EXATO listado na prévia (é como a aplicação confere que a pessoa viu o que aprova). */
    trecho: z.string().min(6),
    categoria: z.enum(CATEGORIAS_DE_FATO),
    titulo: z.string().min(3).max(120),
    /** Sem prazo = vale para sempre; campanha leva a data em que vence (AAAA-MM-DD). */
    validaAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict()

export const clienteDoManifestoSchema = z
  .object({
    projectId: z.number().int().positive(),
    nome: z.string().min(1),
    versaoDaPrevia: z.string().min(8),
    decisao: z.enum(DECISOES),
    aprovadoPor: z.string().min(1).optional(),
    aprovadoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    observacao: z.string().max(600).optional(),
    fatosParaABase: z.array(fatoParaABaseSchema).max(40).default([]),
  })
  .strict()

export const manifestoSchema = z
  .object({
    versao: z.literal(VERSAO_DO_MANIFESTO),
    geradoEm: z.string().min(1),
    clientes: z.array(clienteDoManifestoSchema).min(1),
  })
  .strict()
export type Manifesto = z.infer<typeof manifestoSchema>
export type ClienteDoManifesto = z.infer<typeof clienteDoManifestoSchema>

export function lerManifesto(entrada: unknown): { manifesto: Manifesto | null; problemas: string[] } {
  const parsed = manifestoSchema.safeParse(entrada)
  if (!parsed.success) return { manifesto: null, problemas: parsed.error.issues.map((i) => `${i.path.join('.') || 'manifesto'}: ${i.message}`) }
  const problemas: string[] = []
  const ids = new Map<number, number>()
  for (const c of parsed.data.clientes) {
    ids.set(c.projectId, (ids.get(c.projectId) ?? 0) + 1)
    if (c.decisao !== 'pendente' && (!c.aprovadoPor || !c.aprovadoEm)) problemas.push(`clientes.${c.projectId}: decisão "${c.decisao}" precisa de aprovadoPor e aprovadoEm — silêncio não é aprovação`)
    if (c.decisao !== 'migrar' && c.fatosParaABase.length > 0) problemas.push(`clientes.${c.projectId}: fatosParaABase só vale com decisão "migrar" (o legado continua guardando o fato)`)
  }
  for (const [id, n] of ids) if (n > 1) problemas.push(`manifesto: projeto ${id} aparece ${n}×`)
  if (parsed.success) {
    for (const [ci, c] of parsed.data.clientes.entries()) {
      for (const r of trechosRepetidos(c.fatosParaABase)) problemas.push(`clientes.${ci} (${c.nome}): fatosParaABase repete o trecho "${r.trecho.slice(0, 60)}" nas posições ${r.posicoes.join(', ')} — a mesma identidade de fato duas vezes criaria duas linhas; deixe uma`)
    }
  }

  return problemas.length > 0 ? { manifesto: null, problemas } : { manifesto: parsed.data, problemas: [] }
}

/** Um manifesto "em branco" a partir das prévias — tudo `pendente`; quem decide preenche. */
export function manifestoEmBranco(previas: PreviaDaMigracao[], agora: Date = new Date()): Manifesto {
  return {
    versao: VERSAO_DO_MANIFESTO,
    geradoEm: agora.toISOString(),
    clientes: previas.map((p) => ({ projectId: p.projectId, nome: p.nome, versaoDaPrevia: p.versaoDaPrevia, decisao: 'pendente' as const, fatosParaABase: [] })),
  }
}

// ── o plano de aplicação ────────────────────────────────────────────────────

/**
 * A chave DURÁVEL de um fato criado pela migração: projeto + versão da prévia
 * + trecho exato. Vai no `metadata.chaveDoFato` da entrada da base; retomar
 * a aplicação depois de uma falha parcial NÃO recria o que já existe
 * (PR13-03). Mesmo trecho em outra prévia é outro fato — a base é datada.
 */
export function chaveDoFato(f: { projectId: number; versaoDaPrevia: string; trecho: string }): string {
  return createHash('sha1').update(`${f.projectId}|${f.versaoDaPrevia}|${f.trecho}`).digest('hex')
}

export type Indexador = 'producao' | 'isolado' | 'ausente'
/** Onde a aplicação vai ESCREVER: o banco (SQL) e o índice de vetores da base (`criarEntradaBase` indexa). */
export interface DestinoDaAplicacao {
  banco: 'producao' | 'dev'
  indexador: Indexador
  /** A URL do indexador que foi VALIDADA — conferida de novo contra a que o processo usa na hora de aplicar (PR13-09). */
  indexadorUrl: string | null
}

/**
 * O indexador de vetores que o processo vai usar, comparado com o de
 * produção: `isolado` quando o alvo declara URL e token próprios e a URL é
 * outra; `producao` quando é a mesma URL; `ausente` sem URL ou sem token.
 * `--dev` troca só `DATABASE_URL`/`DIRECT_URL` — o `UPSTASH_VECTOR_*` do
 * `.env` continuava valendo e um fato de dev iria para o índice de produção
 * (PR13-01).
 */
export function isolamentoDoIndexador(prod: Record<string, string | undefined>, alvo: Record<string, string | undefined>): Indexador {
  const url = alvo.UPSTASH_VECTOR_REST_URL?.trim()
  const token = alvo.UPSTASH_VECTOR_REST_TOKEN?.trim()
  if (!url || !token) return 'ausente'
  return url === prod.UPSTASH_VECTOR_REST_URL?.trim() ? 'producao' : 'isolado'
}

/**
 * Pode INDEXAR fatos neste destino? Dev exige indexador isolado; produção
 * exige o de produção; sem destino declarado, nada. E o indexador que o
 * processo USA na hora de aplicar (`efetivo.url`, o `process.env` que o
 * cliente vetorial lê) tem de ser o que foi validado: um `UPSTASH_VECTOR_*`
 * herdado do ambiente apontaria os vetores para outro índice com o SQL em
 * produção (PR13-09).
 */
export function podeIndexar(destino: DestinoDaAplicacao | undefined, efetivo?: { url: string | null | undefined }): { ok: true } | { ok: false; motivo: string } {
  if (!destino) return { ok: false, motivo: 'o destino da aplicação (banco + indexador de vetores) não foi declarado; sem isso os fatos iriam para o índice de PRODUÇÃO' }
  if (efetivo && (efetivo.url?.trim() || null) !== (destino.indexadorUrl?.trim() || null)) {
    return { ok: false, motivo: `o indexador de vetores em uso pelo processo (${efetivo.url?.trim() || 'nenhum'}) não é o validado (${destino.indexadorUrl ?? 'nenhum'}): o UPSTASH_VECTOR_* do ambiente mudou depois de resolver o destino` }
  }
  if (destino.banco === 'dev' && destino.indexador !== 'isolado') {
    const qual = destino.indexador === 'producao' ? 'é o de PRODUÇÃO' : 'não existe'
    return { ok: false, motivo: `o banco é o de dev e o indexador de vetores ${qual}: declare UPSTASH_VECTOR_REST_URL/UPSTASH_VECTOR_REST_TOKEN próprios no .env.development.local antes de aplicar em dev` }
  }
  if (destino.banco === 'producao' && destino.indexador !== 'producao') return { ok: false, motivo: `o banco é o de produção e o indexador de vetores não é o de produção (${destino.indexador})` }
  return { ok: true }
}

/** A marca DURÁVEL de que o fato foi indexado por completo (metadata da entrada). A linha existir não prova indexação (PR13-11). */
export const MARCA_DE_INDEXADO = 'indexadoEm'
export type EstadoDoFato = 'ausente' | 'incompleto' | 'completo'
/** Pela linha da base: sem linha `ausente`; linha sem `indexadoEm` (interrompida entre o SQL e o vetor) `incompleto`; com a marca `completo`. */
export function classificarFato(linha: { metadata?: unknown } | null | undefined): EstadoDoFato {
  if (!linha) return 'ausente'
  const m = linha.metadata
  const indexadoEm = m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>)[MARCA_DE_INDEXADO] : undefined
  return typeof indexadoEm === 'string' && indexadoEm.length > 0 ? 'completo' : 'incompleto'
}

/** O compute de uma URL do Neon (`ep-x-pooler.…` e `ep-x.…` são a mesma instância); `null` quando ilegível. */
export function computeDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}

/** O NOME do banco na URL (`/neondb`), sem query; `null` quando ilegível ou ausente. */
export function nomeDoBancoDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const nome = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
    return nome || null
  } catch {
    return null
  }
}

/**
 * A conexão da TRAVA e a das escritas têm de ser o MESMO banco: mesmo compute
 * (pooler e direto são a mesma instância) E mesmo nome de banco — advisory
 * lock é por banco, e `/neondb` e `/outro_banco` no mesmo compute travam
 * coisas diferentes (PR13-13 e PR13-16).
 */
export function mesmoBanco(urlDaTrava: string | null | undefined, urlDasEscritas: string | null | undefined): boolean {
  const a = computeDe(urlDaTrava)
  const b = computeDe(urlDasEscritas)
  const na = nomeDoBancoDe(urlDaTrava)
  const nb = nomeDoBancoDe(urlDasEscritas)
  return a !== null && b !== null && a === b && na !== null && nb !== null && na === nb
}

/** Trechos repetidos em `fatosParaABase` de um cliente: a mesma identidade de fato duas vezes criaria duas linhas numa só aplicação (PR13-17). */
/**
 * A URL passa pelo POOLER do Neon (`-pooler` no host = PgBouncer em modo transação)? Trava de SESSÃO por trás dele
 * não fixa um backend: duas aplicações podem cair no mesmo backend e "reentrar" na mesma trava, e o unlock pode
 * rodar em outro (PR13-19). A conexão da trava tem de ser DIRETA.
 */
export function ehPooler(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    return /-pooler(\.|$)/i.test(new URL(url).hostname)
  } catch {
    return /-pooler\./i.test(url)
  }
}

export function trechosRepetidos(fatos: Array<{ trecho?: string }>): Array<{ trecho: string; posicoes: number[] }> {
  const porTrecho = new Map<string, number[]>()
  fatos.forEach((f, i) => {
    if (typeof f.trecho !== 'string') return
    porTrecho.set(f.trecho, [...(porTrecho.get(f.trecho) ?? []), i])
  })
  return [...porTrecho.entries()].filter(([, p]) => p.length > 1).map(([trecho, posicoes]) => ({ trecho, posicoes }))
}

/** A linha da base que carrega a chave de um fato — os campos que a retomada CONFERE antes de reutilizá-la (PR13-14). */
export interface LinhaDoFato {
  content: string
  category: string
  status: string
  expiresAt: Date | string | null
}

/**
 * A linha encontrada pela chave ainda é o fato APROVADO? Editada (conteúdo,
 * categoria, validade) ou arquivada, ela não pode ser reutilizada nem
 * reindexada como se fosse ele — a decisão volta para a pessoa (PR13-14).
 */
export function divergenciasDoFato(linha: LinhaDoFato, fato: { trecho: string; categoria: string; validaAte: string | null }): string[] {
  const d: string[] = []
  if (linha.content.trim() !== fato.trecho.trim()) d.push('conteúdo editado')
  if (linha.category !== fato.categoria) d.push(`categoria ${linha.category} (aprovada ${fato.categoria})`)
  if (linha.status !== 'ACTIVE') d.push(`status ${linha.status} (a busca só lê ACTIVE)`)
  const validadeDaLinha = linha.expiresAt ? diaEmBrasilia(linha.expiresAt) : null
  if (validadeDaLinha !== (fato.validaAte ?? null)) d.push(`validade ${validadeDaLinha ?? 'sem prazo'} (aprovada ${fato.validaAte ?? 'sem prazo'})`)
  return d
}

function diaEmBrasilia(d: Date | string): string | null {
  const data = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(data.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data)
}

export interface EstadoDoCliente {
  /** A versão da prévia CALCULADA AGORA (DNA atual + voz proposta atual). */
  versaoDaPreviaAtual: string
  /** Os trechos de fato que a prévia atual lista — o manifesto só pode citar estes. */
  trechosDeFato: string[]
  /** O registro de voz que já existe no banco, se houver. */
  registro: { versao: number; migradaEm: Date | string | null } | null
  /** A voz proposta pode ser migrada agora: passa no contrato E não carrega dado nem condição operacional (PR13-07). */
  vozValida: boolean
  /** Por que não pode (vazio quando `vozValida`). */
  problemasDaVoz?: string[]
}

/** O que impede a voz proposta de migrar: problemas do contrato + fato/condição dentro dela. Vazio = pode. */
export function problemasParaMigrar(voz: unknown): string[] {
  const lida = lerVoz(voz)
  if (!lida.voz) return lida.problemas.map((p) => `${p.caminho}: ${p.mensagem}`)
  return fatosNaVoz(lida.voz).map((f) => `${f.caminho} carrega ${f.tipos.join('/')}: "${f.trecho.slice(0, 80)}"`)
}

export type AcaoDoPlano =
  | { projectId: number; nome: string; acao: 'migrar'; versaoEsperadaDaVoz: number; fatos: ClienteDoManifesto['fatosParaABase'] }
  | { projectId: number; nome: string; acao: 'ja-migrado' | 'manter-legado' | 'pendente' }
  | { projectId: number; nome: string; acao: 'bloqueado'; motivo: string }

/**
 * O que a aplicação FARIA com este manifesto sobre o estado atual — puro, sem
 * gravar. Bloqueia (em vez de adaptar) quando a prévia mudou, quando a voz
 * não passa mais no contrato ou quando o manifesto cita fato que a prévia
 * não lista: nada é decidido por quem aplica.
 */
export function planoDeAplicacao(manifesto: Manifesto, estados: Map<number, EstadoDoCliente>): AcaoDoPlano[] {
  return manifesto.clientes.map((c) => {
    const base = { projectId: c.projectId, nome: c.nome }
    if (c.decisao === 'pendente') return { ...base, acao: 'pendente' as const }
    if (c.decisao === 'manter-legado') return { ...base, acao: 'manter-legado' as const }
    const estado = estados.get(c.projectId)
    if (!estado) return { ...base, acao: 'bloqueado' as const, motivo: 'o cliente não está no estado lido (sem DNA ou sem voz proposta)' }
    if (estado.registro?.migradaEm) return { ...base, acao: 'ja-migrado' as const }
    if (!estado.vozValida) return { ...base, acao: 'bloqueado' as const, motivo: `a voz proposta não pode migrar agora: ${(estado.problemasDaVoz ?? ['não passa no contrato']).join(' · ')}` }
    if (estado.versaoDaPreviaAtual !== c.versaoDaPrevia) {
      return { ...base, acao: 'bloqueado' as const, motivo: `a prévia mudou desde a aprovação (aprovada ${c.versaoDaPrevia}, atual ${estado.versaoDaPreviaAtual}): refaça a prévia e peça aprovação nova` }
    }
    const foraDaPrevia = c.fatosParaABase.filter((f) => !estado.trechosDeFato.includes(f.trecho)).map((f) => f.trecho)
    if (foraDaPrevia.length > 0) {
      return { ...base, acao: 'bloqueado' as const, motivo: `fato(s) do manifesto que a prévia não lista: ${foraDaPrevia.map((t) => `"${t.slice(0, 60)}"`).join(', ')}` }
    }
    return { ...base, acao: 'migrar' as const, versaoEsperadaDaVoz: estado.registro?.versao ?? 0, fatos: c.fatosParaABase }
  })
}
