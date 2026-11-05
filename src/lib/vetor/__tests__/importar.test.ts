/**
 * CP-V6 — importador de SVG para curadoria (`importar.ts`): XML estrito, allowlist, normalização para `M L C Q Z`
 * absolutos, tetos medidos depois da expansão e a entrada final aceita pela guarda das portas.
 */
import { describe, expect, it } from 'vitest'
import { segmentosDoPath } from '../tracar'
import { validarPathData } from '../validar'
import { problemasDoVetor } from '../validar-camada'
import { ENTRADA_MAX_BYTES, importarSvg, type Curadoria, type PropostaDeVetor } from '../importar'
import { ELEMENTOS_MULTICOR } from '@/lib/assets/shapes-library'
import { MAX_COMANDOS_DAS_PARTES } from '../partes'

const NS = 'xmlns="http://www.w3.org/2000/svg"'
const svg = (corpo: string, vb = '0 0 100 100', extra = '') => `<svg ${NS} viewBox="${vb}"${extra}>${corpo}</svg>`

function ok(fonte: string, curadoria?: Curadoria): PropostaDeVetor {
  const r = importarSvg(fonte, curadoria)
  if (r.ok === false) throw new Error(`recusado: ${(r as { codigo: string }).codigo} — ${(r as { mensagem: string }).mensagem}`)
  return (r as Extract<typeof r, { ok: true }>).proposta
}
function recusa(fonte: string | Uint8Array, curadoria?: Curadoria): string {
  const r = importarSvg(fonte, curadoria)
  if (r.ok) throw new Error('era para recusar')
  return (r as { codigo: string }).codigo
}
const partes = (p: PropostaDeVetor) => p.entrada.partes ?? [{ d: p.entrada.pathData!, slot: p.entrada.slots[0].id ?? 'cor-1', alvo: p.entrada.strokeColor ? 'stroke' : 'fill' }]
const ds = (p: PropostaDeVetor) => partes(p).map((x) => x.d)

describe('importarSvg — normalização', () => {
  it('rect, linha e polígonos viram M L Z absolutos; viewBox deslocado vai para 0 0 w h', () => {
    const p = ok(svg('<rect x="15" y="25" width="50" height="20" fill="#000"/><polygon points="10,10 20,10 15,20" fill="#111"/><polyline points="0 0,5 5" stroke="#222" fill="none"/><line x1="0" y1="90" x2="10" y2="90" stroke="#333"/>', '10 20 100 100'))
    expect(ds(p)).toEqual(['M5 5 L55 5 L55 25 L5 25 Z', 'M0 -10 L10 -10 L5 0 Z', 'M-10 -20 L-5 -15', 'M-10 70 L0 70'])
    expect(p.entrada.pathViewBox).toEqual([0, 0, 100, 100])
  })

  it('círculo, elipse e rect arredondado viram cúbicas (4 por volta) que passam pelos pontos certos', () => {
    const p = ok(svg('<circle cx="50" cy="50" r="40" fill="#000"/><ellipse cx="50" cy="50" rx="30" ry="10" fill="#111"/><rect width="40" height="20" rx="5" fill="#222"/>'))
    const [c, e, r] = ds(p)
    expect(c).toBe('M90 50 C90 72.09 72.09 90 50 90 C27.91 90 10 72.09 10 50 C10 27.91 27.91 10 50 10 C72.09 10 90 27.91 90 50 Z')
    expect(e.match(/C/g)).toHaveLength(4)
    expect(e.startsWith('M80 50 ')).toBe(true)
    expect(r).toBe('M5 0 L35 0 C37.76 0 40 2.24 40 5 L40 15 C40 17.76 37.76 20 35 20 L5 20 C2.24 20 0 17.76 0 15 L0 5 C0 2.24 2.24 0 5 0 Z')
  })

  it('path relativo e compacto: H/V/S/T, flags coladas, 10.e5, número colado e comando depois de Z', () => {
    const p = ok(svg('<path d="m10 10h20v20h-20z l5 5 M0 0c10 0 10 10 20 10s10-10 20-10q5 5 10 0t10 0 M0 50a10 10 0 0110 10 M1.5.5 L3-4 M0 0 L10.e1 0" fill="#000"/>', '0 0 1000 1000'))
    const d = ds(p)[0]
    expect(d).toContain('M10 10 L30 10 L30 30 L10 30 Z M10 10 L15 15') // depois do z, o l parte do início do subpath, com M explícito
    expect(d).toContain('C10 0 10 10 20 10 C30 10 30 0 40 0 Q45 5 50 0 Q55 -5 60 0') // S e T refletem o controle
    expect(d).toContain('M1.5 0.5 L3 -4')
    expect(d).toContain('L100 0') // 10.e1
    expect(d).not.toMatch(/[AaHhVvSsTtmlcqz]/)
    expect(validarPathData(d).ok).toBe(true)
  })

  it('arco: raio 0 vira reta, raio curto é escalado, sentido e arco grande respeitados', () => {
    expect(ds(ok(svg('<path d="M0 0 A0 10 0 0 1 50 50" stroke="#000" fill="none"/>')))[0]).toBe('M0 0 L50 50')
    // raio 1 para uma distância de 20: escalado para 10 (meia volta); sweep 1 = sentido horário NA TELA (y para baixo): sobe por (10, -10)
    const meia = ds(ok(svg('<path d="M0 0 A1 1 0 0 1 20 0" stroke="#000" fill="none"/>')))[0]
    expect(meia).toBe('M0 0 C0 -5.52 4.48 -10 10 -10 C15.52 -10 20 -5.52 20 0')
    const grande = ds(ok(svg('<path d="M10 50 A40 40 0 1 0 90 50" stroke="#000" fill="none"/>')))[0]
    expect(grande.match(/C/g)).toHaveLength(2)
    expect(grande).toContain('50 90') // sweep 0 = anti-horário na tela: de (10, 50) desce por (50, 90)
  })

  it('transforms aninhados na ordem do SVG (pai ∘ filho), rotate com centro, skew em fill', () => {
    const p = ok(svg('<g transform="translate(10 0)"><g transform="scale(2)"><rect width="5" height="5" fill="#000"/></g></g><rect transform="scale(2) translate(10 0)" width="5" height="5" fill="#111"/><rect transform="rotate(90 50 50)" x="50" y="40" width="10" height="5" fill="#222"/><rect transform="skewX(45)" width="10" height="10" fill="#333"/>'))
    expect(ds(p)).toEqual([
      'M10 0 L20 0 L20 10 L10 10 Z',
      'M20 0 L30 0 L30 10 L20 10 Z',
      'M60 50 L60 60 L55 60 L55 50 Z',
      'M0 0 L10 0 L20 10 L10 10 Z',
    ])
  })

  it('herança de fill/stroke/stroke-width/fill-rule por g; escala uniforme multiplica a espessura', () => {
    const p = ok(svg('<g fill="#ff0000" fill-rule="evenodd" stroke="#00f" stroke-width="2"><g transform="scale(1.5)"><rect width="10" height="10"/></g><rect x="20" width="10" height="10" fill="none" stroke-width="3"/></g>'))
    expect(partes(p).map((x) => [x.slot, x.alvo, x.fillRule])).toEqual([['cor-1', 'fill', 'evenodd'], ['cor-2', 'stroke', undefined], ['cor-2', 'stroke', undefined]])
    expect(p.entrada.strokeWidth).toBe(3)
  })

  it('cores repetidas dividem o slot; ordem de pintura do documento, fill antes de stroke', () => {
    const p = ok(svg('<rect width="10" height="10" fill="#AbC" stroke="#123456"/><rect x="20" width="10" height="10" fill="#aabbcc"/>'))
    expect(partes(p).map((x) => `${x.slot}:${x.alvo}`)).toEqual(['cor-1:fill', 'cor-2:stroke', 'cor-1:fill'])
    expect(p.coresDeOrigem).toEqual({ 'cor-1': '#aabbcc', 'cor-2': '#123456' })
    expect(p.entrada.slots.map((s) => s.canal)).toEqual(['preenchimento', 'contorno'])
    expect(p.entrada.pathData).toBe(partes(p)[0].d) // silhueta = 1ª parte de preenchimento
  })

  it('fill ausente na cadeia: preto do SVG com aviso explícito; fill none e stroke 0 não pintam', () => {
    const p = ok(svg('<rect width="10" height="10"/><rect width="5" height="5" fill="none" stroke="#000" stroke-width="0"/>'))
    expect(p.coresDeOrigem).toEqual({ 'cor-1': '#000000' })
    expect(p.avisos.map((a) => a.codigo)).toEqual(['FILL_PADRAO_DO_SVG', 'ELEMENTO_SEM_PINTURA'])
    const vazios = ok(svg('<path d="M10 10" fill="#000"/><path d="M1 1 Z M2 2" fill="#000"/><circle r="0"/><rect width="0" height="5"/><rect width="1" height="1" fill="#000"/>'))
    expect(vazios.avisos.map((a) => a.codigo)).toEqual(['ELEMENTO_SEM_DESENHO', 'ELEMENTO_SEM_DESENHO', 'ELEMENTO_SEM_DESENHO', 'ELEMENTO_SEM_DESENHO'])
    expect(vazios.metricas.partes).toBe(1)
  })

  it('saída legada coerente: uma parte e contornos de uma cor viram monocor; contorno nunca some', () => {
    const fill = ok(svg('<path d="M0 0 L10 0 L10 10 Z M2 2 L8 2 L8 8 Z" fill="#000" fill-rule="evenodd"/>'))
    expect(fill.entrada.partes).toBeUndefined()
    expect(fill.entrada).toMatchObject({ fill: '#374151', pathFillRule: 'evenodd', slots: [{ canal: 'preenchimento', rotulo: 'Preenchimento' }] })
    const tracos = ok(svg('<line x2="10" stroke="#000" stroke-width="2" fill="none"/><path d="M0 5 L10 5" stroke="#000" stroke-width="2" fill="none"/>'))
    expect(tracos.entrada).toMatchObject({ fill: 'transparent', strokeColor: '#374151', strokeWidth: 2, pathData: 'M0 0 L10 0 M0 5 L10 5', slots: [{ canal: 'contorno' }] })
    expect(tracos.avisos.map((a) => a.codigo)).toEqual(['ESPESSURA_EM_PX_DA_CAMADA', 'JUNCAO_REDONDA'])
  })

  it('a entrada passa na guarda das portas e no parser do Konva; saída determinística', () => {
    const fonte = svg('<rect width="100" height="40" y="60" fill="#1e3a8a"/><circle cx="70" cy="50" r="20" fill="#f97316" fill-rule="evenodd"/><path d="M10 10 h80" stroke="#10b981" stroke-width="4" fill="none"/>')
    const p = ok(fonte)
    expect(JSON.stringify(ok(fonte))).toBe(JSON.stringify(p))
    const layer = { type: 'shape', style: { shapeType: 'svg-path', pathData: p.entrada.pathData, pathViewBox: p.entrada.pathViewBox, fill: '#000', vetor: { asset: { id: 'x', versao: 1 }, partes: p.entrada.partes, cores: p.coresDeOrigem } } }
    expect(problemasDoVetor(layer)).toEqual([])
    for (const d of ds(p)) expect(segmentosDoPath(d).every((s) => ['M', 'L', 'C', 'Q', 'z'].includes(s.command))).toBe(true)
    expect(p).toMatchObject({ status: 'proposta', ativada: false })
  })

  it('curadoria completa: slots e papéis vêm dela, sem pendência; cores de origem nunca viram cor da marca', () => {
    const p = ok(svg('<rect width="10" height="10" fill="#1e3a8a"/><rect x="20" width="10" height="10" fill="#f97316"/>'), {
      id: 'dois-blocos', label: 'Dois blocos', category: 'formas', keywords: ['bloco'],
      slots: { '#1E3A8A': { id: 'fundo', papelPadrao: 'escuro', rotulo: 'Fundo' }, '#f97316': { id: 'frente', papelPadrao: 'destaque' } },
    })
    expect(p.pendencias).toEqual([])
    expect(p.entrada.slots).toEqual([
      { canal: 'preenchimento', id: 'fundo', papelPadrao: 'escuro', rotulo: 'Fundo' },
      { canal: 'preenchimento', id: 'frente', papelPadrao: 'destaque', rotulo: 'Preenchimento' },
    ])
    expect(JSON.stringify(p.entrada)).not.toContain('#1e3a8a')
    expect(p.entrada.fill).toBe('#374151')
  })

  it('o SVG das ondas reproduz a onda-base do catálogo (partes, slots, viewBox e silhueta)', () => {
    const onda = ELEMENTOS_MULTICOR.find((e) => e.id === 'onda-base')!
    const p = ok(
      svg('<path fill="#1e3a8a" d="M0 40 C66.67 10 133.33 10 200 40 S333.33 70 400 40 V100 H0 Z"/><path fill="#f97316" d="M0 60 C66.67 35 133.33 35 200 60 S333.33 85 400 60 V100 H0 Z"/><path fill="#fafaf9" d="M0 80 C66.67 62 133.33 62 200 80 S333.33 98 400 80 V100 H0 Z"/>', '0 0 400 100'),
      { id: onda.id, label: onda.label, category: onda.category, keywords: onda.keywords, slots: Object.fromEntries(['#1e3a8a', '#f97316', '#fafaf9'].map((c, i) => [c, { id: onda.slots[i].id!, papelPadrao: onda.slots[i].papelPadrao, rotulo: onda.slots[i].rotulo }])) },
    )
    expect(p.pendencias).toEqual([])
    expect(p.entrada).toEqual(onda)
  })

  it('sem curadoria: pendências listadas, papel ausente (nunca inferido)', () => {
    const p = ok(svg('<rect width="10" height="10" fill="#fff"/>'))
    expect(p.pendencias).toEqual(['id do item (curadoria)', 'label do item (curadoria)', 'category do item (curadoria)', 'papel da marca da cor #ffffff (slot cor-1)'])
    expect(p.entrada.slots[0]).not.toHaveProperty('papelPadrao')
  })

  it('aceita declaração XML UTF-8, BOM, comentários e entidades predefinidas', () => {
    const p = ok(`﻿<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<!-- c --><svg ${NS} viewBox="0&#x20;0 10 10"><!-- d --><path d="M0 0 L10&#32;0 L10 10 Z" fill="&#35;000"/></svg>\n<!-- fim -->`)
    expect(ds(p)).toEqual(['M0 0 L10 0 L10 10 Z'])
  })
})

describe('importarSvg — tetos (antes e depois da normalização)', () => {
  it('entrada: 64 KB passa, 64 KB + 1 recusa antes de ler', () => {
    const base = svg('<rect width="1" height="1" fill="#000"/>')
    const preenche = (alvo: number) => base.replace('<rect', `<!--${'x'.repeat(alvo - base.length - 7)}--><rect`)
    expect(new TextEncoder().encode(preenche(ENTRADA_MAX_BYTES)).length).toBe(ENTRADA_MAX_BYTES)
    expect(ok(preenche(ENTRADA_MAX_BYTES)).metricas.bytesDeEntrada).toBe(ENTRADA_MAX_BYTES)
    expect(recusa(preenche(ENTRADA_MAX_BYTES + 1))).toBe('ENTRADA_GRANDE_DEMAIS')
  })

  it('viewBox: 4096 passa, 4097 recusa; ausente, sem área ou com 3 números recusa', () => {
    expect(ok(svg('<rect width="1" height="1" fill="#000"/>', '0 0 4096 4096')).entrada.pathViewBox).toEqual([0, 0, 4096, 4096])
    expect(recusa(svg('<rect width="1" height="1" fill="#000"/>', '0 0 4097 10'))).toBe('VIEWBOX_GRANDE_DEMAIS')
    expect(recusa(`<svg ${NS}><rect width="1" height="1"/></svg>`)).toBe('VIEWBOX_AUSENTE')
    expect(recusa(svg('<rect width="1" height="1"/>', '0 0 0 10'))).toBe('VIEWBOX_INVALIDO')
    expect(recusa(svg('<rect width="1" height="1"/>', '0 0 10'))).toBe('VIEWBOX_INVALIDO')
    expect(recusa(svg('<rect width="1" height="1"/>', '0 0 10 10', ' width="5000"'))).toBe('VIEWBOX_GRANDE_DEMAIS')
  })

  it('8 partes passam, 9 recusam; 4 cores passam, 5 recusam', () => {
    const rects = (n: number, cor: (i: number) => string) => Array.from({ length: n }, (_, i) => `<rect x="${i}" width="1" height="1" fill="${cor(i)}"/>`).join('')
    expect(ok(svg(rects(8, (i) => `#00000${i % 4}`))).metricas.partes).toBe(8)
    expect(recusa(svg(rects(9, () => '#000')))).toBe('PARTES_DEMAIS')
    expect(ok(svg(rects(4, (i) => `#00000${i}`))).metricas.slots).toBe(4)
    expect(recusa(svg(rects(5, (i) => `#00000${i}`)))).toBe('SLOTS_DEMAIS')
  })

  it('400 comandos passam, 401 recusam — e o arco conta DEPOIS de virar cúbicas', () => {
    const linhas = (n: number) => `M0 0${' L1 1'.repeat(n - 1)}`
    expect(ok(svg(`<path d="${linhas(MAX_COMANDOS_DAS_PARTES)}" stroke="#000" fill="none"/>`)).metricas.comandos).toBe(400)
    expect(recusa(svg(`<path d="${linhas(MAX_COMANDOS_DAS_PARTES + 1)}" stroke="#000" fill="none"/>`))).toBe('COMANDOS_DEMAIS')
    // 150 comandos na entrada (M + 149 arcos de 3/4 de volta), 448 depois (cada arco vira 3 cúbicas)
    const arcos = `M10 0${' A10 10 0 1 1 0 -10 A10 10 0 1 1 10 0'.repeat(74)} A10 10 0 1 1 0 -10`
    expect(recusa(svg(`<path d="${arcos}" stroke="#000" fill="none"/>`, '-20 -20 40 40'))).toBe('COMANDOS_DEMAIS')
  })

  it('16 KB de path medidos depois de absolutizar e arredondar', () => {
    // relativo curto na entrada (≈ 12 KB) vira coordenada absoluta longa na saída (≈ 19 KB) com 355 comandos (< 400)
    const d = `M0 0${' c0.01 0.01 0.02 0.02 1000.03 1000.03'.repeat(70)}`
    const entrada = svg(`<path d="${d}" stroke="#000" fill="none"/><path d="${d}" stroke="#000" fill="none"/><path d="${d}" stroke="#000" fill="none"/><path d="${d}" stroke="#000" fill="none"/><path d="${d}" stroke="#000" fill="none"/>`, '0 0 4096 100')
    expect(new TextEncoder().encode(entrada).length).toBeLessThan(ENTRADA_MAX_BYTES)
    expect(recusa(entrada)).toBe('PATHS_GRANDES_DEMAIS')
  })

  it('coordenada final além de ±100000 recusa', () => {
    expect(recusa(svg('<rect transform="translate(99999 0)" width="10" height="1" fill="#000"/>'))).toBe('COORDENADA_FORA_DO_LIMITE')
  })

  it('curadoria (SVG-ELEMENTOS §7.1) é informação, não admissão: 5 subpaths passam com elegível = false', () => {
    const p = ok(svg('<path d="M0 0 L1 1 M2 2 L3 3 M4 4 L5 5 M6 6 L7 7 M8 8 L9 9" stroke="#000" fill="none"/>'))
    expect(p.elegivelParaCatalogo).toMatchObject({ ok: false, motivos: ['5 subpaths (curadoria v1: ≤ 4)'] })
    expect(p.status).toBe('proposta')
  })
})

describe('importarSvg — rodada 1 da revisão (P2-1 a P2-4)', () => {
  it('P2-1: a proporção sai exata (sem arredondar para 0) e a extrema além de 1:100 é recusada nos dois sentidos', () => {
    const rect = '<rect width="1" height="1" fill="#000"/>'
    expect(ok(svg(rect, '0 0 1 3')).entrada.aspect).toBe(1 / 3)
    expect(ok(svg(rect, '0 0 1 100')).entrada.aspect).toBe(0.01)
    expect(ok(svg(rect, '0 0 100 1')).entrada.aspect).toBe(100)
    expect(recusa(svg(rect, '0 0 1 4096'))).toBe('PROPORCAO_EXTREMA')
    expect(recusa(svg(rect, '0 0 4096 1'))).toBe('PROPORCAO_EXTREMA')
    expect(recusa(svg(rect, '0 0 1 101'))).toBe('PROPORCAO_EXTREMA')
    expect(recusa(svg(rect, '0 0 101 1'))).toBe('PROPORCAO_EXTREMA')
  })

  it.each([
    ['curado primeiro', ['#000', '#fff']],
    ['curado depois', ['#fff', '#000']],
  ])('P2-2: id explícito "cor-2" da curadoria parcial não colide com o automático (%s)', (_n, ordem) => {
    const p = ok(svg(ordem.map((c, i) => `<rect x="${i * 2}" width="1" height="1" fill="${c}"/>`).join('')), { slots: { '#000': { id: 'cor-2', papelPadrao: 'escuro' } } })
    const ids = p.entrada.slots.map((s) => s.id)
    expect(new Set(ids).size).toBe(2)
    expect(p.coresDeOrigem['cor-2']).toBe('#000000')
    expect(Object.values(p.coresDeOrigem).sort()).toEqual(['#000000', '#ffffff'])
    const idDoBranco = Object.entries(p.coresDeOrigem).find(([, c]) => c === '#ffffff')![0]
    expect(idDoBranco).not.toBe('cor-2')
    expect(new Set(partes(p).map((x) => x.slot))).toEqual(new Set(['cor-2', idDoBranco]))
    expect(p.pendencias.filter((x) => x.startsWith('papel'))).toEqual([`papel da marca da cor #ffffff (slot ${idDoBranco})`])
    expect(p.entrada.slots.find((s) => s.id === idDoBranco)).not.toHaveProperty('papelPadrao')
  })

  it('P2-3: raio omitido herda o DECLARADO do outro eixo, e cada eixo é limitado depois', () => {
    // 10 × 100 com rx 20: rx limitado a 5, ry herda 20 (não o 5 já limitado)
    expect(ds(ok(svg('<rect width="10" height="100" rx="20" fill="#000"/>', '0 0 10 100')))[0]).toContain(' 10 20 L10 80 ')
    // 100 × 10 com ry 20: ry limitado a 5, rx herda 20
    expect(ds(ok(svg('<rect width="100" height="10" ry="20" fill="#000"/>', '0 0 100 10')))[0]).toMatch(/^M20 0 L80 0 C.* 100 5 L100 5 /)
    // os dois declarados seguem independentes
    expect(ds(ok(svg('<rect width="10" height="100" rx="20" ry="30" fill="#000"/>', '0 0 10 100')))[0]).toContain(' 10 30 L10 70 ')
  })

  it.each([
    ['viewBox com ponto colado', svg('<rect width="1" height="1"/>', '0 0 10.5.5'), 'VIEWBOX_INVALIDO'],
    ['viewBox com sinal colado', svg('<rect width="1" height="1"/>', '0 0 10-5 5'), 'VIEWBOX_INVALIDO'],
    ['translate com ponto colado', svg('<rect transform="translate(1.2.3)" width="1" height="1"/>'), 'TRANSFORM_INVALIDO'],
    ['scale com sinal colado', svg('<rect transform="scale(2-1)" width="1" height="1"/>'), 'TRANSFORM_INVALIDO'],
    ['matrix com ponto colado', svg('<rect transform="matrix(1 0 0 1 .5.5 0)" width="1" height="1"/>'), 'TRANSFORM_INVALIDO'],
    ['points com ponto colado', svg('<polygon points="0,0 10.5.5 1 1"/>'), 'GEOMETRIA_INVALIDA'],
    ['points com sinal colado', svg('<polygon points="0,0 10-5 1 1"/>'), 'GEOMETRIA_INVALIDA'],
  ])('P2-4: lista numérica recusa token colado (%s)', (_n, fonte, codigo) => expect(recusa(fonte)).toBe(codigo))

  it('P2-4: listas com vírgula, espaços, sinais e expoentes SEPARADOS seguem aceitas; o d compacto também', () => {
    const p = ok(svg('<polygon points=" 0,0 , 10 -5,+1e1 1E1 " fill="#000"/><rect transform="translate( -1e1 , +20 ) scale(.5,2)" width="10" height="10" fill="#111"/><path d="M0 0l10-5.5.5.5" stroke="#222" fill="none"/>', ' 0,0,100 , 1e2 '))
    expect(p.entrada.pathViewBox).toEqual([0, 0, 100, 100])
    expect(ds(p)).toEqual(['M0 0 L10 -5 L10 10 Z', 'M-10 20 L-5 20 L-5 40 L-10 40 Z', 'M0 0 L10 -5.5 L10.5 -5'])
  })
})

describe('importarSvg — recusas', () => {
  const r = (corpo: string) => recusa(svg(corpo))
  it.each([
    ['sem fechar', `<svg ${NS} viewBox="0 0 1 1"><rect/>`, 'XML_MALFORMADO'],
    ['fechamento trocado', `<svg ${NS} viewBox="0 0 1 1"><g></rect></svg>`, 'XML_MALFORMADO'],
    ['atributo sem aspas', `<svg ${NS} viewBox=0></svg>`, 'XML_MALFORMADO'],
    ['< no atributo', `<svg ${NS} viewBox="0<1"></svg>`, 'XML_MALFORMADO'],
    ['dois elementos raiz', `${svg('')}<svg/>`, 'XML_MALFORMADO'],
    ['atributos colados', `<svg ${NS} viewBox="0 0 1 1"fill="#000"></svg>`, 'XML_MALFORMADO'],
    ['-- em comentário', `<!-- a -- b -->${svg('')}`, 'XML_MALFORMADO'],
    ['controle proibido', svg('\u0001'), 'XML_MALFORMADO'],
    ['atributo duplicado', `<svg ${NS} viewBox="0 0 1 1" viewBox="0 0 2 2"></svg>`, 'ATRIBUTO_DUPLICADO'],
    ['DOCTYPE com entidade externa (XXE)', `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg ${NS} viewBox="0 0 1 1">&x;</svg>`, 'DOCTYPE_RECUSADO'],
    ['entidade não declarada', `<svg ${NS} viewBox="0 0 1 1" fill="&x;"></svg>`, 'ENTIDADE_RECUSADA'],
    ['CDATA', `<svg ${NS} viewBox="0 0 1 1"><![CDATA[x]]></svg>`, 'CDATA_RECUSADO'],
    ['instrução de processamento', `<?xml-stylesheet href="a.css"?>${svg('')}`, 'INSTRUCAO_RECUSADA'],
    ['codificação latin-1', `<?xml version="1.0" encoding="ISO-8859-1"?>${svg('')}`, 'CODIFICACAO_RECUSADA'],
    ['texto solto', svg('oi'), 'TEXTO_RECUSADO'],
    ['sem xmlns', '<svg viewBox="0 0 1 1"></svg>', 'NAMESPACE_RECUSADO'],
    ['xmlns errado', '<svg xmlns="http://example.com/svg" viewBox="0 0 1 1"></svg>', 'NAMESPACE_RECUSADO'],
    ['xmlns:xlink', `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"></svg>`, 'NAMESPACE_RECUSADO'],
    ['xlink:href', svg('<path xlink:href="https://x/a.svg" d="M0 0 L1 1"/>'), 'NAMESPACE_RECUSADO'],
    ['elemento prefixado', svg('<inkscape:g/>'), 'NAMESPACE_RECUSADO'],
    ['raiz não é svg', `<g ${NS}/>`, 'ELEMENTO_RECUSADO'],
  ])('XML: %s', (_n, fonte, codigo) => expect(recusa(fonte)).toBe(codigo))

  it.each([
    ['script', '<script>alert(1)</script>', 'ELEMENTO_RECUSADO'],
    ['foreignObject', '<foreignObject width="1" height="1"/>', 'ELEMENTO_RECUSADO'],
    ['use local', '<use href="#a"/>', 'ELEMENTO_RECUSADO'],
    ['image', '<image href="https://x/a.png"/>', 'ELEMENTO_RECUSADO'],
    ['style com @import', '<style>@import url(https://x/a.css);</style>', 'ELEMENTO_RECUSADO'],
    ['gradiente', '<linearGradient/>', 'ELEMENTO_RECUSADO'],
    ['animate', '<rect width="1" height="1"><animate/></rect>', 'ELEMENTO_RECUSADO'],
    ['filho em forma permitida', '<rect width="1" height="1"><rect/></rect>', 'ELEMENTO_RECUSADO'],
    ['svg aninhado', '<svg viewBox="0 0 1 1"/>', 'SVG_ANINHADO'],
    ['onload', '<rect onload="alert(1)" width="1" height="1"/>', 'ATRIBUTO_RECUSADO'],
    ['href', '<path href="https://x" d="M0 0 L1 1"/>', 'ATRIBUTO_RECUSADO'],
    ['style attr', '<rect style="fill:red" width="1" height="1"/>', 'ATRIBUTO_RECUSADO'],
    ['class', '<rect class="a" width="1" height="1"/>', 'ATRIBUTO_RECUSADO'],
    ['id', '<rect id="a" width="1" height="1"/>', 'ATRIBUTO_RECUSADO'],
    ['atributo de outro elemento', '<rect d="M0 0" width="1" height="1"/>', 'ATRIBUTO_RECUSADO'],
    ['stroke-linejoin', '<path d="M0 0 L1 1" stroke="#000" stroke-linejoin="miter"/>', 'ATRIBUTO_RECUSADO'],
    ['fill-rule desconhecido', '<rect fill-rule="inherit" width="1" height="1"/>', 'ATRIBUTO_RECUSADO'],
    ['fill url(#g)', '<rect fill="url(#g)" width="1" height="1"/>', 'COR_RECUSADA'],
    ['cor por nome', '<rect fill="red" width="1" height="1"/>', 'COR_RECUSADA'],
    ['rgb()', '<rect fill="rgb(0,0,0)" width="1" height="1"/>', 'COR_RECUSADA'],
    ['currentColor', '<rect fill="currentColor" width="1" height="1"/>', 'COR_RECUSADA'],
    ['#rgba', '<rect fill="#0008" width="1" height="1"/>', 'COR_RECUSADA'],
    ['opacity 0.5', '<rect opacity="0.5" width="1" height="1"/>', 'OPACIDADE_NAO_REPRESENTAVEL'],
    ['opacity no grupo', '<g opacity=".9"><rect width="1" height="1"/></g>', 'OPACIDADE_NAO_REPRESENTAVEL'],
    ['stroke-width em %', '<path d="M0 0 L1 1" stroke="#000" stroke-width="5%"/>', 'GEOMETRIA_INVALIDA'],
    ['stroke-width negativo', '<path d="M0 0 L1 1" stroke="#000" stroke-width="-1"/>', 'ESPESSURA_INVALIDA'],
    ['espessuras diferentes', '<path d="M0 0 L1 1" stroke="#000" stroke-width="2" fill="none"/><path d="M0 2 L1 3" stroke="#000" stroke-width="3" fill="none"/>', 'ESPESSURAS_DIFERENTES'],
    ['contorno sob escala não uniforme', '<path transform="scale(2 1)" d="M0 0 L1 1" stroke="#000" fill="none"/>', 'TRANSFORM_NAO_UNIFORME_NO_CONTORNO'],
    ['contorno sob skew', '<path transform="skewX(20)" d="M0 0 L1 1" stroke="#000" fill="none"/>', 'TRANSFORM_NAO_UNIFORME_NO_CONTORNO'],
    ['transform singular', '<rect transform="scale(0)" width="1" height="1"/>', 'TRANSFORM_INVALIDO'],
    ['transform fora da gramática', '<rect transform="rotate(1,2)" width="1" height="1"/>', 'TRANSFORM_INVALIDO'],
    ['transform com vírgula no fim', '<rect transform="scale(2)," width="1" height="1"/>', 'TRANSFORM_INVALIDO'],
    ['multicor só de contornos', '<path d="M0 0 L1 1" stroke="#000" fill="none"/><path d="M0 2 L1 3" stroke="#111" fill="none"/>', 'SILHUETA_SEM_PREENCHIMENTO'],
    ['nada desenhado', '<g/>', 'SEM_DESENHO'],
    ['polyline ímpar', '<polyline points="0 0 1" stroke="#000" fill="none"/>', 'GEOMETRIA_INVALIDA'],
    ['polygon de um ponto', '<polygon points="0 0"/>', 'GEOMETRIA_INVALIDA'],
    ['rect negativo', '<rect width="-1" height="1"/>', 'GEOMETRIA_INVALIDA'],
    ['rect sem height', '<rect width="1"/>', 'GEOMETRIA_INVALIDA'],
    ['unidade', '<rect width="1em" height="1"/>', 'GEOMETRIA_INVALIDA'],
  ])('allowlist e fidelidade: %s', (_n, corpo, codigo) => expect(r(corpo)).toBe(codigo))

  it('transform na raiz recusa', () => expect(recusa(svg('<rect width="1" height="1"/>', '0 0 1 1', ' transform="scale(2)"'))).toBe('ATRIBUTO_RECUSADO'))

  it.each([
    ['começa sem M', 'L0 0 1 1'],
    ['vírgula no fim', 'M0 0 L1 1,'],
    ['vírgula depois do comando', 'M,0 0 L1 1'],
    ['vírgulas duplas', 'M0,,0 L1 1'],
    ['argumentos faltando', 'M0 0 L1'],
    ['comando desconhecido', 'M0 0 X1 1'],
    ['número depois de Z', 'M0 0 L1 1 Z 2 2'],
    ['flag 2', 'M0 0 A5 5 0 2 1 10 10'],
    ['número não finito', 'M0 0 L1e999 1'],
  ])('path (gramática SVG; erro recusa, nunca desenha pela metade): %s', (_n, d) => expect(r(`<path d="${d}" stroke="#000" fill="none"/>`)).toBe('PATH_INVALIDO'))

  it('UTF-8 inválido e profundidade acima de 32 recusam', () => {
    expect(recusa(new Uint8Array([...new TextEncoder().encode(svg('')), 0xff]))).toBe('CODIFICACAO_RECUSADA')
    expect(recusa(svg(`${'<g>'.repeat(33)}${'</g>'.repeat(33)}`))).toBe('XML_PROFUNDO_DEMAIS')
  })

  it('curadoria inválida recusa: cor fora do SVG, papel desconhecido, slot repetido, categoria', () => {
    const f = svg('<rect width="1" height="1" fill="#000"/><rect x="2" width="1" height="1" fill="#fff"/>')
    expect(recusa(f, { slots: { '#123': { id: 'a', papelPadrao: 'escuro' } } })).toBe('CURADORIA_INVALIDA')
    expect(recusa(f, { slots: { '#000': { id: 'a', papelPadrao: 'roxo' as never } } })).toBe('CURADORIA_INVALIDA')
    expect(recusa(f, { slots: { '#000': { id: 'a', papelPadrao: 'escuro' }, '#fff': { id: 'a', papelPadrao: 'claro' } } })).toBe('CURADORIA_INVALIDA')
    expect(recusa(f, { slots: { '#000': { id: 'com espaço', papelPadrao: 'escuro' } } })).toBe('CURADORIA_INVALIDA')
    expect(recusa(f, { category: 'basicas' as never })).toBe('CURADORIA_INVALIDA')
  })
})
