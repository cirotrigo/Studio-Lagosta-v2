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
import { temMarcaDeIndexado } from '../knowledge/marca-de-indexado'
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
  /** Exemplo e CTA da voz × o DNA atual (`conferirTextoDeMarca`); null quando a voz não passa no contrato. Divergência BLOQUEIA a migração. */
  textoDeMarca: ConferenciaDeMarca | null
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
  // PR13-25: disponibilidade e programa fixo também são condição da casa, não voz — "HAPPY HOUR TODO DIA",
  // "quinta é dia de vinho", "a casa está fechada" mudam com a operação e têm de vir da base na data da peça.
  { re: /\btod[oa]s?\s+(?:os\s+|as\s+)?dias?\b|\bdiariamente\b/i, rotulo: 'disponibilidade "todo dia"' },
  { re: new RegExp(`\\b${DIA}\\s+[ée]\\s+dia\\s+de\\b`, 'i'), rotulo: 'programa fixo do dia' },
  // PR13-27: "a casa fecha cedo", "com a casa fechada" e "fechamos aos domingos" são o mesmo fato de funcionamento.
  { re: /\b(?:casa|restaurante|loja|cozinha)\s+(?:est[áa]|fica|permanece)\s+fechad[ao]s?\b|\bcasa\s+fechada\b|\bestamos\s+fechad[ao]s\b|\bn[ãa]o\s+abr(?:e|imos)\b|\bfecha(?:mos)?\s+(?:mais\s+)?cedo\b|\bfecha(?:mos)?\s+(?:a|à|na|no|aos?|às?|em)\s+(?:o\s+)?(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|feriado)|\bfechad[ao]s?\s+(?:a|à|na|no|aos?|às?|em)\s+(?:o\s+)?(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|feriado)/i, rotulo: 'dia fechado' },
  // PR13-27: refeição ou período AMARRADOS a um dia ("jantar de domingo", "programação noturna em domingo e segunda",
  // "domingo nada noturno; segunda nada de almoço", "programação em domingo") são condição da casa — o que o cliente
  // recebe em cada dia e período vem da base, na data da peça. Citar o dia sozinho ("SEXTA NO QUINTAL") não é.
  { re: new RegExp(`\\b(?:jantar|almo[çc]o|caf[ée]\\s+da\\s+manh[ãa]|brunch)\\s+d[eao]s?\\s+${DIA}`, 'i'), rotulo: 'refeição por dia' },
  { re: new RegExp(`\\b(?:noturn[oa]s?|matinal|matutin[oa]|vespertin[oa]|de\\s+(?:almo[çc]o|jantar|manh[ãa]))\\s+(?:em|a[os]?|às?|n[ao]s?)\\s+(?:o\\s+|a\\s+)?${DIA}`, 'i'), rotulo: 'período por dia' },
  { re: new RegExp(`\\b${DIA}\\s+(?:nada|sem|s[óo])\\s+(?:noturn[oa]|de\\s+(?:almo[çc]o|jantar|manh[ãa])|à\\s+noite|de\\s+dia)`, 'i'), rotulo: 'período por dia' },
  { re: new RegExp(`\\bprograma[çc][ãa]o\\s+(?:em|a[os]?|às?|n[ao]s?)\\s+(?:o\\s+|a\\s+)?${DIA}`, 'i'), rotulo: 'programação por dia' },
  // PR13-29: DISPONIBILIDADE de item, canal e preparo também é condição da casa — "exclusivo da Praia do Canto",
  // "cervejas além da IPA", "não existem"/"sem site ou app"/"só com garçom"/"retirada sim", "a casa não tem brasa,
  // os cortes são grelhados" mudam com a operação e têm de vir da base. A orientação genérica ("vem da base") passa.
  { re: /\bexclusiv[oa]s?\s+(?:d[aeo]s?|n[ao]s?)\s+(?:o\s+|a\s+)?[A-ZÀ-Ú]/, rotulo: 'exclusividade de unidade' },
  { re: /\b(?:cervejas?|bebidas?|drinks?|vinhos?|sobremesas?|pratos?|sabores?)\s+(?:sem\s+[áa]lcool\s+)?al[ée]m\s+d[aeo]s?\b/i, rotulo: 'cardápio restrito a item' },
  { re: /\b(?:whatsapp|site|app|aplicativo|delivery|entrega|encomendas?|link\s+de\s+pedido|bot[ãa]o\s+de\s+compra|telefone)\b[^.;]{0,40}\bn[ãa]o\s+(?:existem?|temos|fazemos|oferecemos)\b|\bn[ãa]o\s+(?:temos|fazemos|oferecemos|trabalhamos\s+com)\s+(?:whatsapp|site|app|aplicativo|delivery|entrega|encomendas?)\b|\bsem\s+(?:site|app|aplicativo|delivery|entrega)\b|\b(?:s[óo]|apenas|somente)\s+(?:com|pel[oa]|por|via)\s+(?:o\s+|a\s+)?(?:gar[çc]om|gerente|balc[ãa]o|direct|whatsapp|telefone)\b|\bretirada\s+sim\b/i, rotulo: 'canal ou serviço afirmado' },
  { re: /\b(?:casa|cozinha|restaurante)\s+(?:n[ãa]o\s+)?(?:tem|usa|trabalha\s+com)\s+(?:brasa|chapa|forno|defuma[çc][ãa]o|grelha)\b|\bs[ãa]o\s+grelhad[oa]s\b/i, rotulo: 'preparo afirmado' },
  // PR13-31/32: a lista FECHADA de programação ("além de Samba do Canto e Almoço ao vivo"), o cadastro afirmado
  // ("não está cadastrado", "inventar número") e o serviço/cortesia afirmados ("retirada no balcão", "brinde à
  // escolha") também mudam com a operação — vêm da base, na data da peça.
  { re: /\bprograma[çc][ãa]o\s+al[ée]m\s+d[aeo]s?\b|\bal[ée]m\s+d[aeo]s?\s+[A-ZÀ-Ú][^,;)]{2,40}\s+e\s+[A-ZÀ-Ú]/, rotulo: 'programação fechada' },
  { re: /\bn[ãa]o\s+est[áa]\s+cadastrad[oa]s?\b|\bn[ãa]o\s+cadastrad[oa]s?\b|\binventar\s+(?:n[úu]mero|telefone|endere[çc]o)\b/i, rotulo: 'cadastro afirmado' },
  { re: /\bretirada\s+(?:no|na|em)\s+balc[ãa]o\b|\bdispon[íi]vel\s+para\s+retirada\b|\bbrindes?\b|\bcortesias?\s+(?:d[aeo]|para|no|na)\b|\b(?:sobremesa|drink|caf[ée])\s+(?:de\s+)?cortesia\b/i, rotulo: 'serviço ou cortesia afirmados' },
  // PR13-33: o ESTADO de confirmação de um dado ("os números do site não estão confirmados") e o CONJUNTO FIXO de
  // unidades ("as DUAS lojas (Praia do Canto e Shopping Vitória)", "ambas as unidades") também mudam com a operação —
  // confirmar o número na base, ou abrir/fechar uma loja, não pode deixar a voz afirmando o estado anterior. A
  // exigência de confirmação ("não confirmado na entrada X da base") e a orientação sem o conjunto ("todas as
  // unidades vigentes, vindas da base") passam; "últimas unidades" é vocabulário de varejo, não conjunto.
  { re: /\b(?:n[ãa]o\s+)?(?:est[áa]|est[ãa]o|foi|foram|j[áa]\s+(?:est[áa]|est[ãa]o|foi|foram))\s+confirmad[oa]s?\b|\bj[áa]\s+confirmad[oa]s?\b/i, rotulo: 'estado de confirmação' },
  { re: /\b(?:as\s+|os\s+)?(?:duas|dois|tr[êe]s|quatro|cinco|\d+)\s+(?:lojas|unidades|casas|endere[çc]os|filiais)\b|\bambas\s+as\s+(?:lojas|unidades|casas|filiais)\b|\bambos\s+os\s+endere[çc]os\b/i, rotulo: 'conjunto fixo de unidades' },
  { re: /\b(?:lojas|unidades|casas|filiais)\s*\([A-ZÀ-Ú][^)]{1,60}\s+e\s+[A-ZÀ-Ú]/, rotulo: 'conjunto fixo de unidades' },
  // PR13-34: o SERVIÇO e o PREPARO afirmados como identidade ("a Bacana é no kilo, não rodízio", "grelhado na hora",
  // "os cortes grelhados") também são condição da casa — trocar o serviço ou a técnica na base não pode deixar a voz
  // afirmando o anterior. O NOME do serviço no vocabulário ("no kilo" nos termos) continua sendo vocabulário, e a
  // palavra nua nas proibições ("rodízio") continua sendo palavra proibida, não afirmação.
  // (`\b` do JS não enxerga acento: "é" e "não" entram por espaço ou início, nunca por `\b`.)
  { re: /(?:^|\s)(?:é|somos|servimos|trabalhamos)\s+(?:no|a|por)\s+(?:kilo|quilo)\b|(?:^|\s)n[ãa]o\s+(?:é\s+|tem\s+|temos\s+|fazemos\s+)?rod[íi]zio\b|(?:^|\s)(?:é|tem|temos)\s+rod[íi]zio\b|\bgrelhad[oa]s?\s+na\s+hora\b|\bcortes?\s+grelhad[oa]s?\b/i, rotulo: 'serviço ou preparo afirmado' },
]

/**
 * CONDIÇÕES operacionais que o detector de preço/horário/data/promoção não
 * pega e que também são fato da base, não voz: a mecânica ("chopp e drinks
 * selecionados em dobro"), a janela de dias ("de segunda a quinta") e o
 * período ("no jantar") — as duas que sobraram na proposta do TERO (PR13-07) —,
 * e a DISPONIBILIDADE ("todo dia"), o programa fixo do dia ("quinta é dia de
 * vinho") e o dia fechado ("a casa está fechada") que sobraram no By Rock e no
 * Empório (PR13-25), e a refeição ou o período AMARRADOS a um dia ("jantar de
 * domingo", "programação noturna em domingo e segunda", "domingo nada noturno")
 * que sobraram no Seu Quinto, no Quintal e no TERO (PR13-27). Texto entre
 * aspas é vocabulário citado (o que a regra proíbe ou exige), não condição;
 * "lista fechada" e "menu fechado" não são dia fechado; o dia SOZINHO
 * ("SEXTA NO QUINTAL", "Domingou no boteco") é editorial e passa.
 */
export function condicoesOperacionais(texto: string): string[] {
  const semCitacoes = texto.replace(/"[^"]*"|“[^”]*”|'[^']*'/g, ' ')
  return [...new Set(CONDICOES_OPERACIONAIS.filter((c) => c.re.test(semCitacoes)).map((c) => c.rotulo))]
}

/**
 * Frases do DNA de texto que carregam DADO (preço, horário, data, promoção) —
 * o que a voz recusa e a base recebe. O rodapé "(AAAA-MM-DD — motivo)" de uma
 * regra aprendida é METADADO da regra (quando e por que ela nasceu), não fato:
 * sai antes da leitura, senão toda regra legada virava "data" na prévia.
 */
/** TODAS as frases do DNA de texto, na leitura de `frasesDe` — as citáveis por extenso no manifesto (PR13-32). */
export function frasesDoDna(dna: DnaDeTexto): string[] {
  const frases: string[] = []
  for (const origem of ['toneOfVoice', 'contentRules'] as const) {
    const texto = dna[origem]
    if (texto) frases.push(...frasesDe(texto))
  }
  return [...new Set(frases)]
}

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
  const olhar = (caminho: string, trecho: string, opcoes: { proibicaoOuRegra?: boolean; soPrecoEHorario?: boolean; vocabulario?: boolean; condicoesTambem?: boolean } = {}) => {
    const dados = dadosProibidos(trecho)
    let tipos: TipoDeFatoNaVoz[] = dados.tipos
    if (opcoes.soPrecoEHorario) tipos = tipos.filter((t) => t === 'preco' || t === 'horario')
    if (opcoes.proibicaoOuRegra && tipos.includes('promocao')) {
      const termosDePromocao = dados.termos.filter((t) => /%|^\d|leve\d+pague/.test(t) || !PALAVRA_DE_PROMOCAO_NUA.test(t))
      if (termosDePromocao.length === 0) tipos = tipos.filter((t) => t !== 'promocao')
    }
    // Condição operacional é fato em qualquer campo de copy E nas regras. Ficam de fora o motivo da REGRA (é
    // história) e o VOCABULÁRIO: "happy em dobro" nos termos é o NOME que a casa dá à mecânica, não a promessa
    // de que ela vale — a promessa (o que dobra, quando) é o que a regra e o exemplo não podem carregar. O motivo
    // da REESCRITA é lido para preço, horário e condição (PR13-34): `vozParaPrompt` o leva ao prompt.
    if ((!opcoes.soPrecoEHorario || opcoes.condicoesTambem) && !opcoes.vocabulario && condicoesOperacionais(trecho).length > 0) tipos = [...tipos, 'condicao']
    if (tipos.length > 0) achados.push({ caminho, trecho, tipos })
  }
  olhar('descricao', voz.descricao)
  if (voz.tratamento) olhar('tratamento', voz.tratamento)
  voz.exemplos.forEach((e, i) => olhar(`exemplos.${i}`, e))
  voz.antesDepois.forEach((r, i) => {
    olhar(`antesDepois.${i}.depois`, r.depois)
    // O motivo da reescrita vai ao prompt (`vozParaPrompt`): "a Bacana é no kilo, não rodízio" ali é afirmação de
    // serviço (PR13-34). Como o motivo da regra, ele carrega a DATA em que a reescrita nasceu (história, não dado) —
    // por isso só preço, horário e CONDIÇÃO são lidos nele.
    olhar(`antesDepois.${i}.motivo`, r.motivo, { soPrecoEHorario: true, condicoesTambem: true })
  })
  voz.termos.forEach((t, i) => olhar(`termos.${i}`, t, { vocabulario: true }))
  voz.proibicoes.forEach((p, i) => olhar(`proibicoes.${i}`, p, { proibicaoOuRegra: true }))
  voz.regras.forEach((r, i) => {
    if (!r.ativa) return
    olhar(`regras.${i}.texto`, r.texto, { proibicaoOuRegra: true })
    olhar(`regras.${i}.motivo`, r.motivo, { soPrecoEHorario: true })
  })
  return achados
}

// ── o texto de marca: voz × DNA ─────────────────────────────────────────────

/**
 * A conferência do TEXTO DE MARCA (13/09/2026): exemplo e CTA da voz vêm do
 * DNA, verbatim — nunca inventados —, e a lista de CTAs do DNA entra INTEIRA
 * na voz. Uma conferência de 13/09 achou, nas dez propostas, frases que o DNA
 * não tem ("Vem de happy hour", "SEXTA NO QUINTAL", "CHURRASCO DE VERDADE") e
 * listas de CTA pela metade (o Espeto com 10 de 20), com a prévia muda. Lista
 * fechada pela metade é pior que lista nenhuma: o gerador completa inventando.
 *
 * A única normalização é a de ESPAÇOS: caixa, acento e pontuação contam. A
 * exceção declarada é o ponto final que fecha o item na PROSA do DNA
 * ("CTA: Reserve sua mesa. Faça sua reserva.") — ele é separador, não parte do
 * CTA, e sai dos dois lados só na comparação de CTA com CTA.
 *
 * A voz não tem campo de CTA: a lista mora nos exemplos (ou numa regra) no
 * MESMO formato em que o DNA a escreve — um rótulo que começa por "CTAs" e os
 * itens depois dos dois-pontos ("CTAs (lista fechada): A · B · C"). O mesmo
 * extrator lê os dois lados.
 */
function soEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function semPontoFinal(texto: string): string {
  return soEspacos(texto).replace(/\.$/, '').trim()
}

/** Uma lista de CTAs encontrada num texto (do DNA ou da voz). */
export interface ListaDeCtas {
  itens: string[]
  /** O texto declara a lista FECHADA ("lista fechada", "cópia literal", ou a lista vem sob "LISTAS FECHADAS"). */
  fechada: boolean
  /** A linha do rótulo, para a prévia mostrar de onde a lista saiu. */
  rotulo: string
}

/** Rótulo de lista de CTA: a linha COMEÇA por "CTA"/"CTAs", ou fala da "lista fechada de CTAs". */
const ROTULO_DE_CTA = /^CTAs?\b|\blista\s+fechada\s+de\s+CTAs\b/i
/** Rótulo que VETA um CTA ("CTA de deslizar … está VETADO: …") não abre lista de CTA aprovado. */
const ROTULO_QUE_VETA = /\bvetad|\bproibid|\bnunca\b|\brevogad/i
const DECLARA_FECHADA = /listas?\s+fechadas?|c[óo]pia\s+literal/i

function limparLinhaDeLista(linha: string): string {
  return linha.replace(RODAPE_DA_LINHA, '').replace(MARCADOR_DE_LISTA, '').replace(/\*\*/g, '').trim()
}

function itemDeCta(bruto: string): string {
  return bruto
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/`/g, '')
    .trim()
    .replace(/^["“']+|["”']+$/g, '')
    .replace(/\.$/, '')
    .trim()
}

/**
 * Os itens de uma lista escrita em prosa. Com separador " · " ou ", " a lista
 * termina no primeiro ponto final seguido de frase nova ("… · Te esperamos
 * aqui. CTA novo não entra sem aprovação."); sem separador, a lista é de
 * frases ("Reserve sua mesa. Faça sua reserva.").
 */
function itensDaLista(conteudo: string): string[] {
  let c = conteudo.trim()
  let partes: string[]
  if (c.includes(' · ') || c.includes(', ')) {
    const fim = c.search(/\.\s+(?=[A-ZÀ-Ú"“])/)
    if (fim >= 0) c = c.slice(0, fim)
    partes = c.split(c.includes(' · ') ? ' · ' : ', ')
  } else {
    partes = c.split(/(?<=\.)\s+/)
  }
  return partes.map(itemDeCta).filter((i) => i.length >= 2)
}

/**
 * As listas de CTA de um texto. Uma lista começa num rótulo (`ROTULO_DE_CTA`)
 * que termina em dois-pontos: os itens vêm na mesma linha ou, com o rótulo
 * sozinho, nos itens de lista logo abaixo (ou na linha seguinte inteira).
 * Rótulo que veta ("está VETADO") não é lista de aprovados.
 */
export function listasDeCtas(texto: string | null | undefined): ListaDeCtas[] {
  if (!texto) return []
  const linhas = texto.split('\n')
  const listas: ListaDeCtas[] = []
  let sobListasFechadas = false
  for (let i = 0; i < linhas.length; i++) {
    const linha = limparLinhaDeLista(linhas[i])
    if (/listas?\s+fechadas?/i.test(linha)) sobListasFechadas = true
    const doisPontos = linha.indexOf(':')
    if (doisPontos < 0) continue
    const rotulo = linha.slice(0, doisPontos).trim()
    if (!ROTULO_DE_CTA.test(rotulo) || ROTULO_QUE_VETA.test(rotulo)) continue
    let itens: string[] = []
    const naLinha = linha.slice(doisPontos + 1).trim()
    if (naLinha) {
      itens = itensDaLista(naLinha)
    } else {
      let j = i + 1
      while (j < linhas.length && !linhas[j].trim()) j++
      if (j < linhas.length && MARCADOR_DE_LISTA.test(linhas[j])) {
        for (; j < linhas.length && MARCADOR_DE_LISTA.test(linhas[j]); j++) itens.push(...itensDaLista(limparLinhaDeLista(linhas[j])))
      } else if (j < linhas.length && !limparLinhaDeLista(linhas[j]).endsWith(':')) {
        itens = itensDaLista(limparLinhaDeLista(linhas[j]))
      }
    }
    if (itens.length === 0) continue
    listas.push({ itens: [...new Set(itens)], fechada: sobListasFechadas || DECLARA_FECHADA.test(rotulo), rotulo })
  }
  return listas
}

/** Uma frase de texto de marca da voz: um exemplo, ou um item de lista de CTA (nos exemplos ou numa regra ativa). */
export interface FraseDeMarcaDaVoz {
  caminho: string
  frase: string
  cta: boolean
}

export function frasesDeMarcaDaVoz(voz: VozCompacta): FraseDeMarcaDaVoz[] {
  const frases: FraseDeMarcaDaVoz[] = []
  voz.exemplos.forEach((e, i) => {
    const listas = listasDeCtas(e)
    if (listas.length === 0) frases.push({ caminho: `exemplos.${i}`, frase: e, cta: false })
    for (const l of listas) for (const item of l.itens) frases.push({ caminho: `exemplos.${i}`, frase: item, cta: true })
  })
  voz.regras.forEach((r, i) => {
    if (!r.ativa) return
    for (const l of listasDeCtas(r.texto)) for (const item of l.itens) frases.push({ caminho: `regras.${i}.texto`, frase: item, cta: true })
  })
  return frases
}

/** Voz que diz que a lista de CTA é fechada: lista rotulada fechada, ou proibição/regra ativa que fala de CTA e de lista fechada/cópia literal. */
export function vozDeclaraCtaFechado(voz: VozCompacta): boolean {
  const textos = [...voz.exemplos, ...voz.proibicoes, ...voz.regras.filter((r) => r.ativa).map((r) => r.texto)]
  return textos.some((t) => listasDeCtas(t).some((l) => l.fechada) || (/\bCTAs?\b/.test(t) && DECLARA_FECHADA.test(t)))
}

/** CTAs que a voz RETIRA explicitamente: citados entre aspas numa proibição ou numa regra ativa que veta, ou no "antes" de uma reescrita. */
function ctasRetiradosPelaVoz(voz: VozCompacta): Set<string> {
  const retirados = new Set<string>()
  const citacoes = (t: string) => [...t.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1])
  const guardar = (t: string) => retirados.add(soEspacos(t).replace(/[.!?]+$/, '').trim())
  for (const p of voz.proibicoes) citacoes(p).forEach(guardar)
  for (const r of voz.regras) if (r.ativa && ROTULO_QUE_VETA.test(r.texto)) citacoes(r.texto).forEach(guardar)
  for (const ad of voz.antesDepois) ad.antes.split(/\s+\/\s+/).forEach(guardar)
  return retirados
}

export type TipoDeDivergenciaDeMarca = 'fora-do-dna' | 'cta-ausente-na-voz' | 'lista-fechada-sem-aviso'

export interface DivergenciaDeMarca {
  tipo: TipoDeDivergenciaDeMarca
  /** Onde, na voz (vazio quando a divergência é do DNA). */
  caminho: string | null
  frase: string
  mensagem: string
}

export interface ConferenciaDeMarca {
  divergencias: DivergenciaDeMarca[]
  /** Os CTAs das listas do DNA, na ordem em que aparecem. */
  ctasDoDna: string[]
  /** CTAs do DNA que a voz retira de propósito (proibidos por regra posterior) — informativo, não bloqueia. */
  retiradosPelaVoz: string[]
}

/**
 * Exemplo e CTA da voz × o DNA de texto atual. Três divergências, todas
 * bloqueiam a migração daquele cliente (`problemasParaMigrar`):
 * - `fora-do-dna`: frase da voz que não está no DNA (espaços normalizados; caixa e acento contam);
 * - `cta-ausente-na-voz`: CTA de lista do DNA que a voz não traz — salvo o que ela retira de propósito, citando-o numa proibição, numa regra que veta ou no "antes" de uma reescrita;
 * - `lista-fechada-sem-aviso`: o DNA fecha a lista de CTAs e a voz não diz que é fechada.
 */
export function conferirTextoDeMarca(voz: VozCompacta, dna: DnaDeTexto): ConferenciaDeMarca {
  const dnaPlano = soEspacos([dna.toneOfVoice, dna.contentRules].filter((t): t is string => !!t).join('\n'))
  const frases = frasesDeMarcaDaVoz(voz)
  const divergencias: DivergenciaDeMarca[] = []
  for (const f of frases) {
    if (dnaPlano.includes(soEspacos(f.frase))) continue
    divergencias.push({ tipo: 'fora-do-dna', caminho: f.caminho, frase: f.frase, mensagem: `${f.caminho}: "${f.frase}" não está no DNA — ${f.cta ? 'CTA' : 'exemplo'} da voz vem do DNA, verbatim (caixa e acento contam)` })
  }
  const listasDoDna = [...listasDeCtas(dna.toneOfVoice), ...listasDeCtas(dna.contentRules)]
  const ctasDoDna = [...new Set(listasDoDna.flatMap((l) => l.itens))]
  const naVoz = new Set(frases.map((f) => semPontoFinal(f.frase)))
  const retirados = ctasRetiradosPelaVoz(voz)
  const retiradosPelaVoz: string[] = []
  for (const cta of ctasDoDna) {
    if (naVoz.has(semPontoFinal(cta))) continue
    if (retirados.has(soEspacos(cta).replace(/[.!?]+$/, '').trim())) {
      retiradosPelaVoz.push(cta)
      continue
    }
    divergencias.push({ tipo: 'cta-ausente-na-voz', caminho: null, frase: cta, mensagem: `CTA do DNA ausente na voz: "${cta}" — a lista de CTAs do DNA entra inteira` })
  }
  if (listasDoDna.some((l) => l.fechada) && !vozDeclaraCtaFechado(voz)) {
    divergencias.push({ tipo: 'lista-fechada-sem-aviso', caminho: null, frase: '', mensagem: 'o DNA fecha a lista de CTAs e a voz não diz que ela é fechada' })
  }
  return { divergencias, ctasDoDna, retiradosPelaVoz }
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
  const textoDeMarca = voz ? conferirTextoDeMarca(voz, args.dna) : null
  for (const d of textoDeMarca?.divergencias ?? []) avisos.push(`⛔ ${d.mensagem} (bloqueia a migração deste cliente)`)
  const semCorrespondente = regrasLegadas.filter((r) => r.situacao === 'sem-correspondente')
  if (semCorrespondente.length > 0) avisos.push(`${semCorrespondente.length} regra(s) aprendida(s) do DNA sem correspondente na voz — confira se foram absorvidas na descrição/exemplos ou se ficaram de fora de propósito.`)
  if (naVoz.length > 0) avisos.push(`a voz proposta carrega DADO (${naVoz.map((f) => f.caminho).join(', ')}): fato vai para a base, nunca para a voz.`)
  if (noLegado.length > 0) avisos.push(`${noLegado.length} frase(s) do DNA carregam dado (preço, horário, data ou promoção): quem quiser mantê-las lista cada uma no manifesto, com categoria e título, para virar entrada da base — e qualquer outra frase do DNA integral também pode ser citada por extenso.`)
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
    textoDeMarca,
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
  if (p.textoDeMarca) {
    const m = p.textoDeMarca
    L.push('## Texto de marca: exemplos e CTAs da voz × o DNA')
    L.push('')
    L.push(`- CTAs nas listas do DNA: ${m.ctasDoDna.length}${m.ctasDoDna.length > 0 ? ` (${m.ctasDoDna.map((c) => `"${c}"`).join(', ')})` : ''}`)
    if (m.retiradosPelaVoz.length > 0) L.push(`- retirados de propósito pela voz (proibidos por regra posterior): ${m.retiradosPelaVoz.map((c) => `"${c}"`).join(', ')}`)
    if (m.divergencias.length === 0) L.push('- ✓ todo exemplo e CTA da voz está no DNA, verbatim, e toda lista de CTAs do DNA está inteira na voz')
    for (const d of m.divergencias) L.push(`- ⚠️ ${d.mensagem}`)
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
  L.push('Os detectores acima são uma AJUDA de leitura, não o limite: qualquer frase do DNA integral (seções "antes", acima) pode ser citada por extenso em `fatosParaABase` — a aplicação aceita o trecho que é fato detectado OU frase inteira do DNA desta prévia, e recusa o que não está nele.')
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

/**
 * "AAAA-MM-DD" de um dia que EXISTE no calendário (PR13-24): a expressão
 * regular aceitava o mês 13 e 29/02 de ano comum, e a conversão para `Date`
 * só falhava tarde — no script, depois de fatos anteriores já gravados.
 * A ida e volta pelo ISO em UTC é o que recusa a data normalizada em silêncio.
 */
export function diaExiste(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const d = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
}
const diaDoCalendario = z.string().refine(diaExiste, { message: 'data inválida — precisa ser AAAA-MM-DD de um dia que existe no calendário' })

export const fatoParaABaseSchema = z
  .object({
    /** O trecho EXATO listado na prévia (é como a aplicação confere que a pessoa viu o que aprova). */
    trecho: z.string().min(6),
    categoria: z.enum(CATEGORIAS_DE_FATO),
    titulo: z.string().min(3).max(120),
    /** Sem prazo = vale para sempre; campanha leva a data em que vence (AAAA-MM-DD). */
    validaAte: diaDoCalendario.optional(),
  })
  .strict()

export const clienteDoManifestoSchema = z
  .object({
    projectId: z.number().int().positive(),
    nome: z.string().min(1),
    versaoDaPrevia: z.string().min(8),
    decisao: z.enum(DECISOES),
    aprovadoPor: z.string().min(1).optional(),
    aprovadoEm: diaDoCalendario.optional(),
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
  return isolamentoDoServico(prod, alvo, 'UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN')
}

/**
 * O CACHE de busca da base (Redis do Upstash) segue a mesma régua do indexador
 * (PR13-30): `invalidateProjectCache` roda ao criar e ao reindexar um fato, e
 * um `UPSTASH_REDIS_*` herdado do `.env` em `--dev` incrementaria a versão do
 * cache de PRODUÇÃO (e apagaria chaves dela). Em dev só o Redis PRÓPRIO do
 * `.env.development.local`; sem ele o cache é desligado (sem as variáveis o
 * caminho é no-op limpo).
 */
export function isolamentoDoCache(prod: Record<string, string | undefined>, alvo: Record<string, string | undefined>): Indexador {
  return isolamentoDoServico(prod, alvo, 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN')
}

function isolamentoDoServico(prod: Record<string, string | undefined>, alvo: Record<string, string | undefined>, urlKey: string, tokenKey: string): Indexador {
  const url = alvo[urlKey]?.trim()
  const token = alvo[tokenKey]?.trim()
  if (!url || !token) return 'ausente'
  return url === prod[urlKey]?.trim() ? 'producao' : 'isolado'
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

/**
 * A marca DURÁVEL de que o fato foi indexado por completo (metadata da entrada).
 * A linha existir não prova indexação (PR13-11). Mora em módulo próprio da base
 * (`knowledge/marca-de-indexado.ts`) porque quem a INVALIDA e REPÕE é o
 * reindexador (PR13-36); aqui só é lida.
 */
export { MARCA_DE_INDEXADO, CICLO_DE_INDEXACAO, cicloDeIndexacaoDe, comCicloDeIndexacao } from '../knowledge/marca-de-indexado'
export type EstadoDoFato = 'ausente' | 'incompleto' | 'completo'
/** Pela linha da base: sem linha `ausente`; linha sem `indexadoEm` (interrompida entre o SQL e o vetor, ou reindexação que caiu depois das exclusões) `incompleto`; com a marca `completo`. */
export function classificarFato(linha: { metadata?: unknown } | null | undefined): EstadoDoFato {
  if (!linha) return 'ausente'
  return temMarcaDeIndexado(linha.metadata) ? 'completo' : 'incompleto'
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

/** Um fato aprovado, já na base, que a ativação da voz confere de novo DENTRO da transação (PR13-35). */
export interface FatoEsperado {
  entryId: string
  trecho: string
  categoria: string
  validaAte: string | null
}

/**
 * Os fatos aprovados ainda são o que foi conferido? Chamada pela ativação da
 * voz, na MESMA transação que liga a precedência (PR13-35): entre a 2ª passada
 * e a ativação a linha pode ter sido arquivada, editada ou perdido a indexação
 * — e a voz não pode assumir com a base que a sustenta fora do lugar. Devolve
 * TODOS os problemas; vazio é "pode ativar".
 */
export function conferirFatosEsperados(fatos: readonly FatoEsperado[], linhas: ReadonlyMap<string, LinhaDoFato & { metadata?: unknown }>): string[] {
  const problemas: string[] = []
  for (const f of fatos) {
    const rotulo = `"${f.trecho.slice(0, 60)}" (${f.entryId})`
    const linha = linhas.get(f.entryId)
    if (!linha) {
      problemas.push(`${rotulo}: a linha não existe mais`)
      continue
    }
    const d = divergenciasDoFato(linha, f)
    if (classificarFato(linha) !== 'completo') d.push('indexação não concluída (sem indexadoEm)')
    if (d.length > 0) problemas.push(`${rotulo}: ${d.join(', ')}`)
  }
  return problemas
}

function diaEmBrasilia(d: Date | string): string | null {
  const data = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(data.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data)
}

export interface EstadoDoCliente {
  /** A versão da prévia CALCULADA AGORA (DNA atual + voz proposta atual). */
  versaoDaPreviaAtual: string
  /** Os trechos de fato que a prévia atual lista (os detectados). */
  trechosDeFato: string[]
  /**
   * TODAS as frases do DNA integral da prévia (PR13-32): o manifesto pode citar
   * por extenso qualquer frase do DNA aprovado, detectada ou não — os detectores
   * são uma AJUDA de leitura, não o limite do que pode ir para a base. Frase
   * que não está no DNA continua bloqueando.
   */
  frasesDoDna?: string[]
  /** O registro de voz que já existe no banco, se houver. */
  registro: { versao: number; migradaEm: Date | string | null } | null
  /** A voz proposta pode ser migrada agora: passa no contrato E não carrega dado nem condição operacional (PR13-07). */
  vozValida: boolean
  /** Por que não pode (vazio quando `vozValida`). */
  problemasDaVoz?: string[]
}

/**
 * O que impede a voz proposta de migrar: problemas do contrato + fato/condição
 * dentro dela e, com o DNA atual em mãos, exemplo ou CTA fora do DNA e lista
 * de CTAs do DNA incompleta na voz (`conferirTextoDeMarca`). Vazio = pode.
 * Sem `dna`, só o contrato e os fatos — quem decide migrar (o script) passa o DNA.
 */
export function problemasParaMigrar(voz: unknown, dna?: DnaDeTexto): string[] {
  const lida = lerVoz(voz)
  if (!lida.voz) return lida.problemas.map((p) => `${p.caminho}: ${p.mensagem}`)
  const fatos = fatosNaVoz(lida.voz).map((f) => `${f.caminho} carrega ${f.tipos.join('/')}: "${f.trecho.slice(0, 80)}"`)
  const marca = dna ? conferirTextoDeMarca(lida.voz, dna).divergencias.map((d) => d.mensagem) : []
  return [...fatos, ...marca]
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
    // O trecho tem de ser um fato DETECTADO ou uma frase INTEIRA do DNA integral da prévia (PR13-32) — nunca texto
    // que não está no DNA aprovado.
    const citaveis = new Set([...estado.trechosDeFato, ...(estado.frasesDoDna ?? [])])
    const foraDaPrevia = c.fatosParaABase.filter((f) => !citaveis.has(f.trecho)).map((f) => f.trecho)
    if (foraDaPrevia.length > 0) {
      return { ...base, acao: 'bloqueado' as const, motivo: `fato(s) do manifesto que a prévia não lista (nem como fato detectado, nem como frase do DNA integral): ${foraDaPrevia.map((t) => `"${t.slice(0, 60)}"`).join(', ')}` }
    }
    return { ...base, acao: 'migrar' as const, versaoEsperadaDaVoz: estado.registro?.versao ?? 0, fatos: c.fatosParaABase }
  })
}
