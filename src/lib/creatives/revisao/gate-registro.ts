/**
 * CP5b — o REGISTRO persistido do gate (`Generation.fieldValues.gateDaArte`), conforme
 * `docs/PLANO-2026-10-16-CP5B-CONTRATO.md` (PR #239): auditoria do veredito do CP5a com a IDENTIDADE da peça
 * medida, a política e as versões.
 *
 * - `decidirEMontarRegistro`: o registro nasce da MESMA chamada que decide. Confere o VÍNCULO da entrada com a
 *   página ANTES de decidir (camadas, identidade, formato, canvas, tipo do post, os dois classificadores de
 *   formato), reconcilia a copy DENTRO da fronteira e só então chama `gateDaMedida`. Sem vínculo não há gate —
 *   logo nenhum APTO existe para o produtor usar. O registro sai SELADO (tipo com `unique symbol` não exportado),
 *   CONGELADO em profundidade e num `WeakSet` privado: é a proveniência que o escritor confere.
 * - `lerGateDaArte`: schema estrito + invariante 2.3 do CP5a; três estados (`ausente` / `invalido` / `ok`), e nada
 *   de um JSON rejeitado sai — só as versões gravadas, quando casam com um regex curto.
 * - `validadeDoGate`: diz se os METADADOS do registro coincidem com a peça de hoje. Não existe "vigente": a
 *   identidade não cobre bytes de assets e fontes, assinatura nem gradiente (§ 4.2); quem precisa do veredito
 *   atual mede de novo. Nenhum caminho de produção decide por este registro.
 *
 * Módulo PURO (zod + node:crypto): NÃO importa `@/lib/db`.
 */
import { z } from 'zod'
import { FORMATOS, type Formato } from '@/lib/compositor/spec'
import { TIPO_DO_POST_POR_FORMATO } from '@/lib/lotes/agendamento'
import { lerCamadas } from '@/lib/posts/page-layers'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import type { RelatorioDaRevisao } from './contrato'
import { CONFERENCIAS_DO_GATE, REGRAS_CRITICAS, VERSAO_DO_GATE, gateDaMedida, type EntradaDoGate, type GateDaArte, type PoliticaDoAssunto } from './gate'
import { estavel, identidadeDaPagina } from './versao'

export const CHAVE_DO_GATE = 'gateDaArte'

/** Conjunto FECHADO (decisão 9.8): tool nova que grave o registro = PR com decisão. */
export const ORIGENS_DO_GATE = ['agendar-leva', 'ajustar-arte', 'revisar-arte', 'piloto'] as const
export type OrigemDoGate = (typeof ORIGENS_DO_GATE)[number]

export interface IdentidadeDoRegistro {
  /** O VÍNCULO: a Generation desta página, deste projeto (duas páginas iguais têm os mesmos hashes — § 3.1). */
  projectId: number
  generationId: string
  pageId: string
  /** O classificador do REVISOR (decide piso e canvas canônico) e o do COMPOSITOR (Codex R12): os dois entram. */
  formato: Formato | null
  formatoDoCompositor: Formato
  pageVersion: string | null
  copyVersion: string
}

export interface RegistroDoGate {
  /** A saída do CP5a, inteira, como saiu. */
  gate: GateDaArte
  /** A política com que o veredito foi calculado — sem ela o veredito não se lê. */
  politica: PoliticaDoAssunto
  identidade: IdentidadeDoRegistro
  /** ISO-8601, relógio do servidor que mediu. Não entra na validade. */
  medidoEm: string
  origem: OrigemDoGate
  /** Quem pediu (perfil MCP), quando houver — auditoria, nunca autoridade. Não entra na validade. */
  principal?: { tipo: string; id: string }
}

/**
 * § 4.2 — o que a identidade NÃO cobre e por isso o leitor nunca diz "vigente". A lista é fixa e sai em todo
 * `coincidente`: é o leitor quem diz o que não provou, não o consumidor.
 */
export const NAO_CONFERIDO_PELA_IDENTIDADE: readonly string[] = Object.freeze([
  'os bytes dos assets (foto de fundo, logo) — a mesma URL pode ter bytes novos',
  'os bytes das fontes do projeto (CustomFont.fileUrl) — trocar o arquivo preservando a família muda a geometria',
  'as referências da assinatura do projeto',
  'a faixa do gradiente do projeto',
  'o que a medição lê fora da página (assunto gravado, régua)',
])

// ─────────────────────────────────────────────────────────────────────────
// Selo e congelamento (§ 3.1, Codex R13/R14) — só `decidirEMontarRegistro` produz um registro gravável
// ─────────────────────────────────────────────────────────────────────────

const SELO: unique symbol = Symbol('registro-selado-por-decidirEMontarRegistro')
export type RegistroSelado = Readonly<RegistroDoGate> & { readonly [SELO]: true }
const selados = new WeakSet<object>()

function congelar<T>(valor: T): T {
  if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
    for (const v of Object.values(valor as Record<string, unknown>)) congelar(v)
    Object.freeze(valor)
  }
  return valor
}

/** Verdadeiro só para o objeto que `decidirEMontarRegistro` devolveu (o `WeakSet` privado) — um clone estrutural não passa. */
export function foiSeladoPorDecidir(registro: unknown): registro is RegistroSelado {
  return typeof registro === 'object' && registro !== null && selados.has(registro)
}

/** Congelado em profundidade: todo objeto e array alcançável está `Object.isFrozen`. */
export function congeladoEmProfundidade(valor: unknown): boolean {
  if (!valor || typeof valor !== 'object') return true
  if (!Object.isFrozen(valor)) return false
  return Object.values(valor as Record<string, unknown>).every(congeladoEmProfundidade)
}

// ─────────────────────────────────────────────────────────────────────────
// Decidir E montar (§ 3.1) — o vínculo antes da decisão, a copy dentro da fronteira
// ─────────────────────────────────────────────────────────────────────────

export interface PaginaParaDecisao {
  id: string
  name: string
  tags: string[]
  width: number
  height: number
  background?: string | null
  layers: unknown
  copyAutoral?: unknown
}

export type DecisaoDoGate =
  | { decisao: 'ok'; gate: GateDaArte; relatorio: RelatorioDaRevisao; registro: RegistroSelado }
  /** NÃO há gate: sem vínculo com a página não existe decisão autônoma. */
  | { decisao: 'sem-vinculo'; motivo: string }

export function decidirEMontarRegistro(args: {
  /** A medida, a identidade e a política — o que o produtor montou. A COPY não entra: é calculada aqui. */
  entrada: Omit<EntradaDoGate, 'copy'>
  page: PaginaParaDecisao
  /** O tipo do post que VAI nascer (ou do post relido). */
  vinculo: { projectId: number; generationId: string; postType: 'STORY' | 'POST' }
  origem: OrigemDoGate
  principal?: { tipo: string; id: string }
  agora: () => Date
}): DecisaoDoGate {
  const { entrada, page, vinculo } = args
  const semVinculo = (motivo: string): DecisaoDoGate => ({ decisao: 'sem-vinculo', motivo })
  const id = identidadeDaPagina(page)
  const medida = entrada.medida

  // 1. A medida é DESTAS camadas (o mesmo `estavel` de `versaoDaPagina`).
  const lidas = lerCamadas(page.layers)
  if (JSON.stringify(estavel(medida.camadas)) !== JSON.stringify(estavel(lidas.legivel ? lidas.camadas : []))) return semVinculo('as camadas da medida não são as camadas da página')
  // 2. A identidade que o produtor passou é a desta página, nas duas versões.
  if (entrada.identidade.pageVersion !== id.pageVersion || entrada.identidade.copyVersion !== id.copyVersion) return semVinculo('a identidade da entrada não é a identidade da página (pageVersion/copyVersion)')
  // 3. Formato e canvas da medida são os da página.
  if (medida.formato !== id.formato) return semVinculo(`a medida é do formato ${String(medida.formato)} e a página é ${String(id.formato)}`)
  if (medida.canvas.width !== page.width || medida.canvas.height !== page.height) return semVinculo(`a medida é de um canvas ${medida.canvas.width}×${medida.canvas.height} e a página tem ${page.width}×${page.height}`)
  // 4. Os dois classificadores concordam, e o tipo do post é o do formato (story → STORY, feed/quadrado → POST).
  if (id.formato === null || id.formato !== id.formatoDoCompositor) return semVinculo(`os classificadores de formato divergem para esta página: revisor ${String(id.formato)}, compositor ${id.formatoDoCompositor}`)
  if (TIPO_DO_POST_POR_FORMATO[id.formato] !== vinculo.postType) return semVinculo(`o post seria ${vinculo.postType}, mas o formato ${id.formato} pede ${TIPO_DO_POST_POR_FORMATO[id.formato]}`)

  // 5. A copy é reconciliada AQUI, da mesma leitura de `copyAutoral` e `layers` cujos hashes entram na identidade.
  const revisao = revisaoDaPaginaComCamadas(page.copyAutoral, page.layers, { autor: 'sistema', motivo: 'gate', superficie: args.origem })
  // Entrada EXPLÍCITA, campo a campo: uma `copy` extra em runtime nos args é ignorada.
  const { gate, relatorio } = gateDaMedida({ medida, identidade: entrada.identidade, politicaDoAssunto: entrada.politicaDoAssunto, copy: { estado: revisao.estado, lacunas: revisao.lacunas } })

  const registro: RegistroDoGate = {
    gate,
    politica: { estimado: entrada.politicaDoAssunto.estimado, semAssuntoLocalizavel: entrada.politicaDoAssunto.semAssuntoLocalizavel },
    identidade: { projectId: vinculo.projectId, generationId: vinculo.generationId, pageId: page.id, formato: id.formato, formatoDoCompositor: id.formatoDoCompositor, pageVersion: id.pageVersion, copyVersion: id.copyVersion },
    medidoEm: args.agora().toISOString(),
    origem: args.origem,
    ...(args.principal ? { principal: { tipo: args.principal.tipo, id: args.principal.id } } : {}),
  }
  Object.defineProperty(registro, SELO, { value: true, enumerable: false })
  congelar(registro)
  selados.add(registro)
  return { decisao: 'ok', gate, relatorio, registro: registro as RegistroSelado }
}

// ─────────────────────────────────────────────────────────────────────────
// Schema — espelho ESTRITO de `GateDaArte` (§ 3.4)
// ─────────────────────────────────────────────────────────────────────────

const regraCritica = z.enum(REGRAS_CRITICAS)
const regraOuConferencia = z.enum([...REGRAS_CRITICAS, ...CONFERENCIAS_DO_GATE])
const camadas = z.array(z.string())

const coberturaSchema = z.discriminatedUnion('estado', [
  z.object({ estado: z.literal('comprovada') }).strict(),
  z.object({ estado: z.literal('nao-se-aplica'), motivo: z.string() }).strict(),
  z.object({ estado: z.literal('nao-comprovada'), motivo: z.string() }).strict(),
  z.object({ estado: z.literal('reprovada'), achados: z.array(z.string()) }).strict(),
])
/** `nao-se-aplica` em copy-completa/identidade/oclusao nunca sai do CP5a (`gate.ts` só as marca comprovada ou não comprovada). */
const coberturaSemNaoSeAplica = z.discriminatedUnion('estado', [
  z.object({ estado: z.literal('comprovada') }).strict(),
  z.object({ estado: z.literal('nao-comprovada'), motivo: z.string() }).strict(),
])
/** EXATAMENTE as 11 críticas + 4 conferências (`.strict()`): entrada a mais ou a menos → inválido. */
const formaDaCobertura: Record<string, z.ZodTypeAny> = {
  ...Object.fromEntries(REGRAS_CRITICAS.map((r) => [r, coberturaSchema])),
  'piso-de-interface': coberturaSchema,
  'copy-completa': coberturaSemNaoSeAplica,
  identidade: coberturaSemNaoSeAplica,
  oclusao: coberturaSemNaoSeAplica,
}

export const gateDaArteSchema = z
  .object({
    versao: z.literal(VERSAO_DO_GATE),
    resultado: z.enum(['APTO', 'REVISAO_HUMANA_NECESSARIA']),
    rulesVersion: z.string().min(1),
    pageVersion: z.string().min(1).nullable(),
    copyVersion: z.string().min(1),
    cobertura: z.object(formaDaCobertura).strict(),
    motivos: z.array(z.object({ regra: regraOuConferencia, codigo: z.enum(['ACHADO_CRITICO', 'NAO_COMPROVADA', 'NAO_MEDIDO', 'IDENTIDADE_ILEGIVEL']), motivo: z.string(), camadas }).strict()),
    achados: z.array(z.object({ regra: regraCritica, camadas, id: z.string(), severidade: z.enum(['problema', 'aviso', 'sugestao']), certeza: z.enum(['medida', 'estimada']) }).strict()),
    // `naoMedidos[].regra` admite também as três de fora das críticas, como o tipo real (`gate.ts`).
    naoMedidos: z.array(z.object({ regra: z.enum([...REGRAS_CRITICAS, 'oclusao', 'geometria', 'piso-de-interface']), motivo: z.string(), camadas }).strict()),
    avisos: z.array(z.string()),
  })
  .strict()

const politicaSchema = z.object({ estimado: z.enum(['comprova', 'humano']), semAssuntoLocalizavel: z.enum(['nao-se-aplica', 'humano']) }).strict()

export const registroDoGateSchema = z
  .object({
    gate: gateDaArteSchema,
    politica: politicaSchema,
    identidade: z
      .object({
        projectId: z.number().int(),
        generationId: z.string().min(1),
        pageId: z.string().min(1),
        formato: z.enum(FORMATOS).nullable(),
        formatoDoCompositor: z.enum(FORMATOS),
        pageVersion: z.string().min(1).nullable(),
        copyVersion: z.string().min(1),
      })
      .strict(),
    medidoEm: z.string().datetime({ offset: true }),
    origem: z.enum(ORIGENS_DO_GATE),
    principal: z.object({ tipo: z.string(), id: z.string() }).strict().optional(),
  })
  .strict()

/**
 * Invariante 2.3 do contrato CP5a, inteira: `APTO` ⇔ `motivos` vazio ∧ `naoMedidos` vazio ∧ `achados` vazio ∧
 * nenhuma cobertura `reprovada`/`nao-comprovada` ∧ copy/identidade/oclusão `comprovada` ∧ piso `comprovada` ou
 * `nao-se-aplica` ∧ as 11 críticas `comprovada` ou `nao-se-aplica`. Devolve o que viola, ou `null`.
 */
export function violacaoDaInvarianteDoGate(gate: GateDaArte): string | null {
  const vazio = gate.motivos.length === 0 && gate.naoMedidos.length === 0
  if ((gate.resultado === 'APTO') !== vazio) return `resultado ${gate.resultado} com ${gate.motivos.length} motivo(s) e ${gate.naoMedidos.length} não medido(s)`
  if (gate.resultado !== 'APTO') return null
  if (gate.achados.length > 0) return 'APTO com achados'
  for (const regra of [...REGRAS_CRITICAS, ...CONFERENCIAS_DO_GATE]) {
    const c = gate.cobertura[regra]
    if (!c) return `APTO sem cobertura de ${regra}`
    if (c.estado === 'reprovada' || c.estado === 'nao-comprovada') return `APTO com ${regra} ${c.estado}`
    if (c.estado === 'nao-se-aplica' && (regra === 'copy-completa' || regra === 'identidade' || regra === 'oclusao')) return `APTO com ${regra} nao-se-aplica`
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// Leitura tolerante (§ 3.4)
// ─────────────────────────────────────────────────────────────────────────

export type LeituraDoRegistro =
  /** Sem a chave `gateDaArte`. */
  | { estado: 'ausente' }
  /** Chave presente, forma/invariante inválida ou versão de gate desconhecida. As versões só quando casam com o regex. */
  | { estado: 'invalido'; motivo: string; versaoGravada?: string; rulesVersionGravada?: string }
  | { estado: 'ok'; registro: RegistroDoGate }

/** Só uma versão curta e simples aparece como "versão gravada" (Codex R11): string arbitrária ou longa nunca sai. */
const VERSAO_EXIBIVEL = /^[a-z0-9][a-z0-9.-]{0,31}$/

function versoesGravadas(bruto: unknown): { versaoGravada?: string; rulesVersionGravada?: string } {
  const gate = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? (bruto as Record<string, unknown>).gate : null
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return {}
  const g = gate as Record<string, unknown>
  return {
    ...(typeof g.versao === 'string' && VERSAO_EXIBIVEL.test(g.versao) ? { versaoGravada: g.versao } : {}),
    ...(typeof g.rulesVersion === 'string' && VERSAO_EXIBIVEL.test(g.rulesVersion) ? { rulesVersionGravada: g.rulesVersion } : {}),
  }
}

/** Nunca lança; nunca expõe campos de um JSON rejeitado (só as versões, filtradas). */
export function lerGateDaArte(fieldValues: unknown): LeituraDoRegistro {
  if (!fieldValues || typeof fieldValues !== 'object' || Array.isArray(fieldValues) || !(CHAVE_DO_GATE in fieldValues)) return { estado: 'ausente' }
  const bruto = (fieldValues as Record<string, unknown>)[CHAVE_DO_GATE]
  if (bruto === undefined) return { estado: 'ausente' }
  const versoes = versoesGravadas(bruto)
  const lido = registroDoGateSchema.safeParse(bruto)
  if (!lido.success) {
    const gate = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>).gate : null
    const versaoDesconhecida = gate && typeof gate === 'object' && (gate as Record<string, unknown>).versao !== VERSAO_DO_GATE
    const primeira = lido.error.issues[0]
    // Só o CAMINHO do campo e o código do zod: a mensagem do zod pode citar o valor recebido (`invalid_enum_value`).
    const motivo = versaoDesconhecida ? `registro de versão anterior ou desconhecida do gate${versoes.versaoGravada ? `: ${versoes.versaoGravada}` : ''}` : `forma inválida${primeira ? ` em ${primeira.path.join('.') || '(raiz)'} (${primeira.code})` : ''}`
    return { estado: 'invalido', motivo, ...versoes }
  }
  const registro = lido.data as RegistroDoGate
  const violacao = violacaoDaInvarianteDoGate(registro.gate)
  if (violacao) return { estado: 'invalido', motivo: `invariante do gate violada: ${violacao}`, ...versoes }
  return { estado: 'ok', registro }
}

// ─────────────────────────────────────────────────────────────────────────
// Validade (§ 4.3)
// ─────────────────────────────────────────────────────────────────────────

export type DivergenciaDoGate = 'vinculo' | 'formato' | 'formatoDoCompositor' | 'pageVersion' | 'copyVersion' | 'rulesVersion' | 'versaoDoGate' | 'politica'

export type ValidadeDoGate =
  /** Metadados iguais — e a lista fixa do que NÃO foi conferido. */
  | { estado: 'coincidente'; naoConferido: readonly string[] }
  | { estado: 'historico'; divergencias: DivergenciaDoGate[] }
  /** `pageVersion` nulo de um lado, ou identidade ≠ gate nas versões. */
  | { estado: 'ilegivel'; motivo: string }

export interface IdentidadeAtual {
  projectId: number
  generationId: string
  pageId: string
  formato: Formato | null
  formatoDoCompositor: Formato
  pageVersion: string | null
  copyVersion: string
  /** `VERSAO_DAS_REGRAS` e `VERSAO_DO_GATE` de QUEM LÊ. */
  rulesVersion: string
  versaoDoGate: string
  /** Obrigatória: sem ela não há comparação (ver-geracao passa a RECOMENDADA, nomeada — 9.7/9.12). */
  politica: PoliticaDoAssunto
}

/**
 * Fail-closed. Só recebe o `registro` de uma leitura `ok`. NÃO devolve `resultado` (quem quiser lê
 * `registro.gate.resultado` DEPOIS de ver o estado) e não existe estado que signifique "o veredito ainda vale".
 * `medidoEm` e `principal` não entram.
 */
export function validadeDoGate(registro: RegistroDoGate, atual: IdentidadeAtual): ValidadeDoGate {
  const id = registro.identidade
  if (id.pageVersion === null) return { estado: 'ilegivel', motivo: 'o registro foi gravado com camadas ilegíveis (pageVersion nulo)' }
  if (atual.pageVersion === null) return { estado: 'ilegivel', motivo: 'as camadas da página de hoje são ilegíveis (pageVersion nulo)' }
  if (id.pageVersion !== registro.gate.pageVersion || id.copyVersion !== registro.gate.copyVersion) {
    return { estado: 'ilegivel', motivo: 'a identidade gravada difere das versões que o gate carrega: gate de uma medição com identidade de outra' }
  }
  const divergencias: DivergenciaDoGate[] = []
  if (id.projectId !== atual.projectId || id.generationId !== atual.generationId || id.pageId !== atual.pageId) divergencias.push('vinculo')
  if (id.formato !== atual.formato) divergencias.push('formato')
  if (id.formatoDoCompositor !== atual.formatoDoCompositor) divergencias.push('formatoDoCompositor')
  if (id.pageVersion !== atual.pageVersion) divergencias.push('pageVersion')
  if (id.copyVersion !== atual.copyVersion) divergencias.push('copyVersion')
  if (registro.gate.rulesVersion !== atual.rulesVersion) divergencias.push('rulesVersion')
  if (registro.gate.versao !== atual.versaoDoGate) divergencias.push('versaoDoGate')
  if (registro.politica.estimado !== atual.politica.estimado || registro.politica.semAssuntoLocalizavel !== atual.politica.semAssuntoLocalizavel) divergencias.push('politica')
  if (divergencias.length > 0) return { estado: 'historico', divergencias }
  return { estado: 'coincidente', naoConferido: NAO_CONFERIDO_PELA_IDENTIDADE }
}

// ─────────────────────────────────────────────────────────────────────────
// Serialização própria da impressão digital (§ 5, Codex R16)
// ─────────────────────────────────────────────────────────────────────────

/**
 * `JSON.stringify` grava `NaN`, `Infinity`, `-Infinity` e `null` como o mesmo `null`, e o corpus do gate (G21f) usa
 * esses valores de propósito. Aqui: `estavel` para a ordem das chaves (e `undefined` fora dos objetos), números não
 * finitos como `{ "$num": "NaN" | "Infinity" | "-Infinity" }`, `-0` como `{ "$num": "-0" }` e `undefined` dentro de
 * arrays como `{ "$undefined": true }`; o restante igual ao JSON. `versaoDaPagina` NÃO usa isto (é identidade, não
 * impressão).
 */
export function serializarParaImpressao(valor: unknown): string {
  const marcar = (v: unknown): unknown => {
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return { $num: 'NaN' }
      if (v === Infinity) return { $num: 'Infinity' }
      if (v === -Infinity) return { $num: '-Infinity' }
      if (Object.is(v, -0)) return { $num: '-0' }
      return v
    }
    if (Array.isArray(v)) return v.map((x) => (x === undefined ? { $undefined: true } : marcar(x)))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, marcar(x)]))
    return v
  }
  return JSON.stringify(marcar(estavel(valor)))
}
