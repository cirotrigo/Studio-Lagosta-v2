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
  /** O que foi medido na opção (`MedidasDaFoto`): é o que a folha da bancada mostra. */
  medidas?: MedidasDaFoto
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
    mesmoRecorte(atual.estilo.crop ?? null, registro.recorteDeOrigem ?? null) &&
    atual.caixa.width === registro.quadro.width &&
    atual.caixa.height === registro.quadro.height
  )
}

/**
 * Campo a campo, nunca por `JSON.stringify`: o registro passa pelo `jsonb` do
 * Postgres, que REORDENA as chaves do objeto. Comparado como texto, todo
 * recorte manual parecia outro e a aplicação era recusada (medido no banco de
 * desenvolvimento em 18/11/2026, na primeira página com recorte).
 */
function mesmoRecorte(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  return (['x', 'y', 'width', 'height'] as const).every((k) => typeof x[k] === 'number' && typeof y[k] === 'number' && Math.abs((x[k] as number) - (y[k] as number)) < 1e-9)
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

/** O que se mede numa opção, contra a foto de origem. Tudo opcional: sem caixa do assunto, só o tom e a nitidez geral. */
export interface MedidasDaFoto {
  /** Fração do quadro com elemento novo (mapa de zonas). */
  area?: number
  /** Desvio médio de tom, 0 a 255. */
  tom?: number
  /** Nitidez nova/origem dentro da caixa do assunto. */
  nitidezDoAssunto?: number | null
  /** Nitidez nova/origem fora dela (abaixo de 1 = fundo mais desfocado). */
  nitidezDoFundo?: number
  /** Tamanho do assunto na foto nova, em relação à origem (0,8 = 80%). */
  escalaDoAssunto?: number
  /** Quanto o centro do assunto andou, em fração do quadro. */
  dx?: number
  dy?: number
  /** Quão bem o assunto foi reconhecido na foto nova (0 a 1). */
  correlacao?: number
}

/** Abaixo disto (0 a 255) o tom não mudou. Calibrado na bancada de 17 e 18/11/2026: iguais 2,0 a 2,9; tratadas de 3,0 para cima. */
export const PISO_DE_TOM = 3
/** Até aqui o tratamento existe, mas fica no limite do que se enxerga (bancada: 3,0 a 5,6 passavam despercebidos na folha). */
export const TOM_VISIVEL = 6
/** O fundo desfocou mais que o assunto quando a nitidez do assunto, dividida pela do fundo, passa disto. O ruído entre gerações iguais ficou entre 0,86 e 0,96. */
export const SEPARACAO_VISIVEL = 1.2
/** O assunto mudou de tamanho além disto (bancada: os que encolheram deram 0,75 e 0,80; os que ficaram, 1,00). */
export const LIMITE_DE_ESCALA = 0.1
/** O centro do assunto andou além disto, em fração do quadro (bancada: 0,09 e 0,12 nos que saíram do lugar; 0,00 nos outros). */
export const LIMITE_DE_POSICAO = 0.05
/** Abaixo disto o assunto não foi reconhecido como era, e escala e posição não valem. */
export const CORRELACAO_MINIMA = 0.45

/** O fundo ficou mais desfocado em relação ao assunto? Null sem caixa do assunto. */
export function separacaoDoFundo(m: MedidasDaFoto): number | null {
  if (m.nitidezDoAssunto == null || !m.nitidezDoFundo) return null
  return m.nitidezDoAssunto / m.nitidezDoFundo
}

/**
 * O ÚNICO descarte: a opção saiu igual à origem. Nada novo no quadro (mapa de
 * zonas), tom parado e fundo sem desfoque a mais. O mapa de zonas sozinho
 * descartava todo tratamento global (17/11/2026).
 */
export function saiuIgual(m: MedidasDaFoto, areaMinima: number): boolean {
  const separacao = separacaoDoFundo(m)
  return (m.area ?? 0) < areaMinima && (m.tom ?? 0) < PISO_DE_TOM && !(separacao != null && separacao >= SEPARACAO_VISIVEL)
}

/**
 * Os avisos que saem das MEDIDAS (nunca veto): o assunto que encolheu ou saiu
 * do lugar, e o tratamento que ficou quase imperceptível. `receitas` são os
 * ids pedidos.
 */
export function avisosDasMedidas(receitas: string[], m: MedidasDaFoto): AvisoDaOpcao[] {
  const avisos: AvisoDaOpcao[] = []
  const pct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`
  if (m.correlacao != null && m.escalaDoAssunto != null) {
    if (m.correlacao < CORRELACAO_MINIMA) {
      avisos.push({ tipo: 'assunto', texto: 'O assunto da foto não foi reconhecido como era (pode ter mudado de tamanho, de lugar ou de aparência): compare o antes e o depois.' })
    } else {
      const partes: string[] = []
      if (Math.abs(m.escalaDoAssunto - 1) >= LIMITE_DE_ESCALA) partes.push(`ficou com ${Math.round(m.escalaDoAssunto * 100)}% do tamanho`)
      const dx = m.dx ?? 0
      const dy = m.dy ?? 0
      if (Math.abs(dx) >= LIMITE_DE_POSICAO) partes.push(`andou ${pct(dx)} do quadro para a ${dx > 0 ? 'direita' : 'esquerda'}`)
      if (Math.abs(dy) >= LIMITE_DE_POSICAO) partes.push(`andou ${pct(dy)} do quadro para ${dy > 0 ? 'baixo' : 'cima'}`)
      if (partes.length > 0) avisos.push({ tipo: 'assunto', texto: `O assunto da foto mudou: ${partes.join(' e ')}. A receita não devia mexer no tamanho nem no lugar dele: compare o antes e o depois.` })
    }
  }
  if (receitas.includes('foto-profissional') && !receitas.includes('humanizar') && !receitas.includes('abrir-espaco')) {
    const separacao = separacaoDoFundo(m)
    if ((m.tom ?? 0) < TOM_VISIVEL && !(separacao != null && separacao >= SEPARACAO_VISIVEL)) {
      avisos.push({ tipo: 'conferencia', texto: `O tratamento ficou no limite do que se enxerga (tom ${(m.tom ?? 0).toFixed(1)} de 255, fundo sem desfoque a mais): compare antes de usar, ou peça outra opção.` })
    }
  }
  return avisos
}

