/**
 * Coerência da grade (§2 do plano). Grade quebrada é DIAGNOSTICADA, nunca consertada: metadados iguais entre as
 * células, índices completos e únicos, `groupId` = id da grade, layout/versão do catálogo, geometria REAL igual à
 * recalculada (≤ TOLERANCIA_PX), raio efetivo, `cover` escrito, sem máscara, sem `border.width`, rotação 0 e foto só
 * de host próprio exato. Ids das células não vazios, não reservados e únicos na lista recebida. Não muta nem congela a entrada.
 */
import type { Layer } from '@/types/template'
import { layoutDoCatalogo, type LayoutDeGrade } from './catalogo'
import { ESPACAMENTO_MAX, TOLERANCIA_PX, caixaValida, celulasDaGrade, raioDaCelula } from './geometria'
import type { Diagnostico, MetadadoDeGrade, OpcoesDeUrl, Retangulo } from './tipos'

/**
 * Loja do Blob confirmada como nossa no fonte (`scripts/compor-leva-setembro.ts` grava nela). Limitação: é uma
 * constante; loja nova entra aqui ou pela lista explícita do chamador. Este módulo não lê env.
 */
export const HOSTS_DO_BLOB_PROPRIO: ReadonlyArray<string> = Object.freeze(['2rhsgfleozgl5jbm.public.blob.vercel-storage.com'])

/** Estrutura, sem falar de propriedade: https, sem credencial, sem porta, com host */
function urlHttpsLimpa(url: unknown): URL | undefined {
  if (typeof url !== 'string' || !url) return undefined
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return undefined
  }
  return u.protocol === 'https:' && !u.username && !u.password && u.port === '' && u.hostname ? u : undefined
}

/**
 * Foto aceitável em célula: URL https limpa cujo host é IGUAL a um da lista (padrão: `HOSTS_DO_BLOB_PROPRIO`).
 * `data:`, `blob:`, `http:` e o CDN do Drive (lh3/googleusercontent) são recusados sempre, mesmo se listados.
 * Não usa `HOSTS_PROPRIOS` (ingerir-midia): aquela lista aceita lh3 e Supabase.
 */
export function urlDeBlobProprio(url: unknown, hostsProprios: ReadonlyArray<string> = HOSTS_DO_BLOB_PROPRIO): boolean {
  const u = urlHttpsLimpa(url)
  if (!u) return false
  if (u.hostname === 'googleusercontent.com' || u.hostname.endsWith('.googleusercontent.com')) return false
  return hostsProprios.some((h) => typeof h === 'string' && h.toLowerCase() === u.hostname)
}

export const urlAceita = (url: unknown, opcoes: OpcoesDeUrl = {}) => urlDeBlobProprio(url, opcoes.hostsProprios)

/** Ids que revisor, halo, defasagem e bake tratam como "a" foto de fundo */
export const IDS_RESERVADOS: ReadonlySet<string> = new Set(['bg-foto', 'bg-img'])

/** `''` e ausente são a mesma célula vazia (o roundtrip do `layerSchema` troca um pelo outro) */
export const celulaVazia = (fileUrl: unknown) => fileUrl === '' || fileUrl === undefined

export function metadadoDeGrade(camada: Layer): MetadadoDeGrade | undefined {
  const g = (camada.metadata as { grade?: unknown } | undefined)?.grade
  return g && typeof g === 'object' ? (g as MetadadoDeGrade) : undefined
}

const perto = (a: unknown, b: number) => typeof a === 'number' && Math.abs(a - b) <= TOLERANCIA_PX
const mesmaCaixa = (a: Retangulo, b: Retangulo) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Confere UMA célula contra a geometria recalculada (usado pela grade inteira e por `preencherCelula`) */
function conferirCelula(
  camada: Layer,
  meta: MetadadoDeGrade,
  caixaDaCelula: Retangulo | undefined,
  opcoes: OpcoesDeUrl,
): Diagnostico[] {
  const d: Diagnostico[] = []
  const quebra = (mensagem: string, codigo: Diagnostico['codigo'] = 'GRADE_INCOERENTE') =>
    d.push({ codigo, mensagem, gradeId: meta.id, camadaId: camada.id })

  if (typeof camada.id !== 'string' || !camada.id || IDS_RESERVADOS.has(camada.id)) quebra('Célula com id vazio ou reservado (bg-foto/bg-img).')
  if (camada.type !== 'image') quebra('Célula de grade precisa ser camada image.')
  if (typeof camada.name !== 'string' || !camada.name) quebra('Célula sem nome.')
  if ((camada.metadata as { groupId?: unknown }).groupId !== meta.id) quebra('groupId diferente do id da grade.')
  if (camada.rotation !== undefined && camada.rotation !== 0) quebra('Célula girada (rotação ≠ 0).', 'GRADE_GIRADA')

  const style = camada.style
  if (style?.objectFit !== 'cover') quebra('Célula sem objectFit "cover" escrito.')
  if (style?.mask !== undefined) quebra('Célula com máscara.')
  const border = style?.border as { width?: unknown; radius?: unknown } | undefined
  if (border?.width !== undefined) quebra('Célula com border.width (sem paridade com o raio).')

  if (caixaDaCelula) {
    const { position: p, size: s } = camada
    if (!p || !s || !perto(p.x, caixaDaCelula.x) || !perto(p.y, caixaDaCelula.y) || !perto(s.width, caixaDaCelula.w) || !perto(s.height, caixaDaCelula.h)) {
      quebra(`Geometria da célula ${meta.celula} diverge da grade além de ${TOLERANCIA_PX} px.`)
    }
    if (!perto(border?.radius, raioDaCelula(meta.raio, caixaDaCelula))) quebra('border.radius diferente do raio efetivo.')
  }

  if (!celulaVazia(camada.fileUrl) && !urlAceita(camada.fileUrl, opcoes)) {
    quebra('Foto da célula fora dos hosts próprios (ou data:/blob:/lh3).', 'URL_INVALIDA')
  }
  return d
}

/** Layout e geometria a partir do metadado; diagnóstico se o metadado não descreve uma grade possível */
function geometriaDoMetadado(meta: MetadadoDeGrade): { layout: LayoutDeGrade; celulas: Retangulo[] } | Diagnostico[] {
  const diag = (codigo: Diagnostico['codigo'], mensagem: string) => [{ codigo, mensagem, gradeId: meta.id }]
  const layout = layoutDoCatalogo(meta.layout, meta.versao)
  if (!layout) return diag('GRADE_DESCONHECIDA', `Layout "${String(meta.layout)}" v${String(meta.versao)} fora do catálogo.`)
  if (!caixaValida(meta.caixa)) return diag('GRADE_INCOERENTE', 'Caixa da grade inválida.')
  if (!Number.isInteger(meta.espacamento) || meta.espacamento < 0 || meta.espacamento > ESPACAMENTO_MAX) {
    return diag('GRADE_INCOERENTE', 'Espaçamento gravado não é inteiro entre 0 e 100.')
  }
  if (typeof meta.raio !== 'number' || !Number.isFinite(meta.raio)) return diag('GRADE_INCOERENTE', 'Raio gravado não finito.')
  const g = celulasDaGrade(layout, meta.caixa, meta.espacamento)
  if (!g.ok) return g.diagnosticos.map((x) => ({ ...x, gradeId: meta.id }))
  if (g.valor.espacamento !== meta.espacamento) {
    return diag('GRADE_INCOERENTE', `Espaçamento gravado ${meta.espacamento} acima do permitido para a caixa (${g.valor.espacamento}).`)
  }
  return { layout, celulas: g.valor.celulas }
}

/** Uma célula sozinha (sem exigir as irmãs): para operações que tocam uma célula */
export function conferirCelulaIsolada(camada: Layer, opcoes: OpcoesDeUrl = {}): Diagnostico[] {
  const meta = metadadoDeGrade(camada)
  if (!meta || typeof meta.id !== 'string' || !meta.id) {
    return [{ codigo: 'CELULA_FORA_DE_GRADE', mensagem: 'A camada não é célula de grade.', camadaId: camada.id }]
  }
  const geo = geometriaDoMetadado(meta)
  if (Array.isArray(geo)) return geo
  if (!Number.isInteger(meta.celula) || meta.celula < 0 || meta.celula >= geo.celulas.length) {
    return [{ codigo: 'GRADE_INCOERENTE', mensagem: 'Índice da célula fora do layout.', gradeId: meta.id, camadaId: camada.id }]
  }
  return conferirCelula(camada, meta, geo.celulas[meta.celula], opcoes)
}

/** Diagnósticos de todas as grades da lista (vazia ⇒ coerente). Camadas sem grade e sem groupId de grade passam. */
export function conferirGrade(camadas: ReadonlyArray<Layer>, opcoes: OpcoesDeUrl = {}): Diagnostico[] {
  const d: Diagnostico[] = []
  const grades = new Map<string, Array<{ camada: Layer; meta: MetadadoDeGrade }>>()
  const soltasComGrupo: Layer[] = []
  const usosDoId = new Map<unknown, number>()
  for (const camada of camadas) usosDoId.set(camada.id, (usosDoId.get(camada.id) ?? 0) + 1)

  for (const camada of camadas) {
    const meta = metadadoDeGrade(camada)
    if (meta === undefined) {
      if ((camada.metadata as { grade?: unknown } | undefined)?.grade !== undefined) {
        d.push({ codigo: 'GRADE_INCOERENTE', mensagem: 'metadata.grade não é objeto.', camadaId: camada.id })
      } else if (typeof (camada.metadata as { groupId?: unknown } | undefined)?.groupId === 'string') {
        soltasComGrupo.push(camada)
      }
      continue
    }
    if (typeof meta.id !== 'string' || !meta.id) {
      d.push({ codigo: 'GRADE_INCOERENTE', mensagem: 'metadata.grade sem id.', camadaId: camada.id })
      continue
    }
    const lista = grades.get(meta.id) ?? []
    lista.push({ camada, meta })
    grades.set(meta.id, lista)
  }

  for (const camada of soltasComGrupo) {
    const grupo = (camada.metadata as { groupId: string }).groupId
    if (grades.has(grupo)) {
      d.push({ codigo: 'GRADE_INCOERENTE', mensagem: 'Camada fora da grade com o groupId dela.', gradeId: grupo, camadaId: camada.id })
    }
  }

  for (const [id, membros] of grades) {
    const ref = membros[0].meta
    const divergente = membros.find(
      ({ meta }) =>
        meta.layout !== ref.layout ||
        meta.versao !== ref.versao ||
        meta.espacamento !== ref.espacamento ||
        meta.raio !== ref.raio ||
        !mesmaCaixa(meta.caixa, ref.caixa),
    )
    if (divergente) {
      d.push({ codigo: 'GRADE_INCOERENTE', mensagem: 'Células da mesma grade com metadados diferentes.', gradeId: id, camadaId: divergente.camada.id })
      continue
    }
    const geo = geometriaDoMetadado(ref)
    if (Array.isArray(geo)) {
      d.push(...geo)
      continue
    }
    const vistos = new Set<number>()
    for (const { camada, meta } of membros) {
      if ((usosDoId.get(camada.id) ?? 0) > 1) {
        d.push({ codigo: 'GRADE_INCOERENTE', mensagem: 'Id de célula repetido na lista de camadas.', gradeId: id, camadaId: camada.id })
      }
      const i = meta.celula
      if (!Number.isInteger(i) || i < 0 || i >= geo.celulas.length || vistos.has(i)) {
        d.push({ codigo: 'GRADE_INCOERENTE', mensagem: `Índice de célula ${String(i)} inválido ou repetido.`, gradeId: id, camadaId: camada.id })
        d.push(...conferirCelula(camada, meta, undefined, opcoes))
        continue
      }
      vistos.add(i)
      d.push(...conferirCelula(camada, meta, geo.celulas[i], opcoes))
    }
    if (vistos.size !== geo.celulas.length) {
      d.push({ codigo: 'GRADE_INCOERENTE', mensagem: `Grade com ${vistos.size} de ${geo.celulas.length} células.`, gradeId: id })
    }
  }
  return d
}
