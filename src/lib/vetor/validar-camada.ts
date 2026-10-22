/**
 * Validação de DADO da camada vetorial (CP-X2a, preflight X2 v2.1 §4.2). Puro, sem `@/lib/db`, nunca
 * lança: aceita o valor CRU de qualquer tipo, para rodar antes da canonização de forma
 * (`shape-style.ts`, que chama `trim` na cor e lança com não-texto).
 *
 * - Candidato = `type === 'shape'` e `style.shapeType === 'svg-path'` (o mesmo objeto Layer nas portas e
 *   em `ornamentos[].camada`), visível ou não.
 * - Dado inválido ≠ efeito não suportado na prévia: sombra/blur/outros efeitos NÃO entram aqui (são do X1).
 * - Ainda NÃO ligado em porta nenhuma (é o X2b/X2c).
 */
import { lerCor } from './cor'
import { validarPathData } from './validar'

export interface ProblemaDoVetor {
  codigo: string
  campo: string
  mensagem: string
}

export interface VetorComProblemas {
  id: string
  motivos: ProblemaDoVetor[]
}

/** Máximo de partes de um vetor multicor (arquitetura §6.6). */
export const MAX_PARTES = 8

type Objeto = Record<string, unknown>
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const FILL_RULES = ['nonzero', 'evenodd']

export function ehCandidatoVetorial(camada: unknown): boolean {
  return ehObjeto(camada) && camada.type === 'shape' && ehObjeto(camada.style) && camada.style.shapeType === 'svg-path'
}

/** Cor: ausente, `null` ou `''` valem (o render usa o padrão); presente tem de ser lida pelo `lerCor`. */
function problemaDaCor(valor: unknown, campo: string): ProblemaDoVetor[] {
  if (valor === undefined || valor === null || valor === '') return []
  return lerCor(valor) === null
    ? [{ codigo: `COR_INVALIDA:${campo}`, campo: `style.${campo}`, mensagem: `cor ilegível em ${campo}` }]
    : []
}

function problemasDasPartes(vetor: unknown): ProblemaDoVetor[] {
  if (!ehObjeto(vetor) || vetor.partes === undefined) return []
  const partes = vetor.partes
  const campo = 'style.vetor.partes'
  if (!Array.isArray(partes) || partes.length === 0) {
    return [{ codigo: 'PARTES_INVALIDAS', campo, mensagem: 'partes precisa ser uma lista com pelo menos uma parte' }]
  }
  if (partes.length > MAX_PARTES) {
    return [{ codigo: 'PARTES_DEMAIS', campo, mensagem: `${partes.length} partes (máximo ${MAX_PARTES})` }]
  }
  const problemas: ProblemaDoVetor[] = []
  partes.forEach((parte, i) => {
    if (!ehObjeto(parte)) {
      problemas.push({ codigo: 'PARTES_INVALIDAS', campo: `${campo}[${i}]`, mensagem: 'parte não é um objeto' })
      return
    }
    const r = validarPathData(parte.d)
    if (r.ok === false) {
      const falha = r as Extract<typeof r, { ok: false }>
      problemas.push({ codigo: `PARTE_PATH_INVALIDO:${i}:${falha.codigo}`, campo: `${campo}[${i}].d`, mensagem: falha.mensagem })
    }
    if (parte.fillRule !== undefined && !FILL_RULES.includes(parte.fillRule as string)) {
      problemas.push({ codigo: 'PARTES_INVALIDAS', campo: `${campo}[${i}].fillRule`, mensagem: 'fillRule fora de nonzero/evenodd' })
    }
  })
  return problemas
}

/** Vazio = não é candidato, ou é um vetor desenhável. */
export function problemasDoVetor(camada: unknown): ProblemaDoVetor[] {
  if (!ehCandidatoVetorial(camada)) return []
  const style = (camada as Objeto).style as Objeto
  const problemas: ProblemaDoVetor[] = []

  const d = style.pathData
  if (d === undefined || d === null || (typeof d === 'string' && d.trim() === '')) {
    problemas.push({ codigo: 'PATH_AUSENTE', campo: 'style.pathData', mensagem: 'a forma não tem o desenho (pathData)' })
  } else {
    const r = validarPathData(d)
    if (r.ok === false) {
      const falha = r as Extract<typeof r, { ok: false }>
      problemas.push({ codigo: `PATH_INVALIDO:${falha.codigo}`, campo: 'style.pathData', mensagem: falha.mensagem })
    }
  }

  // ausente (undefined) vale: o traçado usa 0 0 100 100. Presente — inclusive null — precisa de 4 números finitos com área.
  const vb = style.pathViewBox
  if (vb !== undefined) {
    const ok = Array.isArray(vb) && vb.length === 4 && vb.every((n) => typeof n === 'number' && Number.isFinite(n)) && (vb[2] as number) > 0 && (vb[3] as number) > 0
    if (!ok) problemas.push({ codigo: 'VIEWBOX_INVALIDO', campo: 'style.pathViewBox', mensagem: 'pathViewBox precisa de 4 números finitos com largura e altura > 0' })
  }

  if (style.pathFillRule !== undefined && !FILL_RULES.includes(style.pathFillRule as string)) {
    problemas.push({ codigo: 'FILLRULE_INVALIDA', campo: 'style.pathFillRule', mensagem: 'pathFillRule fora de nonzero/evenodd' })
  }

  problemas.push(...problemaDaCor(style.fill, 'fill'), ...problemaDaCor(style.strokeColor, 'strokeColor'))

  // border.color é lido pela canonização e, sem strokeColor, pelo render — validado sempre que presente.
  if (style.border !== undefined) {
    if (!ehObjeto(style.border)) {
      problemas.push({ codigo: 'BORDA_INVALIDA', campo: 'style.border', mensagem: 'border precisa ser um objeto' })
    } else {
      problemas.push(...problemaDaCor(style.border.color, 'border.color'))
    }
  }

  problemas.push(...problemasDasPartes(style.vetor))
  return problemas
}

/** Só as camadas com problema, com o id (ou a posição `#i` quando não há id de texto). */
export function problemasDosVetores(camadas: unknown): VetorComProblemas[] {
  if (!Array.isArray(camadas)) return []
  const saida: VetorComProblemas[] = []
  camadas.forEach((camada, i) => {
    const motivos = problemasDoVetor(camada)
    if (motivos.length === 0) return
    const id = ehObjeto(camada) && typeof camada.id === 'string' ? camada.id : `#${i}`
    saida.push({ id, motivos })
  })
  return saida
}

/** O único erro que as portas (X2b/X2c) vão mapear para 422 `VETOR_INVALIDO`. */
export class VetorInvalido extends Error {
  readonly codigo = 'VETOR_INVALIDO'
  constructor(readonly camadas: VetorComProblemas[]) {
    super(`vetor inválido em ${camadas.length} camada(s): ${camadas.map((c) => `${c.id} (${c.motivos.map((m) => m.codigo).join(', ')})`).join('; ')}`)
    this.name = 'VetorInvalido'
  }
}
