/**
 * O FUNDO EFETIVO da peça (T4-E, 24/10/2026) — UMA conta para o compor (camadas, contraste, prova, persistência), o
 * medir-copy e a página que a rota de Layouts grava: o que se mede é o que se desenha e o que se reabre.
 *
 * Sem arquétipo, ou com arquétipo de foto: o fundo liso de sempre (`numeros.fundo`). Arquétipo `liso-claro` (família
 * E, sem foto): o `numeros.fundoClaro` da marca — e a marca que não o tem (ou tem um que não é claro) é RECUSADA, nunca
 * composta no fundo escuro com cara de E. Puro: sem banco, sem render.
 *
 * Arquétipo `foto-em-caixa` (#8, 24/10/2026): a foto mora numa caixa e o texto no liso. O fundo é o PAPEL da marca
 * (escuro ou claro) que atende, pela régua, as tintas que a peça realmente desenha (`tintasAtivas` + `papelDoBloco`),
 * escolhido DEPOIS da preparação dos blocos — `fundoDaPeca` não é chamado nele.
 */
import type { Layer, RichTextStyle } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { alvoPorContraste, luminanciaRelativa } from '@/lib/creatives/halo/halo'
import { flattenRichTextStyles } from '@/lib/rich-text-styles'
import { alvoClaroPorContraste, luzMedida, polaridadeDoTexto } from '../regua'
import { chaveDoArquetipo, type ArquetipoDeLayout, type FormatoDoArquetipo } from './tipos'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/**
 * "Claro" é identidade do arquétipo, não sugestão: luminância relativa ≥ 0,5 (o cinza #BCBCBC, ~0,50). Teto técnico
 * desta fase — ponytail: limiar fixo; vira número da assinatura se uma marca real precisar de outro.
 */
export const LUMINANCIA_MINIMA_DO_CLARO = 0.5

export const semFoto = (definicao: Pick<ArquetipoDeLayout, 'fundo'> | null | undefined) => definicao?.fundo === 'liso-claro'

/** O texto pousa no LISO (nenhum texto sobre foto): o sem foto (#15/#16) e a foto em caixa (#8). */
export const textoNoLiso = (definicao: Pick<ArquetipoDeLayout, 'fundo'> | null | undefined) => definicao?.fundo === 'liso-claro' || definicao?.fundo === 'foto-em-caixa'

/** A caixa da foto do `foto-em-caixa`, em px da peça; `null` nos outros fundos. */
export function caixaDaFoto(definicao: ArquetipoDeLayout | null | undefined, formato: FormatoDoArquetipo, canvas: { width: number; height: number }): { x: number; y: number; width: number; height: number } | null {
  const c = definicao?.fundo === 'foto-em-caixa' ? definicao.formatos[formato]?.foto : undefined
  return c ? { x: c.x * canvas.width, y: c.y * canvas.height, width: Math.round(c.w * canvas.width), height: Math.round(c.h * canvas.height) } : null
}

/**
 * A luz da foto que escolhe entre as variantes `clara`/`escura`: no texto no liso ela não diz nada (o texto não pousa na
 * foto) e sai da escolha. A IDENTIDADE da foto continua na chave da peça (`chaveDaPeca`) — só o ±2 da luz some.
 */
export const luzParaAVariante = (definicao: Pick<ArquetipoDeLayout, 'fundo'> | null | undefined, luz: number | null): number | null => (textoNoLiso(definicao) ? null : luz)

const ehClaro = (cor: string | null | undefined): cor is string => !!cor && HEX.test(cor) && luminanciaRelativa(cor) >= LUMINANCIA_MINIMA_DO_CLARO

/**
 * `congelado` (rodada 1) só vem da RECOMPOSIÇÃO: o `Page.background` da página existente. Na peça sem foto ele vence a
 * marca de hoje (a troca de paleta não se propaga sozinha, e o PNG novo sai no fundo da página que ele representa) —
 * e é conferido do mesmo jeito: ausente ou não-claro é recusa, nunca o claro atual da marca no lugar.
 */
export function fundoDaPeca(definicao: ArquetipoDeLayout | null | undefined, numeros: { fundo: string; fundoClaro?: string }, congelado?: string | null): string {
  if (!semFoto(definicao)) return numeros.fundo
  if (congelado !== undefined) {
    if (ehClaro(congelado)) return congelado
    throw new CreativeError(
      'ARQUETIPO_FUNDO_INDISPONIVEL',
      `${chaveDoArquetipo(definicao!)} é sem foto, e a página gravada ${congelado ? `tem o fundo "${congelado}", que não é claro (ou não é cor hex)` : 'não tem fundo'}. A recomposição usa o fundo da página (nunca o claro de hoje da marca no lugar dele): nada foi desenhado nem gravado.`,
      422,
      { arquetipo: chaveDoArquetipo(definicao!), origem: 'pagina', fundoDaPagina: congelado ?? null, luminanciaMinima: LUMINANCIA_MINIMA_DO_CLARO },
    )
  }
  const claro = numeros.fundoClaro
  if (!ehClaro(claro)) {
    throw new CreativeError(
      'ARQUETIPO_FUNDO_INDISPONIVEL',
      `${chaveDoArquetipo(definicao!)} é sem foto, de fundo liso CLARO, e a marca ${claro ? `tem fundo claro "${claro}", que não é claro (ou não é cor hex)` : 'não define o fundo claro (Project.assinatura.fundoClaro)'}. Nada foi composto no fundo escuro no lugar dele: defina o fundo claro da marca ou escolha um layout com foto.`,
      422,
      { arquetipo: chaveDoArquetipo(definicao!), origem: 'marca', fundoClaro: claro ?? null, luminanciaMinima: LUMINANCIA_MINIMA_DO_CLARO },
    )
  }
  return claro
}

/** Uma tinta que a peça DESENHA: um segmento efetivo de uma camada de texto com ao menos um glifo visível. */
export interface TintaAtiva {
  camada: string
  inicio: number
  fim: number
  cor: string
  origem: 'base' | 'trecho'
}

/** Espaço, quebra e caracteres de largura zero não desenham glifo. */
const DESENHA = /[^\s\u200B-\u200D\u2060\uFEFF]/

/**
 * As tintas que as camadas preparadas realmente desenham — a voz 2 que a preparação CRIOU, o estilo do arranjo e o
 * destaque EFETIVO (com a alternativa), nunca a cor configurada que não vira glifo. Os segmentos seguem o renderer
 * (`render-engine.ts`, "1. Segmentos"): `flattenRichTextStyles` normaliza (recorte, vazios, sobreposição pelo último);
 * as lacunas ficam na base (`style.color ?? '#000000'`) e o trecho herda `fill ?? base`. ponytail: essa regra curta de
 * lacuna e herança é repetida aqui (o renderer não a expõe como helper); os testes de `divisao-8` a travam.
 */
export function tintasAtivas(montados: ReadonlyArray<{ layer: Pick<Layer, 'id' | 'type' | 'content' | 'style' | 'richTextStyles'> }>): TintaAtiva[] {
  return montados.flatMap(({ layer }) => {
    const content = String(layer.content ?? '')
    const base = String(layer.style?.color ?? '#000000')
    const flat = layer.type === 'rich-text' ? flattenRichTextStyles(content.length, (layer.richTextStyles ?? []) as RichTextStyle[]) : []
    const segmentos: Array<Omit<TintaAtiva, 'camada'>> = []
    let cursor = 0
    for (const rich of flat) {
      if (rich.start > cursor) segmentos.push({ inicio: cursor, fim: rich.start, cor: base, origem: 'base' })
      segmentos.push({ inicio: rich.start, fim: rich.end, cor: rich.fill ?? base, origem: 'trecho' })
      cursor = Math.max(cursor, rich.end)
    }
    if (cursor < content.length) segmentos.push({ inicio: cursor, fim: content.length, cor: base, origem: 'base' })
    return segmentos.filter((t) => DESENHA.test(content.slice(t.inicio, t.fim))).map((t) => ({ camada: layer.id, ...t }))
  })
}

export type PapelDoFundo = 'escuro' | 'claro' | 'pagina'

/** Quanto cada tinta sobra do alvo da régua (3:1) num fundo liso: ≥ 0 atende. */
export interface FolgaDoCandidato {
  papel: PapelDoFundo
  cor: string
  /** A menor folga entre as tintas (níveis 0–255); `null` = alguma tinta não é cor que a régua lê. */
  folgaMinima: number | null
  atende: boolean
  /** As tintas que não atendem neste candidato. */
  reprovadas: Array<{ camada: string; cor: string; folga: number | null }>
}

/**
 * A folga de UMA tinta sobre um liso de cor `fundo`, pelo critério da régua pós-render (`regua.ts`): a polaridade de
 * `polaridadeDoTexto` com os dois percentis na luz do liso; texto claro pede luz ≤ `alvoPorContraste`, escuro pede luz ≥
 * `alvoClaroPorContraste`. Sem a tolerância da régua (que avisa): aqui a escolha recusa, então fica o alvo exato.
 */
function folgaDaTinta(cor: string, fundo: string): number | null {
  const luz = luzMedida(fundo)
  const p = polaridadeDoTexto(cor, { p02: luz, p98: luz })
  if (!p) return null
  return p.polaridade === 'clara' ? alvoPorContraste(cor, 3) - luz : luz - alvoClaroPorContraste(cor, 3)
}

function avaliarCandidato(papel: PapelDoFundo, cor: string, tintas: ReadonlyArray<TintaAtiva>): FolgaDoCandidato {
  const folgas = tintas.map((t) => ({ camada: t.camada, cor: t.cor, folga: HEX.test(cor) ? folgaDaTinta(t.cor, cor) : null }))
  const reprovadas = folgas.filter((f) => f.folga === null || f.folga < 0)
  const ilegivel = folgas.some((f) => f.folga === null) || !HEX.test(cor)
  const folgaMinima = ilegivel ? null : folgas.length > 0 ? Math.round(Math.min(...folgas.map((f) => f.folga!)) * 10) / 10 : Infinity
  return { papel, cor, folgaMinima, atende: !ilegivel && reprovadas.length === 0, reprovadas }
}

/**
 * O PAPEL do liso no `foto-em-caixa` (#8): entre o escuro (`numeros.fundo`) e o claro (`numeros.fundoClaro`, se a marca
 * o tem), o que atende TODAS as tintas ativas com a maior folga mínima; no empate, o escuro. Na recomposição
 * (`congelado`, o `Page.background` atual) ele é o candidato ÚNICO, conferido — nunca o papel de hoje da marca no lugar.
 * Nenhum atende → `ARQUETIPO_FUNDO_INDISPONIVEL` (origem `contraste` ou `pagina`), com tintas, candidatos e folgas: a
 * peça nunca sai "no que der", e a variante escolhida não é trocada por outra.
 */
export function papelDoBloco(
  definicao: ArquetipoDeLayout,
  numeros: { fundo: string; fundoClaro?: string },
  tintas: ReadonlyArray<TintaAtiva>,
  congelado?: string | null,
): { fundo: string; papel: PapelDoFundo; folgas: FolgaDoCandidato[] } {
  const chave = chaveDoArquetipo(definicao)
  const recusa = (origem: 'contraste' | 'pagina', folgas: FolgaDoCandidato[], mensagem: string) =>
    new CreativeError('ARQUETIPO_FUNDO_INDISPONIVEL', mensagem, 422, {
      arquetipo: chave,
      origem,
      tintas,
      candidatos: folgas.map((f) => ({ papel: f.papel, cor: f.cor })),
      folgas,
      ...(origem === 'contraste' ? { fundoClaro: numeros.fundoClaro ?? null } : { fundoDaPagina: congelado ?? null }),
    })
  const descrever = (f: FolgaDoCandidato) => `${f.papel} ${f.cor}: ${f.reprovadas.length > 0 ? f.reprovadas.map((r) => `${r.camada} ${r.cor}${r.folga === null ? ' (cor que a régua não lê)' : ''}`).join(', ') : 'atende'}`
  if (congelado !== undefined) {
    const f = avaliarCandidato('pagina', congelado ?? '', tintas)
    if (f.atende) return { fundo: congelado!, papel: 'pagina', folgas: [f] }
    throw recusa(
      'pagina',
      [f],
      `${chave}: a página gravada ${congelado ? `tem o fundo "${congelado}", que não atende o contraste com as tintas da peça (${descrever(f)})` : 'não tem fundo'}. A recomposição usa o fundo da página (nunca o papel de hoje da marca no lugar dele): nada foi desenhado nem gravado.`,
    )
  }
  const folgas = [avaliarCandidato('escuro', numeros.fundo, tintas), ...(numeros.fundoClaro ? [avaliarCandidato('claro', numeros.fundoClaro, tintas)] : [])]
  const vencedor = folgas.filter((f) => f.atende).reduce<FolgaDoCandidato | null>((m, f) => (!m || f.folgaMinima! > m.folgaMinima! ? f : m), null)
  if (vencedor) return { fundo: vencedor.cor, papel: vencedor.papel, folgas }
  throw recusa(
    'contraste',
    folgas,
    `${chave}: nenhum papel da marca dá contraste a todas as tintas que a peça desenha (${folgas.map(descrever).join('; ')})${numeros.fundoClaro ? '' : ' — e a marca não define o fundo claro (Project.assinatura.fundoClaro)'}. Nada foi composto "no que der": troque a variante (as cores dos textos) ou defina o papel da marca que falta.`,
  )
}
