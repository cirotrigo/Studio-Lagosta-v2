/**
 * T5 (24/10/2026) — PROMOVER uma página a variante da marca: a cópia, a validação e a equivalência, puras.
 *
 * - A cópia leva só ESTILO e GEOMETRIA (decisões do owner D1/D5/D6): as camadas CRUAS da origem, na mesma ordem, com os
 *   mesmos ids, `parentId`, `order`, texto e o resto do `metadata` — nada normalizado, completado ou renumerado (a
 *   normalização ordena e completa peso/entrelinha/`autoExpand`…, e a variante deixaria de ser a página). Sai só a
 *   semântica de PEÇA de `metadata.compositor` (bloco, linhas, extra, prefixo, encaixe, canto, elementoDe, acento —
 *   contrato de copy e receita de arquétipo): fica a allowlist `{ papel }`, que os ARRANJOS leem (`papelDoTexto`).
 * - A validação CONFERE e nunca conserta: schema e clipes (`validarCamadas(...).problemas`, a saída com defaults não é
 *   usada), ids únicos, vetores, formato pelos dois classificadores, manchete, e a EQUIVALÊNCIA origem × cópia — estilo
 *   (`montarAssinatura`), papéis pelas duas derivações e arranjos (`arranjosDaPagina`) — com o MESMO medidor
 *   determinístico nos dois lados (fontes e rede ficam fora da transação da porta). Divergência = recusa.
 *
 * Módulo PURO (sem `@/lib/db`): a porta chama dentro da transação.
 */
import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { validarCamadas } from '@/lib/creatives/layer-contract'
import { papelDoTexto } from '@/lib/font-combinations-capture'
import { lerCamadas, normalizeLayersString } from '@/lib/posts/page-layers'
import { corpoDoVetorInvalido, exigirVetoresValidos } from '@/lib/vetor/guarda-de-porta'
import { VetorInvalido } from '@/lib/vetor/validar-camada'
import { formatoDaPagina, montarAssinatura } from './assinatura'
import { arranjosDaPagina } from './combinacoes'
import { TAG_FORA_DO_RODIZIO } from './fora-do-rodizio'
import { formatoDaPaginaGravada } from './formato'
import { ehPapel, papelDoNome } from './papel-do-nome'
import type { Formato, Papel } from './spec'

export interface PaginaDeOrigem {
  name: string
  width: number
  height: number
  background: string | null
  layers: unknown
  tags?: string[] | null
}

export interface CopiaDeEstilo {
  name: string
  width: number
  height: number
  background: string | null
  /** As camadas cruas, prontas para `JSON.stringify` (vazio quando a origem é ilegível — a validação recusa). */
  layers: Array<Record<string, unknown>>
  tags: string[]
  /** As camadas da origem eram um JSON legível. */
  legivel: boolean
}

export type ValidacaoDaVariante =
  | { ok: true; formato: Exclude<Formato, 'quadrado'>; papeis: Papel[]; avisos: string[] }
  | { ok: false; codigo: string; mensagem: string; detalhes: Record<string, unknown> }

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A camada com `metadata.compositor` reduzido a `{ papel }` (só papel válido); o objeto some quando não sobra nada. */
function camadaDeEstilo(bruta: unknown): Record<string, unknown> {
  const camada = structuredClone(bruta) as Record<string, unknown>
  if (!ehObjeto(camada) || !ehObjeto(camada.metadata) || !('compositor' in camada.metadata)) return camada
  const { compositor, ...resto } = camada.metadata
  const papel = ehObjeto(compositor) && ehPapel(compositor.papel) ? compositor.papel : null
  camada.metadata = papel ? { ...resto, compositor: { papel } } : resto
  return camada
}

/** A cópia de ESTILO da página: nome, tamanho, fundo e camadas cruas; tags recriadas (marca + formato). */
export function copiaDeEstiloDaPagina(origem: PaginaDeOrigem): CopiaDeEstilo {
  const { camadas, legivel } = lerCamadas(origem.layers)
  return {
    name: origem.name,
    width: origem.width,
    height: origem.height,
    background: origem.background,
    layers: camadas.map(camadaDeEstilo),
    tags: [TAG_FORA_DO_RODIZIO, formatoDaPaginaGravada(origem)],
    legivel,
  }
}

/**
 * Régua determinística e pura para a equivalência: os dois lados só diferem nas chaves removidas, então qualquer medida
 * igual dos dois lados serve.
 * ponytail: estimativa por caractere, não a fonte real — a mesma comparação com o medidor do servidor fica nos testes.
 */
export const medidorDeterministico: MeasureTextBox = (l) => {
  const linhas = String(l.content ?? '').split('\n')
  const corpo = Number(l.style?.fontSize) || 16
  return { height: corpo * (Number(l.style?.lineHeight) || 1.2) * linhas.length, maxLineWidth: Math.max(0, ...linhas.map((x) => x.length * corpo * 0.55)), lineCount: linhas.length }
}

const recusa = (codigo: string, mensagem: string, detalhes: Record<string, unknown> = {}): ValidacaoDaVariante => ({ ok: false, codigo, mensagem, detalhes })
const textosVisiveis = (camadas: Layer[]) => camadas.filter((c) => c.visible !== false && (c.type === 'text' || c.type === 'rich-text'))
const NOMES_DA_MANCHETE = ['headline', 'titulo', 'manchete', 'title']

/** O que a variante É para o compositor: o estilo por papel, os papéis pelas duas derivações e os arranjos. */
function leituraDaVariante(p: { name: string; width: number; height: number; background: string | null; tags: string[] }, camadas: Layer[], medir: MeasureTextBox) {
  const pagina = { id: 'variante', name: p.name, tags: p.tags, width: p.width, height: p.height, background: p.background, layers: camadas }
  const a = montarAssinatura({ pagina, formatoDaPagina: formatoDaPagina(pagina), numerosDoProjeto: null })
  return {
    estilo: JSON.stringify({ papeis: a.papeis, logo: a.logo, alinhamento: a.alinhamento, gradienteDaPagina: a.gradienteDaPagina, geometria: a.numeros.geometria }),
    papeisDoEstilo: JSON.stringify(textosVisiveis(camadas).map((c) => [c.id, papelDoNome(c.name) ?? papelDoNome(c.id)])),
    papeisDoArranjo: JSON.stringify(textosVisiveis(camadas).map((c) => [c.id, papelDoTexto(c)])),
    arranjos: JSON.stringify([...arranjosDaPagina({ pageId: 'variante', nome: p.name, camadas, medir })]),
    papeis: Object.keys(a.papeis) as Papel[],
  }
}

/** Confere a cópia FINAL (como vai ser gravada) contra a origem crua. Não normaliza nada; a primeira recusa vence. */
export function validarVariantePromovida(copia: CopiaDeEstilo, origem: PaginaDeOrigem, medir: MeasureTextBox = medidorDeterministico): ValidacaoDaVariante {
  const { problemas } = validarCamadas(copia.legivel ? copia.layers : origem.layers)
  if (problemas.length > 0) return recusa('CAMADAS_INVALIDAS', `As camadas desta página não são válidas: ${problemas.join('; ')}.`, { problemas })

  const vistos = new Set<string>()
  const repetidos = [...new Set(copia.layers.map((c) => String(c.id)).filter((id) => vistos.has(id) || !vistos.add(id)))]
  if (repetidos.length > 0) return recusa('IDS_DE_CAMADA_REPETIDOS', `Há camadas com o mesmo id nesta página (${repetidos.join(', ')}). Duplique ou renomeie a camada no editor antes de promover.`, { ids: repetidos })

  try {
    exigirVetoresValidos(copia.layers)
  } catch (erro) {
    if (!(erro instanceof VetorInvalido)) throw erro
    const corpo = corpoDoVetorInvalido(erro)
    return recusa('VETOR_INVALIDO', corpo.error, { camadas: corpo.camadas })
  }

  const formatoGravado = formatoDaPaginaGravada(origem)
  const formatoPeloNome = formatoDaPagina(copia)
  if ((formatoGravado !== 'story' && formatoGravado !== 'feed') || formatoPeloNome !== formatoGravado) {
    return recusa(
      'FORMATO_NAO_SUPORTADO',
      formatoGravado !== 'story' && formatoGravado !== 'feed'
        ? `Só página de story ou de feed vira variante (esta é ${formatoGravado}).`
        : `O nome e o tamanho desta página dizem formatos diferentes (${formatoPeloNome ?? 'nenhum'} pelo nome, ${formatoGravado} pelo tamanho e tags). Ajuste o nome antes de promover.`,
      { formatoGravado, formatoPeloNome },
    )
  }

  const camadasDaCopia = copia.layers as unknown as Layer[]
  const daCopia = leituraDaVariante(copia, camadasDaCopia, medir)
  if (!daCopia.papeis.includes('headline')) {
    return recusa('VARIANTE_SEM_MANCHETE', `A variante precisa de uma camada de texto visível chamada ${NOMES_DA_MANCHETE.join(', ')} (o nome ou o id da camada). Papéis achados: ${daCopia.papeis.join(', ') || 'nenhum'}.`, { papeisAchados: daCopia.papeis, nomesAceitos: NOMES_DA_MANCHETE })
  }

  // Nome, tamanho, fundo e tags da cópia nos dois lados: a única diferença medida é a das camadas (a allowlist).
  const daOrigem = leituraDaVariante(copia, lerCamadas(origem.layers).camadas as unknown as Layer[], medir)
  const diferencas = (['estilo', 'papeisDoEstilo', 'papeisDoArranjo', 'arranjos'] as const).filter((k) => daOrigem[k] !== daCopia[k])
  if (diferencas.length > 0) {
    return recusa('COPIA_NAO_EQUIVALENTE', `A cópia desta página não sairia igual como variante (${diferencas.join(', ')} mudaram). Nada foi criado.`, { diferencas })
  }

  const avisos: string[] = []
  const porPapel = new Map<Papel, number>()
  for (const c of textosVisiveis(camadasDaCopia)) {
    const papel = papelDoNome(c.name) ?? papelDoNome(c.id)
    if (papel) porPapel.set(papel, (porPapel.get(papel) ?? 0) + 1)
  }
  for (const [papel, n] of porPapel) if (n > 1) avisos.push(`${n} camadas fazem o papel "${papel}": vale a primeira da lista.`)
  if (!camadasDaCopia.some((c) => c.visible !== false && (c.type === 'logo' || c.type === 'image') && /logo|marca/i.test(`${c.name} ${c.id}`))) {
    avisos.push('A página não tem camada de logo: a peça usa a logo do projeto.')
  }
  return { ok: true, formato: formatoGravado, papeis: daCopia.papeis, avisos }
}

/** A mesma variante já promovida? Só para a idempotência — a gravação continua crua. */
export function mesmaVariante(a: { name: string; width: number; height: number; background: string | null; layers: unknown }, b: typeof a): boolean {
  return a.name === b.name && a.width === b.width && a.height === b.height && a.background === b.background && normalizeLayersString(a.layers) === normalizeLayersString(b.layers)
}
