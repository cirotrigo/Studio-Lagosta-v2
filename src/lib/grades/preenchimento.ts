/**
 * G2 · preencher células de grade (puro: sem React, DOM, banco, rede ou env). Foto em célula só pelo
 * `preencherCelula` do G0 (cover escrito, recorte limpo, URL só do Blob próprio); coerência pelo `conferirGrade`;
 * ordem de leitura pela geometria (`ordemDeLeitura`). Nada de regra de foto ou geometria refeita aqui.
 *
 * O ALVO é decidido antes de qualquer upload, download ou geração (`planoDePreenchimento`) e carrega a ASSINATURA da
 * grade: todos os membros inteiros, menos a `order`. Quando as fotos voltam, `preencherNoDesign` roda sobre o estado
 * atual (dentro do updater do editor): assinatura diferente — recorte, foto, geometria, metadado de QUALQUER membro,
 * membro a mais ou a menos — ⇒ nada aplicado. Senão aplica as fotos válidas nas células previstas, num estado só;
 * a que falhou fica como estava e vai para a lista. Nenhuma foto existente é apagada por falha.
 */
import type { DesignData, Layer } from '@/types/template'
import { paginaEVideo } from '@/lib/video/camadas-de-video'
import { celulaVazia, conferirGrade, metadadoDeGrade, urlAceita } from './conferir'
import { ordemDeLeitura } from './geometria'
import { preencherCelula } from './operacoes'

/**
 * Fotos por lote: até 6. Os 14 layouts da pesquisa cabem num lote; as quadradas de 20/28 células (Q2) se preenchem em
 * vários, na próxima vazia em ordem de leitura. A rota do Drive aceita 10; o limite dela não muda.
 */
export const LIMITE_DO_LOTE = 6

export type CodigoDoPreenchimento =
  | 'SEM_GRADE'
  | 'PAGINA_DE_VIDEO'
  | 'GRADE_INCOERENTE'
  | 'GRADE_GIRADA'
  | 'GRADE_CHEIA'
  | 'LOTE_INVALIDO'
  | 'ALVO_MUDOU'
  | 'NADA_APLICADO'
  | 'CANCELADO'
  | 'EM_ANDAMENTO'

export interface AlvoDePreenchimento {
  gradeId: string
  /** ids das células, na ordem das fotos */
  celulas: string[]
  assinatura: string
  /** O editor prende aqui página, documento e geração da carga do instante do plano (este módulo não lê) */
  chave?: { pagina: string | null; documento: string; geracao: number }
}

export type PlanoDePreenchimento =
  | { tipo: 'grade'; modo: 'proxima' | 'substituir' | 'lote'; alvo: AlvoDePreenchimento }
  /** `gradeCheia`: a avulsa vem de uma grade sem vaga e entra SEM o desvio de clipe (o "+" armado fica); sem a marca, legado */
  | { tipo: 'avulsa'; aviso?: string; gradeCheia?: true }
  | { tipo: 'recusa'; codigo: CodigoDoPreenchimento; mensagem: string }

export interface FotoParaCelula {
  celulaId: string
  nome: string
  url: string
  /** dimensão natural conferida pela URL EXATA (`dimensoesDaFotoCarregada`) */
  natural: { width: number; height: number }
}

export interface FalhaDaFoto {
  celulaId: string
  nome: string
  motivo: string
}

export type DesfechoDoPreenchimento =
  | { ok: true; aplicadas: string[]; falhas: FalhaDaFoto[]; layers: Layer[]; codigo?: undefined; mensagem?: undefined }
  | { ok: false; codigo: CodigoDoPreenchimento; mensagem: string; falhas: FalhaDaFoto[]; aplicadas?: undefined; layers?: undefined }

export const MENSAGEM_ALVO_MUDOU =
  'A grade ou a página mudou enquanto as fotos chegavam: nada foi aplicado e as suas edições ficaram. Tente de novo.'
export const MENSAGEM_GRADE_CHEIA = 'A grade está cheia: a foto entrou avulsa. Para trocar uma foto, selecione a célula.'

export const recusaDoPreenchimento = (codigo: CodigoDoPreenchimento, mensagem: string, falhas: FalhaDaFoto[] = []): DesfechoDoPreenchimento => ({
  ok: false,
  codigo,
  mensagem,
  falhas,
})
const recusa = (codigo: CodigoDoPreenchimento, mensagem: string): PlanoDePreenchimento => ({ tipo: 'recusa', codigo, mensagem })

const idDaGrade = (c: Layer) => {
  const id = metadadoDeGrade(c)?.id
  return typeof id === 'string' && id ? id : undefined
}

export const membrosDaGrade = (layers: readonly Layer[], gradeId: string) => layers.filter((c) => idDaGrade(c) === gradeId)

/** A grade que a seleção aponta: inteira (todas as células e nada mais) ou uma célula só; senão `null` */
export function gradeDaSelecao(layers: readonly Layer[], selecionadas: readonly string[]): { gradeId: string; celulaId?: string } | null {
  const escolhidas = layers.filter((c) => selecionadas.includes(c.id))
  if (escolhidas.length === 0 || escolhidas.length !== new Set(selecionadas).size) return null
  const gradeId = idDaGrade(escolhidas[0])
  if (!gradeId || escolhidas.some((c) => idDaGrade(c) !== gradeId)) return null
  if (escolhidas.length === 1) return { gradeId, celulaId: escolhidas[0].id }
  return membrosDaGrade(layers, gradeId).length === escolhidas.length ? { gradeId } : null
}

/** Células vazias da grade, de cima para baixo e da esquerda para a direita (pela geometria) */
export function vaziasEmLeitura(layers: readonly Layer[], gradeId: string): string[] {
  const membros = membrosDaGrade(layers, gradeId)
  return ordemDeLeitura(membros.map((c) => c.position))
    .map((i) => membros[i])
    .filter((c) => celulaVazia(c.fileUrl))
    .map((c) => c.id)
}

/** Todos os membros, por id, inteiros menos a `order` (que muda quando OUTRA camada entra ou sai) */
export function assinaturaDaGrade(layers: readonly Layer[], gradeId: string): string {
  const membros = membrosDaGrade(layers, gradeId)
    .map((c) => ({ ...c, order: undefined }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return JSON.stringify(membros)
}

/** Grade em que a foto não pode entrar (página de vídeo, célula girada, geometria/metadado quebrados) */
function impedimentoDaGrade(design: DesignData, gradeId: string): PlanoDePreenchimento | undefined {
  if (paginaEVideo(design.layers, design.audio)) return recusa('PAGINA_DE_VIDEO', 'Página de vídeo: fotos não entram em célula de grade.')
  const diag = conferirGrade(membrosDaGrade(design.layers, gradeId))
  if (diag.some((d) => d.codigo === 'GRADE_GIRADA')) return recusa('GRADE_GIRADA', 'Célula girada: desvincule da grade antes de trocar a foto.')
  if (diag.length) return recusa('GRADE_INCOERENTE', `A grade está quebrada (${diag[0].mensagem}): a foto não entra em célula.`)
  return undefined
}

/**
 * Onde a(s) foto(s) entram, decidido sobre a seleção e o design DESTE instante. `'uma'` = foto única: grade inteira
 * ⇒ próxima célula vazia; célula ⇒ substitui a dela; grade cheia ⇒ avulsa com aviso; sem grade ⇒ avulsa de sempre.
 * Número = lote para a grade inteira, nas células vazias em ordem de leitura; o lote nunca vira avulsa.
 */
export function planoDePreenchimento(design: DesignData, selecionadas: readonly string[], quantas: 'uma' | number): PlanoDePreenchimento {
  const sel = gradeDaSelecao(design.layers, selecionadas)
  const lote = quantas !== 'uma'
  if (!sel) return lote ? recusa('SEM_GRADE', 'Selecione a grade inteira (um clique nela) para preencher várias células.') : { tipo: 'avulsa' }
  if (lote && sel.celulaId) return recusa('SEM_GRADE', 'Selecione a grade inteira (um clique nela) para preencher várias células.')
  const impedimento = impedimentoDaGrade(design, sel.gradeId)
  if (impedimento) return impedimento

  const assinatura = assinaturaDaGrade(design.layers, sel.gradeId)
  if (sel.celulaId) return { tipo: 'grade', modo: 'substituir', alvo: { gradeId: sel.gradeId, celulas: [sel.celulaId], assinatura } }
  const vazias = vaziasEmLeitura(design.layers, sel.gradeId)
  if (!lote) {
    return vazias.length
      ? { tipo: 'grade', modo: 'proxima', alvo: { gradeId: sel.gradeId, celulas: [vazias[0]], assinatura } }
      : { tipo: 'avulsa', aviso: MENSAGEM_GRADE_CHEIA, gradeCheia: true }
  }
  if (vazias.length === 0) return recusa('GRADE_CHEIA', 'A grade está cheia: selecione uma célula para trocar a foto dela.')
  if (!Number.isInteger(quantas) || quantas < 1 || quantas > Math.min(LIMITE_DO_LOTE, vazias.length)) {
    return recusa('LOTE_INVALIDO', `Escolha de 1 a ${Math.min(LIMITE_DO_LOTE, vazias.length)} fotos: a grade tem ${vazias.length} ${vazias.length === 1 ? 'célula vazia' : 'células vazias'}.`)
  }
  return { tipo: 'grade', modo: 'lote', alvo: { gradeId: sel.gradeId, celulas: vazias.slice(0, quantas), assinatura } }
}

/** A avulsa da grade cheia: imagem comum, sem metadado (grade, grupo, vínculos) nem clipe herdados. Entrada não mutada. */
export function fotoAvulsaLimpa(camada: Layer): Layer {
  const { metadata: _metadata, clipe: _clipe, ...resto } = camada as Layer & { clipe?: unknown }
  void _metadata
  void _clipe
  return { ...resto, type: 'image' }
}

/** Por que a URL não serve para célula (`undefined` = serve): só https do Blob próprio, nunca data:, blob: ou lh3 */
export const motivoDaUrl = (url: unknown): string | undefined =>
  urlAceita(url) ? undefined : 'a foto não veio do armazenamento do Studio (link do Drive, data: ou blob: não entram em célula)'

/**
 * Resposta do `POST /api/google-drive-download` (200 pode ser parcial) mapeada POR `file.id` para a célula pedida,
 * nunca pela posição. Id desconhecido ou ausente é ignorado; id repetido ou `url` que não é texto vira falha da célula;
 * célula sem arquivo na resposta também. A URL em si é validada à parte (`motivoDaUrl`), igual para toda origem.
 */
export function mapearRespostaDoDrive(
  pedidos: ReadonlyArray<{ celulaId: string; driveId: string }>,
  resposta: unknown,
): Map<string, { url: string } | { motivo: string }> {
  const files = (resposta as { files?: unknown } | null)?.files
  const porId = new Map<string, unknown[]>()
  if (Array.isArray(files)) {
    for (const f of files) {
      const id = (f as { id?: unknown } | null)?.id
      if (typeof id === 'string') porId.set(id, [...(porId.get(id) ?? []), (f as { url?: unknown }).url])
    }
  }
  const saida = new Map<string, { url: string } | { motivo: string }>()
  for (const p of pedidos) {
    const urls = porId.get(p.driveId) ?? []
    saida.set(
      p.celulaId,
      urls.length === 1 && typeof urls[0] === 'string'
        ? { url: urls[0] }
        : { motivo: urls.length === 0 ? 'não veio do Drive' : 'resposta do Drive ambígua para esta foto' },
    )
  }
  return saida
}

const naturalValido = (n: FotoParaCelula['natural'] | undefined) =>
  !!n && Number.isFinite(n.width) && Number.isFinite(n.height) && n.width > 0 && n.height > 0

/**
 * Aplica `fotos` nas células do `alvo` sobre ESTE design (o estado atual). Recusa inteira: página de vídeo, assinatura
 * diferente da do plano (ALVO_MUDOU), foto para célula fora do alvo ou repetida (LOTE_INVALIDO), nenhuma foto válida
 * (NADA_APLICADO). Senão: as válidas nas suas células; inválidas e ausentes viram falha e a célula fica como estava.
 * `falhas` (as que já falharam antes, no download/upload/medida) seguem junto, na ordem do alvo. Entrada não mutada.
 */
export function preencherNoDesign(
  design: DesignData,
  alvo: AlvoDePreenchimento,
  fotos: ReadonlyArray<FotoParaCelula>,
  falhas: ReadonlyArray<FalhaDaFoto> = [],
): DesfechoDoPreenchimento {
  const antes = [...falhas]
  if (paginaEVideo(design.layers, design.audio)) return recusaDoPreenchimento('PAGINA_DE_VIDEO', 'A página virou vídeo: nada foi aplicado na grade.', antes)
  if (assinaturaDaGrade(design.layers, alvo.gradeId) !== alvo.assinatura || alvo.celulas.length === 0) {
    return recusaDoPreenchimento('ALVO_MUDOU', MENSAGEM_ALVO_MUDOU, antes)
  }
  const porCelula = new Map<string, FotoParaCelula>()
  for (const f of fotos) {
    if (!alvo.celulas.includes(f.celulaId) || porCelula.has(f.celulaId)) return recusaDoPreenchimento('LOTE_INVALIDO', 'Lote com foto para célula fora do alvo ou repetida.', antes)
    porCelula.set(f.celulaId, f)
  }

  const novas = new Map<string, Layer>()
  const lista: FalhaDaFoto[] = []
  for (const celulaId of alvo.celulas) {
    const declarada = antes.filter((x) => x.celulaId === celulaId)
    const foto = porCelula.get(celulaId)
    const camada = design.layers.find((c) => c.id === celulaId)!
    if (!foto) {
      lista.push(...(declarada.length ? declarada : [{ celulaId, nome: '', motivo: 'nenhuma foto chegou para esta célula' }]))
      continue
    }
    lista.push(...declarada)
    if (!naturalValido(foto.natural)) {
      lista.push({ celulaId, nome: foto.nome, motivo: 'não foi possível medir a foto' })
      continue
    }
    const r = preencherCelula(camada, foto.url)
    if (r.ok) novas.set(celulaId, r.valor)
    else lista.push({ celulaId, nome: foto.nome, motivo: motivoDaUrl(foto.url) ?? r.diagnosticos[0]?.mensagem ?? 'recusada pela grade' })
  }
  lista.push(...antes.filter((x) => !alvo.celulas.includes(x.celulaId)))
  if (novas.size === 0) return recusaDoPreenchimento('NADA_APLICADO', 'Nenhuma foto entrou na grade.', lista)

  const layers = design.layers.map((c) => novas.get(c.id) ?? c)
  const diag = conferirGrade(membrosDaGrade(layers, alvo.gradeId))
  if (diag.length) return recusaDoPreenchimento('GRADE_INCOERENTE', `A grade ficaria quebrada (${diag[0].mensagem}): nada foi aplicado.`, lista)
  return { ok: true, aplicadas: alvo.celulas.filter((id) => novas.has(id)), falhas: lista, layers }
}

/** O que dizer à pessoa: quantas entraram e as que não entraram, pelo nome */
export function mensagemDoDesfecho(d: DesfechoDoPreenchimento): { texto: string; erro: boolean } {
  const nomes = d.falhas.map((f) => `${f.nome || 'foto'} (${f.motivo})`).join('; ')
  if (!d.ok) return { texto: nomes && d.codigo === 'NADA_APLICADO' ? `${d.mensagem} Não entraram: ${nomes}.` : d.mensagem, erro: true }
  const n = d.aplicadas.length
  const feito = n === 1 ? 'Foto aplicada na grade.' : `${n} fotos aplicadas na grade.`
  return { texto: nomes ? `${feito} Não entraram: ${nomes}.` : feito, erro: false }
}
