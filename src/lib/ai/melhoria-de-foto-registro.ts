/**
 * O REGISTRO da melhoria de foto: o que a Generation da proposta guarda em
 * `fieldValues.melhoriaDeFoto` (17/11/2026).
 *
 * A Generation de `source: 'melhoria-de-foto'` é uma PROPOSTA: leitura, prompt
 * e as opções geradas (foto limpa e prévia). A página e o post só mudam quando
 * alguém aplica uma opção, e é isso que `aplicada` registra.
 *
 * Puro (sem banco): o `ver-geracao` e a aplicação decidem por aqui.
 */

import type { FotoDaPagina } from './quadro-da-foto'
import type { ReceitaPedida } from './receitas-de-foto'

export const FONTE_DA_MELHORIA_DE_FOTO = 'melhoria-de-foto'
/** A trilha das fotos guardadas no Blob por este caminho (seção 6, item 6, do plano). */
export const TRILHA_DA_FOTO_MELHORADA = 'foto-melhorada'
/** Nano Banana 2.1 em 2K, por imagem: tabela do Google lida em 17/11/2026 (o diretor e a visão não entram). */
export const CUSTO_POR_OPCAO_USD = 0.05

export interface AvisoDaOpcao {
  tipo: 'assunto' | 'cena' | 'rosto' | 'risco' | 'conferencia'
  texto: string
  /** Mostrar antes de tudo (rosto de pessoa real). */
  destaque?: boolean
}

export interface OpcaoDeFoto {
  /** 1 ou 2: é o número que a pessoa escolhe. */
  opcao: number
  /** A foto limpa, sem texto, no quadro da peça. Null na opção descartada. */
  fotoUrl: string | null
  /** A página renderizada com a foto trocada, sem gravar nada. */
  previaUrl: string | null
  avisos: AvisoDaOpcao[]
  /** O único descarte: a opção saiu igual à origem. */
  descartada?: string
  /** Fração do quadro que mudou visivelmente. */
  areaAlterada?: number
  /** Diferença média de tom para a foto de origem (0 a 255). */
  diferencaDeTom?: number
  custoUsd: number
  tokens?: { entrada?: number; saida?: number }
  segundos: number
}

export interface RegistroDaMelhoriaDeFoto {
  trilha: typeof TRILHA_DA_FOTO_MELHORADA
  pageId: string
  camadaId: string
  /** A foto da página quando a proposta foi gerada, com o recorte: aplicar confere que ainda é esta. */
  fotoDeOrigemUrl: string
  recorteDeOrigem: unknown
  quadro: { width: number; height: number }
  receitas: ReceitaPedida[]
  pedido: string
  /** Quem escreveu o prompt: o diretor de foto, ou o chat (prompt pronto). */
  promptDe: 'diretor' | 'chat'
  leitura: string | null
  prompt: string
  riscos: string[]
  /** Null quando ninguém olhou (visão fora do ar). */
  rostoEmFoco: boolean | null
  opcoes: OpcaoDeFoto[]
  /** Só quando a página foi editada depois da arte de origem: a página de HOJE renderizada, o par certo da prévia. */
  antesUrl?: string
  /** O post para o qual a melhoria foi pedida; a troca só acontece ao aplicar. */
  postId: string | null
  aplicada: { opcao: number; generationId: string; url: string; em: string; postId?: string | null } | null
}

export function lerRegistroDaMelhoriaDeFoto(fieldValues: unknown): RegistroDaMelhoriaDeFoto | null {
  const fv = (fieldValues ?? {}) as Record<string, unknown>
  if (fv.source !== FONTE_DA_MELHORIA_DE_FOTO) return null
  const r = fv.melhoriaDeFoto as RegistroDaMelhoriaDeFoto | undefined
  return r && typeof r === 'object' && Array.isArray(r.opcoes) ? r : null
}

/**
 * A página ainda mostra a foto para a qual a opção foi gerada? A foto nova
 * veio do quadro DAQUELA foto, com aquele recorte: se alguém trocou a foto,
 * mexeu no recorte ou mudou a caixa, ela cairia no lugar errado. Texto, logo e
 * elementos podem ter mudado à vontade.
 */
export function fotoAindaEAMesma(registro: RegistroDaMelhoriaDeFoto, atual: FotoDaPagina | null): boolean {
  if (!atual) return false
  return (
    atual.camadaId === registro.camadaId &&
    atual.url === registro.fotoDeOrigemUrl &&
    JSON.stringify(atual.estilo.crop ?? null) === JSON.stringify(registro.recorteDeOrigem ?? null) &&
    atual.caixa.width === registro.quadro.width &&
    atual.caixa.height === registro.quadro.height
  )
}

export function opcaoParaAplicar(
  registro: RegistroDaMelhoriaDeFoto,
  numero: number,
):
  | { ok: true; opcao: OpcaoDeFoto }
  | { ok: 'ja-aplicada'; aplicada: NonNullable<RegistroDaMelhoriaDeFoto['aplicada']> }
  | { ok: false; codigo: 'OPCAO_NAO_EXISTE' | 'OPCAO_DESCARTADA' | 'OUTRA_OPCAO_JA_APLICADA'; mensagem: string } {
  if (registro.aplicada) {
    if (registro.aplicada.opcao === numero) return { ok: 'ja-aplicada', aplicada: registro.aplicada }
    return {
      ok: false,
      codigo: 'OUTRA_OPCAO_JA_APLICADA',
      mensagem: `A opção ${registro.aplicada.opcao} desta melhoria já foi aplicada à página. Para usar outra foto, peça uma melhoria nova sobre a arte atual.`,
    }
  }
  const opcao = registro.opcoes.find((o) => o.opcao === numero)
  if (!opcao) {
    return { ok: false, codigo: 'OPCAO_NAO_EXISTE', mensagem: `Esta melhoria não tem a opção ${numero} (tem ${registro.opcoes.map((o) => o.opcao).join(' e ') || 'nenhuma'}).` }
  }
  if (opcao.descartada || !opcao.fotoUrl) {
    return { ok: false, codigo: 'OPCAO_DESCARTADA', mensagem: `A opção ${numero} foi descartada: ${opcao.descartada ?? 'não há foto'}.` }
  }
  return { ok: true, opcao }
}

/** O que o `ver-geracao` devolve da proposta. */
export function retornoDasOpcoes(registro: RegistroDaMelhoriaDeFoto) {
  return {
    leitura: registro.leitura,
    ...(registro.antesUrl ? { antesUrl: registro.antesUrl } : {}),
    prompt: registro.prompt,
    riscos: registro.riscos,
    opcoes: registro.opcoes.map((o) => ({
      opcao: o.opcao,
      previaUrl: o.previaUrl,
      fotoUrl: o.fotoUrl,
      avisosEmDestaque: o.avisos.filter((a) => a.destaque).map((a) => a.texto),
      avisos: o.avisos.filter((a) => !a.destaque).map((a) => a.texto),
      ...(o.descartada ? { descartada: o.descartada } : {}),
    })),
    aplicada: registro.aplicada ? { opcao: registro.aplicada.opcao, generationId: registro.aplicada.generationId, url: registro.aplicada.url } : null,
  }
}
