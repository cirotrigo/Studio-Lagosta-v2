/**
 * Se o painel de formas PODE inserir agora (CP-V2c, preflight do CP-V2 §8.2). Módulo PURO, sem React: recebe o estado
 * das duas consultas (a paleta pela variante estrita e o projeto) e diz `carregando`, `erro` ou `pronto`.
 *
 * Inserir com dados que ainda não chegaram, ou depois de uma falha, gravaria o padrão (`#111111`…) como se fosse a
 * cor da marca, e a cor fica congelada na camada (d08: só o "Reaplicar" muda). Por isso:
 * - só `pronto` constrói camada (`camadaParaInserir`); fora dele, nenhuma camada e nenhuma entrada de desfazer;
 * - `erro` nunca vira "marca sem cores": consulta falhada, paleta que não é lista (HTML 200), cor sem `hexCode` em
 *   texto e projeto sem a chave `assinatura` são erro, e a tela oferece "Tentar de novo" só para o que falhou;
 * - o padrão vale só com ausência CONFIRMADA: lista válida e vazia, `assinatura: null` ou campos ausentes no JSON
 *   gravado. Hex inválido da marca é ignorado pelo resolvedor (`hexValido`), sem erro;
 * - dado de OUTRO `projectId` nunca alimenta a inserção: a paleta vem marcada com o projeto que a pediu, e o projeto
 *   tem o próprio `id`. Na troca, volta a `carregando` até chegar o do projeto atual (cache dele conta).
 */
import { PAPEIS_DA_MARCA, resolverCorDaMarca, type DadosDaMarca } from '@/lib/brand/papeis-de-cor'
import type { ShapeDefinition } from '@/lib/assets/shapes-library'
import type { Layer } from '@/types/template'
import { camadaDoElemento } from './camada-do-elemento'

/** O que interessa de um `useQuery`: o status e o dado (`data` sobrevive a uma nova falha; o status manda). */
export interface ConsultaDaMarca {
  status: 'pending' | 'error' | 'success'
  data: unknown
}

export type FalhaDaMarca = 'paleta' | 'projeto'

export type EstadoDaInsercao =
  | { estado: 'carregando' }
  | { estado: 'erro'; falhas: FalhaDaMarca[] }
  /** `ausenciaConfirmada`: todo papel cai no padrão (marca sem cores e sem assinatura); o aviso D5 é do V2d. */
  | { estado: 'pronto'; marca: DadosDaMarca; ausenciaConfirmada: boolean }

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

type Leitura = { ok: true; valor: unknown } | { ok: false; motivo: 'carregando' | 'erro' }

function lerPaleta(consulta: ConsultaDaMarca, projectId: number): Leitura {
  if (consulta.status === 'error') return { ok: false, motivo: 'erro' }
  if (consulta.status !== 'success') return { ok: false, motivo: 'carregando' }
  const dado = objeto(consulta.data)
  if (dado && typeof dado.projectId === 'number' && dado.projectId !== projectId) return { ok: false, motivo: 'carregando' }
  const cores = dado?.cores
  const valida = dado?.projectId === projectId && Array.isArray(cores) && cores.every((c) => typeof objeto(c)?.hexCode === 'string')
  return valida ? { ok: true, valor: cores } : { ok: false, motivo: 'erro' }
}

function lerProjeto(consulta: ConsultaDaMarca, projectId: number): Leitura {
  if (consulta.status === 'error') return { ok: false, motivo: 'erro' }
  if (consulta.status !== 'success') return { ok: false, motivo: 'carregando' }
  const projeto = objeto(consulta.data) // HTML 200 chega como texto (`api.get`): não é objeto
  if (projeto && typeof projeto.id === 'number' && projeto.id !== projectId) return { ok: false, motivo: 'carregando' }
  return projeto?.id === projectId && 'assinatura' in projeto ? { ok: true, valor: projeto.assinatura } : { ok: false, motivo: 'erro' }
}

export function estadoDaInsercao({ projectId, paleta, projeto }: { projectId: number; paleta: ConsultaDaMarca; projeto: ConsultaDaMarca }): EstadoDaInsercao {
  const lidas = { paleta: lerPaleta(paleta, projectId), projeto: lerProjeto(projeto, projectId) }
  const falhou = (l: Leitura) => 'motivo' in l && l.motivo === 'erro'
  const falhas = (['paleta', 'projeto'] as const).filter((k) => falhou(lidas[k]))
  if (falhas.length > 0) return { estado: 'erro', falhas }
  if (!lidas.paleta.ok || !lidas.projeto.ok) return { estado: 'carregando' }
  const marca: DadosDaMarca = { paleta: lidas.paleta.valor as DadosDaMarca['paleta'], assinaturaCrua: lidas.projeto.valor ?? null }
  return { estado: 'pronto', marca, ausenciaConfirmada: PAPEIS_DA_MARCA.every((p) => resolverCorDaMarca(p, marca).fonte === 'padrao') }
}

/** A camada a inserir no clique, ou `null` fora de `pronto`: o clique bloqueado não cria camada nem desfazer. */
export function camadaParaInserir(
  estado: EstadoDaInsercao,
  definicao: ShapeDefinition,
  contexto: { base: Layer; canvas: { width: number; height: number } },
): Layer | null {
  return estado.estado === 'pronto' ? camadaDoElemento(definicao, { ...contexto, marca: estado.marca }) : null
}
