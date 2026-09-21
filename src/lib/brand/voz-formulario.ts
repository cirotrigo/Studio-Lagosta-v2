/**
 * O FORMULÁRIO da voz compacta (módulo PURO, sem Prisma — a aba Marca é
 * client). Converte a `VozCompacta` do contrato para o que a equipe edita e
 * de volta, SEM validar: quem valida é `lerVoz`, na gravação — o formulário
 * nunca inventa nem descarta nada, e devolve `unknown` para o contrato dizer
 * o que está errado.
 *
 * 🔴 Listas e reescritas são campos ESTRUTURADOS (um item por campo), nunca
 * texto serializado por delimitador (PR14-01 da revisão do Codex, 12/09/2026):
 * "uma reescrita por linha, `antes → depois — motivo`" partia um `depois`
 * que carregasse travessão, juntava exemplos com quebra interna e tirava um
 * marcador literal "- " no começo do item — campos que a pessoa NÃO editou
 * saíam mudados ao salvar, e a consulta seguinte do conector recebia conteúdo
 * corrompido. O valor de cada item viaja LITERAL; só o espaço das pontas sai.
 */
import { VERSAO_DA_VOZ, type EscopoDaRegra, type RegraDaVoz, type VozCompacta } from './voz'

export interface RegraNoFormulario {
  id: string
  texto: string
  motivo: string
  em: string
  escopo: EscopoDaRegra
  substitui?: string
  ativa: boolean
}

export interface ReescritaNoFormulario {
  antes: string
  depois: string
  motivo: string
}

export interface FormularioDaVoz {
  descricao: string
  tratamento: string
  /** Um item por campo, literal. */
  exemplos: string[]
  antesDepois: ReescritaNoFormulario[]
  termos: string[]
  proibicoes: string[]
  regras: RegraNoFormulario[]
}

export const FORMULARIO_VAZIO: FormularioDaVoz = { descricao: '', tratamento: '', exemplos: [], antesDepois: [], termos: [], proibicoes: [], regras: [] }

export const REESCRITA_VAZIA: ReescritaNoFormulario = { antes: '', depois: '', motivo: '' }

/** Só o espaço das pontas sai; o miolo (quebra, travessão, marcador) é conteúdo. Item vazio sai da lista. */
function itensLimpos(itens: string[]): string[] {
  return itens.map((i) => i.trim()).filter((i) => i.length > 0)
}

export function vozParaFormulario(voz: VozCompacta | null | undefined): FormularioDaVoz {
  if (!voz) return { ...FORMULARIO_VAZIO, exemplos: [], antesDepois: [], termos: [], proibicoes: [], regras: [] }
  return {
    descricao: voz.descricao ?? '',
    tratamento: voz.tratamento ?? '',
    exemplos: [...(voz.exemplos ?? [])],
    antesDepois: (voz.antesDepois ?? []).map((r) => ({ antes: r.antes ?? '', depois: r.depois ?? '', motivo: r.motivo ?? '' })),
    termos: [...(voz.termos ?? [])],
    proibicoes: [...(voz.proibicoes ?? [])],
    regras: (voz.regras ?? []).map((r) => ({ id: r.id, texto: r.texto, motivo: r.motivo, em: r.em, escopo: r.escopo ?? 'ambas', ...(r.substitui ? { substitui: r.substitui } : {}), ativa: r.ativa !== false })),
  }
}

/**
 * O objeto que vai para `lerVoz`/`gravarVoz`. Campo vazio vira AUSENTE (o
 * contrato tem `default([])`), nunca `""` — `tratamento` vazio sai; regra sem
 * `substitui` não carrega a chave. Reescrita totalmente em branco sai da
 * lista; reescrita pela metade FICA (o contrato recusa e a pessoa vê onde).
 */
export function formularioParaVoz(form: FormularioDaVoz): unknown {
  // `id`, `substitui` e `em` viajam LITERAIS (PR14-13): o contrato aceita id com
  // espaço nas pontas, e aparar o id sem aparar a referência quebrava o vínculo
  // — a voz deixava de salvar por uma edição só na descrição. Só texto e motivo
  // perdem o espaço das pontas.
  const regras = form.regras.map((r) => {
    const regra: Record<string, unknown> = { id: r.id, texto: r.texto.trim(), motivo: r.motivo.trim(), em: r.em, escopo: r.escopo, ativa: r.ativa }
    if (r.substitui) regra.substitui = r.substitui
    return regra
  })
  const antesDepois = form.antesDepois
    .map((r) => ({ antes: r.antes.trim(), depois: r.depois.trim(), motivo: r.motivo.trim() }))
    .filter((r) => r.antes || r.depois || r.motivo)
  return {
    versao: VERSAO_DA_VOZ,
    descricao: form.descricao.trim(),
    ...(form.tratamento.trim() ? { tratamento: form.tratamento.trim() } : {}),
    exemplos: itensLimpos(form.exemplos),
    antesDepois,
    termos: itensLimpos(form.termos),
    proibicoes: itensLimpos(form.proibicoes),
    regras,
  }
}

/** Uma regra nova em branco para a lista, datada de hoje (Brasília) e com id provisório único no formulário. */
export function regraEmBranco(regrasExistentes: RegraNoFormulario[], hoje: string): RegraNoFormulario {
  const base = `regra-${hoje}`
  let n = 1
  const ids = new Set(regrasExistentes.map((r) => r.id))
  while (ids.has(`${base}-${n}`)) n++
  return { id: `${base}-${n}`, texto: '', motivo: '', em: hoje, escopo: 'ambas', ativa: true }
}

/**
 * SUBSTITUIR uma regra pelo formulário: a antiga fica inativa (histórico) e a
 * nova nasce apontando para ela — a mesma semântica de `aplicarRegraNaVoz`,
 * só que sem o detector de conflito (a pessoa está decidindo à vista).
 */
export function substituirRegraNoFormulario(regras: RegraNoFormulario[], idAntiga: string, nova: Omit<RegraNoFormulario, 'id' | 'substitui' | 'ativa'>): RegraNoFormulario[] {
  const antiga = regras.find((r) => r.id === idAntiga)
  if (!antiga || !antiga.ativa) return regras
  const id = regraEmBranco(regras, nova.em).id
  return [...regras.map((r) => (r.id === idAntiga ? { ...r, ativa: false } : r)), { ...nova, id, substitui: idAntiga, ativa: true }]
}

/** A regra que substitui esta DIRETAMENTE (o elo seguinte da cadeia, ativa ou não). */
export function substituidaPor(regras: RegraNoFormulario[], id: string): RegraNoFormulario | null {
  return regras.find((r) => r.substitui === id) ?? null
}

/**
 * A SUCESSORA ATIVA no fim da cadeia A → B → C (PR14-06): "voltar ao texto de
 * A" é uma substituição da regra que vale HOJE, e ela pode estar dois elos
 * adiante. Cadeia interrompida (a última também inativa) devolve null.
 */
export function sucessoraAtiva(regras: RegraNoFormulario[], id: string): RegraNoFormulario | null {
  const vistos = new Set<string>([id])
  let atual = substituidaPor(regras, id)
  while (atual) {
    if (atual.ativa) return atual
    if (vistos.has(atual.id)) return null
    vistos.add(atual.id)
    atual = substituidaPor(regras, atual.id)
  }
  return null
}

/**
 * Uma regra pode ser REMOVIDA do formulário (não só desativada) quando ainda
 * não foi gravada (não está na base lida do servidor) e nenhuma outra a
 * referencia (PR14-05): a regra nova em branco que a pessoa abandonou ficava
 * na lista e o contrato — que exige texto e motivo também nas inativas —
 * impedia salvar o resto da edição. Regra já gravada é histórico: desativa.
 */
export function podeRemoverRegra(regras: RegraNoFormulario[], id: string, idsGravados: Iterable<string>): boolean {
  if (new Set(idsGravados).has(id)) return false
  if (!regras.some((r) => r.id === id)) return false
  return !regras.some((r) => r.substitui === id)
}

export function removerRegraNoFormulario(regras: RegraNoFormulario[], id: string, idsGravados: Iterable<string>): RegraNoFormulario[] {
  if (!podeRemoverRegra(regras, id, idsGravados)) return regras
  return regras.filter((r) => r.id !== id)
}

/**
 * Uma regra inativa só pode ser REATIVADA se nenhuma outra a substitui: com a
 * substituição no lugar, `problemasDeCoerenciaDaVoz` recusa a voz ("a
 * substituída continua ativa") e a tela oferecia uma operação que não podia
 * ser salva (PR14-03). Regra apenas DESATIVADA (sem substituta) volta.
 */
export function podeReativar(regras: RegraNoFormulario[], id: string): boolean {
  const regra = regras.find((r) => r.id === id)
  if (!regra || regra.ativa) return false
  return substituidaPor(regras, id) === null
}

export function reativarRegraNoFormulario(regras: RegraNoFormulario[], id: string): RegraNoFormulario[] {
  if (!podeReativar(regras, id)) return regras
  return regras.map((r) => (r.id === id ? { ...r, ativa: true } : r))
}

/** O mesmo formulário duas vezes é o mesmo conteúdo? (para o botão Salvar só acender quando há mudança) */
export function formulariosIguais(a: FormularioDaVoz, b: FormularioDaVoz): boolean {
  return JSON.stringify(formularioParaVoz(a)) === JSON.stringify(formularioParaVoz(b))
}

/** O estado da tela "Como a marca fala": o que se edita, a base que o servidor confirmou e a versão lida (o CAS). */
export interface EstadoDaVozNaTela {
  form: FormularioDaVoz
  base: FormularioDaVoz
  versaoLida: number | null
  /** O servidor tem uma versão que não é a que este formulário partiu, e há edição local não salva. */
  divergente: number | null
}

export const ESTADO_INICIAL_DA_VOZ: EstadoDaVozNaTela = { form: FORMULARIO_VAZIO, base: FORMULARIO_VAZIO, versaoLida: null, divergente: null }

/**
 * O registro do servidor como a tela o compara. Leitura que CONFIRMOU ausência
 * vira versão 0 (o serviço aceita): se outra pessoa criou a v1 no meio, o
 * conflito volta como VOZ_DIVERGENTE e cai no caminho tratado — com null vinha
 * VOZ_VERSAO_OBRIGATORIA sem saída (PR14-09).
 */
export function registroParaFormulario(registro: { versao: number; voz: VozCompacta | null } | null | undefined): { form: FormularioDaVoz; versao: number } {
  return { form: vozParaFormulario(registro?.voz ?? null), versao: registro?.versao ?? 0 }
}

/** O registro da voz como a CONSULTA da aba o carrega (o que `lerVozDaMarca` devolve em `registro`). */
export interface RegistroNaConsulta {
  versao: number
  voz: VozCompacta | null
  problemas: Array<{ caminho: string; mensagem: string }>
  migradaEm: string | null
  dnaArquivado: unknown
  atualizadaEm: string
}

/**
 * O RECIBO da gravação aplicado ao registro que a consulta tinha — o caminho
 * de quando a releitura complementar falhou DEPOIS de a escrita ser
 * confirmada (PR14-16).
 *
 * 🔴 Não devolver `null` aqui: `registroParaFormulario(null)` é versão 0 com
 * formulário VAZIO, e sem edição local a tela adotaria isso — apagando na
 * tela a voz que o servidor acabou de aceitar. "Não consegui reler" nunca
 * pode ser lido como "não há voz".
 *
 * `migradaEm` e `dnaArquivado` vêm do que a consulta já tinha porque
 * `gravarVoz` não toca neles: ela escreve `voz` e `versao`, e só. Os
 * problemas são `[]` porque só se grava voz que passou no contrato.
 */
export function registroComRecibo(
  anterior: RegistroNaConsulta | null | undefined,
  gravada: { versao: number; voz: VozCompacta },
  agora: Date = new Date(),
): RegistroNaConsulta {
  return {
    versao: gravada.versao,
    voz: gravada.voz,
    problemas: [],
    migradaEm: anterior?.migradaEm ?? null,
    dnaArquivado: anterior?.dnaArquivado ?? null,
    atualizadaEm: agora.toISOString(),
  }
}

/**
 * O que chega do servidor — a releitura OU a resposta da própria gravação
 * (PR14-15) — aplicado ao estado da tela, sem nunca apagar edição local não
 * salva (PR14-02): sem edição local, adota o servidor; se o que chegou é o
 * NOSSO salvamento, a base e a versão avançam e o rascunho posterior fica; se
 * nada mudou lá, só a versão se confirma; se OUTRA pessoa salvou por baixo,
 * marca a divergência e a pessoa decide. A substituição de regra em andamento
 * conta como edição local (PR14-12).
 */
export function reconciliarComServidor(
  e: EstadoDaVozNaTela,
  servidor: { form: FormularioDaVoz; versao: number | null },
  pendente: { enviado: FormularioDaVoz | null; substituindo: boolean },
): EstadoDaVozNaTela {
  const semEdicaoLocal = formulariosIguais(e.form, e.base) && !pendente.substituindo
  if (semEdicaoLocal) return { form: servidor.form, base: servidor.form, versaoLida: servidor.versao, divergente: null }
  if (pendente.enviado && formulariosIguais(servidor.form, pendente.enviado)) return { ...e, base: servidor.form, versaoLida: servidor.versao, divergente: null }
  if (formulariosIguais(servidor.form, e.base)) return { ...e, versaoLida: servidor.versao, divergente: null }
  return { ...e, divergente: servidor.versao }
}

export type { RegraDaVoz }
