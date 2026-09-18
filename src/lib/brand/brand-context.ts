import { db } from '@/lib/db'
import { criarEntradaBase } from '@/lib/knowledge/entries'
import { formatarValidade } from '@/lib/knowledge/vigencia'
import { lerEstiloDasReferencias, type EstiloDasReferenciasGravado } from '@/lib/brand/estilo-das-referencias'
import { conflitosNoTextoLegado, precedenciaDaVoz, type ContextoDeVoz, type EscopoDaRegra } from '@/lib/brand/voz'
import { virarRegraNaVoz, type VirarRegraNaVozResult } from '@/lib/brand/voz-service'
import { CreativeError } from '@/lib/creatives/errors'

/**
 * Fonte única da identidade da marca para TODO prompt de geração.
 *
 * Antes deste módulo, seis consumidores (improve, chat, arte-livre,
 * arte-rápida/MCP, generate-ai-text, generate-art) faziam cada um o seu
 * `select` com um recorte diferente — campo novo de identidade só valia depois
 * de adicionado à mão em cada um. Agora o recorte é um só; quem quiser menos,
 * ignora campos.
 *
 * Também é o contrato da prévia de prompt da aba Marca: o que ela mostra é o
 * que os geradores consomem, porque ambos leem DESTE loader. E é o serviço que
 * as futuras tools de MCP (consultar/atualizar DNA via chat) vão embrulhar —
 * validação e escrita moram aqui, não na rota.
 */

export interface BrandDNASections {
  toneOfVoice: string | null
  contentRules: string | null
  composition: string | null
  visualStyle: string | null
  photoDirection: string | null
  /**
   * Crivo de aprovação, uma pergunta binária por linha. NUNCA entra em prompt
   * de geração — é checklist de revisão humana antes de agendar.
   */
  approvalChecklist: string | null
}

export interface BrandContext {
  projectId: number
  projectName: string
  dna: BrandDNASections
  cuisineType: string | null
  fonts: {
    title: string | null
    subtitle: string | null
    body: string | null
  }
  /**
   * Curadoria da prancha tipográfica (type-specimen): quando não-vazia, a
   * prancha mostra exatamente estas famílias, nesta ordem.
   */
  specimenFontFamilies: string[]
  colors: Array<{ name: string; hexCode: string }>
  logoUrl: string | null
  /**
   * Manual de identidade feito por designer. Quando existe, o Brand Reference
   * Card serve ELE em vez do card auto-gerado.
   */
  brandManualUrl: string | null
  /** `Project.artImprovementPrompt` — direção de arte própria do improve. */
  artDirection: string | null
  /**
   * O estilo OBSERVADO nas peças aprovadas (`BrandDNA.estiloDasReferencias`),
   * lido por visão em `analise-de-referencias.ts`. É a assinatura REAL da
   * marca, e o diretor de arte a recebe com prioridade sobre a prosa do DNA.
   * Fica FORA de `BRAND_DNA_FIELDS`: não é editado à mão, é medido.
   */
  estiloDasReferencias?: EstiloDasReferenciasGravado | null
  /**
   * A identidade de TEXTO resolvida pela precedência (`precedenciaDaVoz`,
   * PR 7 de "Marca simples, copy melhor"): a voz compacta quando o cliente
   * foi MIGRADO, o `toneOfVoice`/`contentRules` legado até lá. Consumidor de
   * COPY lê `voz.texto` e `voz.regrasDaMarca` — nunca `dna.toneOfVoice`
   * direto, senão a migração não chega a ele. A ARTE continua em
   * `dna.contentRules` (proibição não é estilo) e soma `voz.regrasDeArte`.
   */
  voz: ContextoDeVoz
}

export const BRAND_DNA_FIELDS = [
  'toneOfVoice',
  'contentRules',
  'composition',
  'visualStyle',
  'photoDirection',
  'approvalChecklist',
] as const

export type BrandDNAField = (typeof BRAND_DNA_FIELDS)[number]

/** Teto por seção — igual ao dos prompts de IA em Configurações. */
export const BRAND_DNA_MAX_CHARS = 10_000

const nonEmpty = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function loadBrandContext(projectId: number): Promise<BrandContext | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      brandManualUrl: true,
      cuisineType: true,
      brandStyleDescription: true,
      artImprovementPrompt: true,
      titleFontFamily: true,
      subtitleFontFamily: true,
      bodyFontFamily: true,
      specimenFontFamilies: true,
      brandDNA: true,
      brandVoice: { select: { voz: true, versao: true, migradaEm: true } },
      BrandColor: {
        select: { name: true, hexCode: true },
        orderBy: { createdAt: 'asc' },
      },
      // A logo real mora na tabela Logo (aba Assets) — `Project.logoUrl` está
      // NULL nos 10 projetos, e era por isso que nenhum gerador recebia logo
      // nenhuma. Descoberto em 09/08/2026 quando o gpt-image INVENTOU a
      // logomarca do By Rock por não ter recebido a verdadeira.
      Logo: {
        select: { fileUrl: true },
        orderBy: [{ isProjectLogo: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      },
    },
  })
  if (!project) return null

  const dna = project.brandDNA

  return {
    projectId: project.id,
    projectName: project.name,
    dna: {
      toneOfVoice: nonEmpty(dna?.toneOfVoice),
      contentRules: nonEmpty(dna?.contentRules),
      composition: nonEmpty(dna?.composition),
      // Fallback para o campo legado do Project: projetos que descreveram o
      // estilo antes do DNA existir (hoje só o Wine Vix) continuam cobertos
      // sem migração de dados.
      visualStyle: nonEmpty(dna?.visualStyle) ?? nonEmpty(project.brandStyleDescription),
      photoDirection: nonEmpty(dna?.photoDirection),
      approvalChecklist: nonEmpty(dna?.approvalChecklist),
    },
    cuisineType: nonEmpty(project.cuisineType),
    fonts: {
      title: nonEmpty(project.titleFontFamily),
      subtitle: nonEmpty(project.subtitleFontFamily),
      body: nonEmpty(project.bodyFontFamily),
    },
    specimenFontFamilies: project.specimenFontFamilies ?? [],
    colors: project.BrandColor,
    logoUrl: nonEmpty(project.logoUrl) ?? nonEmpty(project.Logo[0]?.fileUrl),
    brandManualUrl: nonEmpty(project.brandManualUrl),
    artDirection: nonEmpty(project.artImprovementPrompt),
    estiloDasReferencias: lerEstiloDasReferencias(dna?.estiloDasReferencias),
    voz: precedenciaDaVoz({ registro: project.brandVoice, dna: { toneOfVoice: dna?.toneOfVoice, contentRules: dna?.contentRules } }),
  }
}

/**
 * Escrita do DNA. Upsert campo a campo: só toca no que veio no patch, string
 * vazia vira null (seção "limpa" volta a não entrar no prompt).
 *
 * É deliberadamente um serviço e não código de rota — a rota da UI e as
 * futuras tools de MCP chamam a MESMA função.
 */
export async function updateBrandDNA(
  projectId: number,
  patch: Partial<Record<BrandDNAField, string | null>>,
  cliente: Pick<typeof db, 'brandDNA'> = db,
): Promise<BrandDNASections> {
  const data: Record<string, string | null> = {}
  for (const field of BRAND_DNA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      data[field] = nonEmpty(patch[field] ?? null)
    }
  }

  const saved = await cliente.brandDNA.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  })

  return {
    toneOfVoice: saved.toneOfVoice,
    contentRules: saved.contentRules,
    composition: saved.composition,
    visualStyle: saved.visualStyle,
    photoDirection: saved.photoDirection,
    approvalChecklist: saved.approvalChecklist,
  }
}

/**
 * "Virar regra": transforma uma correção aprovada numa conversa em linha
 * permanente do DNA, com data e motivo (Fase 4, item 3 do plano).
 *
 * É o mecanismo que fez o DNA do Espeto Gaúcho ir de 1.0 a 2.6 em dois dias:
 * sem ele, cada correção vale para uma peça e é reaprendida na semana seguinte.
 *
 * ACRESCENTA — ao contrário de `updateBrandDNA`, que substitui a seção inteira.
 * Perder o DNA existente porque alguém quis somar uma linha seria o pior
 * resultado possível, então a regra nova entra sob um cabeçalho próprio no fim
 * da seção, e o texto anterior fica intocado.
 *
 * TRIAGEM (F0.1): regra COM PRAZO não vai para o DNA. O DNA é eterno e entra
 * INCONDICIONALMENTE em todo prompt — uma linha de campanha ali continuaria
 * mandando no gerador meses depois do fim dela, e ninguém lembraria de apagar.
 * Com `validade`, a regra vira entrada CAMPANHAS na base, com `expiresAt`: sai
 * de cena sozinha no dia seguinte ao fim.
 *
 * Não grava sozinha: devolve a proposta e só escreve com `confirmado`.
 * O contrato é o mesmo do `atualizar-dna` — mostrar à pessoa o que muda antes
 * de mudar.
 */
export const APRENDIZADO_HEADER = 'Regras aprendidas na prática:'

export interface VirarRegraArgs {
  projectId: number
  /** Onde a regra mora no DNA. Ignorada — e dispensável — quando há `validade`. */
  secao?: BrandDNAField
  /** A regra, na forma imperativa em que deve valer daqui para a frente. */
  regra: string
  /** Por que ela existe — o caso concreto que a gerou. */
  motivo: string
  /** Data do aprendizado. Default: hoje. */
  data?: Date
  /**
   * Prazo da regra. Presente, ela NÃO vai para o DNA: vira entrada CAMPANHAS
   * na base de conhecimento, que expira sozinha.
   */
  validade?: Date | null
  /** Título da entrada na base, quando há validade. Default: derivado da regra. */
  titulo?: string
  /** Autor da entrada na base (id INTERNO do User). Exigido quando há validade. */
  autor?: string
  /** Sem isto nada é gravado: devolve só a proposta. */
  confirmado?: boolean
  /** Onde a regra manda (voz compacta): só na copy, só na arte, ou nas duas. Default: ambas. */
  escopo?: EscopoDaRegra
  /** Voz compacta: id da regra ativa que esta SUBSTITUI (a antiga fica inativa, no histórico). */
  substitui?: string
  /** Voz compacta: manter as duas mesmo com conflito apontado — decisão explícita de quem confirma. */
  conviver?: boolean
  /** Voz compacta: a `versaoLida` que a proposta devolveu — obrigatória ao confirmar (CAS entre prévia e confirmação). */
  versaoDaVoz?: number
}

export interface VirarRegraResultDNA {
  destino: 'dna'
  secao: BrandDNAField
  antes: string | null
  depois: string
  linhaAdicionada: string
  gravado: boolean
  /**
   * Linhas da seção que falam do MESMO assunto da regra nova (só AVISO: em
   * prosa não há substituição mecânica — no legado a regra nova é acrescentada
   * e a antiga continua; quem resolve é a pessoa, ou a migração para a voz).
   */
  conflitos: string[]
}

export interface VirarRegraResultBase {
  destino: 'base'
  categoria: 'CAMPANHAS'
  titulo: string
  conteudo: string
  validade: Date
  entradaId?: string
  gravado: boolean
}

export type VirarRegraResult = VirarRegraResultDNA | VirarRegraResultBase | VirarRegraNaVozResult

export async function virarRegra(args: VirarRegraArgs): Promise<VirarRegraResult> {
  const regra = args.regra.trim()
  const motivo = args.motivo.trim()
  if (!regra) throw new Error('A regra não pode ser vazia.')
  if (!motivo) throw new Error('Regra sem motivo não vira regra: descreva o caso que a gerou.')

  const dia = (args.data ?? new Date()).toISOString().slice(0, 10)

  if (args.validade) {
    return virarRegraDeCampanha({ ...args, regra, motivo, dia, validade: args.validade })
  }

  const secao = args.secao
  /**
   * Cliente MIGRADO para a voz compacta: regra de TEXTO (sem seção, ou nas
   * seções de texto do DNA) vai para a VOZ — com escopo, motivo, data e
   * conflito apontado (substitui / conviver). As seções de ARTE do DNA
   * (composition, visualStyle, photoDirection, approvalChecklist) continuam
   * no DNA: a voz não as substitui.
   */
  const registroVoz = await db.brandVoice.findUnique({ where: { projectId: args.projectId }, select: { migradaEm: true } })
  const secaoDeTexto = !secao || secao === 'toneOfVoice' || secao === 'contentRules'
  if (registroVoz?.migradaEm && secaoDeTexto) {
    return virarRegraNaVoz({
      projectId: args.projectId,
      texto: regra,
      motivo,
      em: dia,
      escopo: args.escopo,
      substitui: args.substitui,
      conviver: args.conviver,
      confirmado: args.confirmado,
      versaoEsperada: args.versaoDaVoz,
    })
  }
  /**
   * `versaoDaVoz`, `substitui` e `conviver` só existem numa proposta da VOZ.
   * Chegando aqui (DNA), a migração foi desfeita entre a prévia e a
   * confirmação: gravar no DNA seria outra operação que a aprovada — acrescenta
   * em vez de substituir, e a proibição antiga continua (PR7-FINAL-01 da
   * revisão do Codex, 18/09/2026). Recusa; a pessoa pede a proposta de novo.
   */
  if (secaoDeTexto && (args.versaoDaVoz != null || !!args.substitui || args.conviver === true)) {
    throw new CreativeError(
      'REGRA_DESTINO_MUDOU',
      'Esta regra foi proposta para a voz compacta, mas o cliente não está mais migrado: o DNA de texto voltou a mandar. Nada foi gravado — peça a proposta de novo.',
      409,
    )
  }
  if (!secao) {
    throw new Error(
      'Regra sem prazo vai para o DNA: informe a seção (contentRules, composition, visualStyle, photoDirection, toneOfVoice ou approvalChecklist). Se a regra vale só até uma data, mande a validade.',
    )
  }

  const atual = await db.brandDNA.findUnique({ where: { projectId: args.projectId } })
  const antes = nonEmpty(atual?.[secao] ?? null)
  // No legado não há substituição: a regra nova é acrescentada e a antiga
  // continua valendo. O aviso mostra as linhas que falam do mesmo assunto.
  const conflitos = conflitosNoTextoLegado(antes, regra)

  const linhaAdicionada = `- ${regra} (${dia} — ${motivo})`

  let depois: string
  if (!antes) {
    depois = `${APRENDIZADO_HEADER}\n${linhaAdicionada}`
  } else if (antes.includes(APRENDIZADO_HEADER)) {
    // Já existe a lista: a linha entra no fim dela, que é o fim da seção.
    depois = `${antes.trimEnd()}\n${linhaAdicionada}`
  } else {
    depois = `${antes.trimEnd()}\n\n${APRENDIZADO_HEADER}\n${linhaAdicionada}`
  }

  if (depois.length > BRAND_DNA_MAX_CHARS) {
    throw new Error(
      `A seção ${secao} passaria de ${BRAND_DNA_MAX_CHARS} caracteres. O DNA é síntese: consolide as regras antigas antes de somar outra.`,
    )
  }

  if (args.confirmado) {
    if (secaoDeTexto) {
      /**
       * A migração pode ser LIGADA entre a escolha deste ramo e a escrita: a
       * regra cairia no DNA de texto que já não manda na copy. A linha da voz
       * é travada e relida na mesma transação da escrita — `migrarParaVoz`
       * escreve nela e espera. ponytail: sem linha de voz não há o que travar;
       * migrar exige gravar a voz antes (outra chamada), janela desprezível.
       */
      await db.$transaction(async (tx) => {
        const [voz] = await tx.$queryRaw<Array<{ migradaEm: Date | null }>>`SELECT "migradaEm" FROM "BrandVoice" WHERE "projectId" = ${args.projectId} FOR UPDATE`
        if (voz?.migradaEm) {
          throw new CreativeError(
            'REGRA_DESTINO_MUDOU',
            'O cliente foi migrado para a voz compacta enquanto a regra era confirmada: o DNA de texto não manda mais na copy. Nada foi gravado — peça a proposta de novo.',
            409,
          )
        }
        await updateBrandDNA(args.projectId, { [secao]: depois }, tx)
      })
    } else {
      await updateBrandDNA(args.projectId, { [secao]: depois })
    }
  }

  return { destino: 'dna', secao, antes, depois, linhaAdicionada, gravado: !!args.confirmado, conflitos }
}

/**
 * O ramo com prazo. Reusa `criarEntradaBase` — a mesma gravação do
 * `criar-entrada-base` do MCP, com indexação e rollback — em vez de escrever
 * na tabela por fora.
 */
async function virarRegraDeCampanha(args: {
  projectId: number
  regra: string
  motivo: string
  dia: string
  validade: Date
  titulo?: string
  autor?: string
  confirmado?: boolean
}): Promise<VirarRegraResultBase> {
  const titulo = (args.titulo?.trim() || `Regra de campanha — ${resumir(args.regra)}`).slice(0, 200)
  const conteudo = [
    args.regra,
    '',
    `Por quê: ${args.motivo} (registrado em ${args.dia})`,
    `Vale até ${formatarValidade(args.validade)}.`,
  ].join('\n')

  if (!args.confirmado) {
    return {
      destino: 'base',
      categoria: 'CAMPANHAS',
      titulo,
      conteudo,
      validade: args.validade,
      gravado: false,
    }
  }

  if (!args.autor) {
    throw new Error('Gravar regra com prazo exige o autor da entrada (id interno do usuário).')
  }

  const entrada = await criarEntradaBase({
    projectId: args.projectId,
    category: 'CAMPANHAS',
    title: titulo,
    content: conteudo,
    tags: ['regra', 'campanha'],
    expiresAt: args.validade,
    metadata: { origem: 'virar-regra' },
    autor: args.autor,
  })

  return {
    destino: 'base',
    categoria: 'CAMPANHAS',
    titulo,
    conteudo,
    validade: args.validade,
    entradaId: entrada.id,
    gravado: true,
  }
}

function resumir(texto: string, max = 60): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length <= max ? limpo : `${limpo.slice(0, max - 1).trimEnd()}…`
}

// A leitura do crivo em itens mora em `approval-checklist.ts`, que não importa
// nada — este módulo puxa o Prisma, e a bancada que consome o crivo é client.
export { parseApprovalChecklist } from '@/lib/brand/approval-checklist'
