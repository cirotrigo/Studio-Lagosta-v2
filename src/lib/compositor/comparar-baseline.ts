import type { ResultadoDaComposicao } from './compor'
import type { IntervencaoDeTexto } from './regua'
import { DIMENSOES } from './spec'

/** Diferença global dos rasters com/sem fundos de texto, sem os glifos. */
export function compararTons(antes: Uint8Array, depois: Uint8Array): IntervencaoDeTexto {
  if (!antes.length || antes.length !== depois.length) throw new Error('Rasters tonais incompatíveis')
  let alteracao = 0
  let escurecimento = 0
  for (let i = 0; i < antes.length; i++) {
    const delta = antes[i] - depois[i]
    alteracao += Math.abs(delta)
    escurecimento += Math.max(0, delta)
  }
  return { alteracaoMedia: alteracao / antes.length / 255, escurecimentoMedio: escurecimento / antes.length / 255 }
}

export interface LeituraComparavel {
  tom?: IntervencaoDeTexto
  fontes360: Record<string, number>
  cores: Record<string, string>
  faixas: Record<string, string>
  contraste: Record<string, number>
  crop: string
  logo: string | null
}

/** Fonte efetiva por papel em 360px. É um proxy relativo, não certificação de leitura. */
export function leituraComparavel(r: ResultadoDaComposicao): LeituraComparavel {
  const canvas = DIMENSOES[r.diagnostico.formato]
  const fontes360: Record<string, number> = {}
  const cores: Record<string, string> = {}
  const faixas: Record<string, string> = {}
  const contraste: Record<string, number> = {}
  for (const l of r.layers.filter((l) => l.type === 'text' && l.visible !== false)) {
    const papel = l.name === 'headline2' ? 'headline' : l.name ?? l.id
    const fonte = Number(l.style?.fontSize)
    if (!(fonte > 0) || !Number.isFinite(fonte)) continue
    cores[papel] = [cores[papel], String(l.style?.color ?? '').toLowerCase()].filter(Boolean).join('|')
    fontes360[papel] = Math.min(fontes360[papel] ?? Infinity, fonte * 360 / canvas.width)
    const centro = (l.position.y + l.size.height / 2) / canvas.height
    // Mesmas faixas usadas pelo compositor para os agrupamentos da assinatura.
    const faixa = centro < 0.45 ? 'topo' : centro > 0.55 ? 'rodape' : 'meio'
    faixas[papel] = [faixas[papel], faixa].filter(Boolean).join('|')
    const c = r.diagnostico.contraste?.find((c) => c.camadas.includes(l.id))
    if (c) contraste[papel] = Math.min(contraste[papel] ?? Infinity, c.sentido === 'claro' ? c.alvo - c.p98ComHalo : c.p98ComHalo - c.alvo)
  }
  return { tom: r.diagnostico.intervencaoDeTexto, fontes360, cores, faixas, contraste, crop: r.diagnostico.posicao.crop, logo: r.diagnostico.logo?.canto ?? null }
}

/** Uma unidade de cinza evita tratar quantização como ganho ou regressão estética. */
const TOLERANCIA_TONAL = 1 / 255
export function compararComBaseline(base: LeituraComparavel, candidata: LeituraComparavel, mesmaFoto: boolean): { domina: boolean; motivos: string[] } {
  const motivos: string[] = []
  if (!mesmaFoto) motivos.push('Outra foto: revisão humana da cena necessária.')
  if (base.crop !== candidata.crop) motivos.push('Outro recorte: preservação do assunto requer revisão.')
  if (base.logo !== candidata.logo) motivos.push('Logo mudou de canto: conferir legibilidade visual.')
  const papeis = Object.keys(base.fontes360)
  if (!papeis.length || papeis.some((p) => !(p in candidata.fontes360)) || Object.keys(candidata.fontes360).some((p) => !(p in base.fontes360))) motivos.push('Papéis/fontes não comparáveis.')
  for (const p of papeis) {
    if (![base.fontes360[p], candidata.fontes360[p]].every((n) => Number.isFinite(n) && n > 0)) motivos.push(`${p}: fonte inválida para comparação.`)
    if (!base.cores[p] || !candidata.cores[p] || base.cores[p] !== candidata.cores[p]) motivos.push(`${p}: cor do texto mudou; contraste e identidade exigem revisão visual.`)
    if (base.faixas[p] !== candidata.faixas[p]) motivos.push(`${p}: mudou de faixa vertical; revisão de hierarquia necessária.`)
    if (candidata.fontes360[p] < base.fontes360[p] - 0.01) motivos.push(`${p}: fonte menor a 360px.`)
    if (!Number.isFinite(base.contraste[p]) || !Number.isFinite(candidata.contraste[p])) motivos.push(`${p}: contraste comparável indisponível.`)
    else if (candidata.contraste[p] < base.contraste[p] - 1) motivos.push(`${p}: margem de contraste pior.`)
  }
  if (!base.tom || !candidata.tom || ![base.tom.alteracaoMedia, base.tom.escurecimentoMedio, candidata.tom.alteracaoMedia, candidata.tom.escurecimentoMedio].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) motivos.push('Intervenção tonal não medida: não há evidência para trocar baseline.')
  else {
    if (candidata.tom.escurecimentoMedio > base.tom.escurecimentoMedio + TOLERANCIA_TONAL) motivos.push('Maior escurecimento médio pelos fundos de texto.')
    if (candidata.tom.alteracaoMedia > base.tom.alteracaoMedia + TOLERANCIA_TONAL) motivos.push('Maior alteração tonal média pelos fundos de texto.')
  }
  const melhora = (base.tom && candidata.tom && (candidata.tom.alteracaoMedia < base.tom.alteracaoMedia - TOLERANCIA_TONAL || candidata.tom.escurecimentoMedio < base.tom.escurecimentoMedio - TOLERANCIA_TONAL)) || papeis.some((p) => candidata.fontes360[p] > base.fontes360[p] + 0.01 || candidata.contraste[p] > base.contraste[p] + 1)
  if (!melhora) motivos.push('Empate ou ganho não demonstrado: conservar baseline.')
  return { domina: motivos.length === 0, motivos }
}
