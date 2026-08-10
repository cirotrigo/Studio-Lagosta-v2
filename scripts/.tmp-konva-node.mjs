/**
 * Frente 4 — protótipo headless: Konva.Text medindo com @napi-rs/canvas.
 *
 * Responde:
 * 1. getHeight() com height auto = fórmula fontSize×linhas×lineHeight+padding×2?
 * 2. medidor manual (cópia de props, como o konva-editable-text faz hoje)
 *    ≡ clone() com height removido?
 * 3. setAttrs({height: undefined}) devolve o nó ao modo auto?
 * 4. com height FIXA o textArr para de quebrar (a armadilha nº 1 da sessão 27)?
 *
 * Uso: node scripts/.tmp-konva-node.mjs
 */
import { createCanvas } from '@napi-rs/canvas'

// ---- shims mínimos p/ o build browser do Konva medir texto em node ----
function fakeCanvas() {
  const c = createCanvas(300, 150)
  c.style = {}
  if (!c.addEventListener) c.addEventListener = () => {}
  return c
}
globalThis.window = globalThis
globalThis.devicePixelRatio = 1
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return fakeCanvas()
    return { style: {}, appendChild: () => {}, addEventListener: () => {} }
  },
  documentElement: { addEventListener: () => {} },
  addEventListener: () => {},
}

const { default: Konva } = await import('konva/lib/index.js')

const PROPS = {
  text: 'Promoção de quarta: crepe de morango com chocolate ao leite',
  width: 400,
  fontSize: 36,
  fontFamily: 'Arial',
  fontStyle: 'normal',
  fontVariant: '400',
  lineHeight: 1.2,
  letterSpacing: 2,
  padding: 6,
  align: 'center',
  wrap: 'word',
}

// 1. altura auto vs fórmula
const auto = new Konva.Text({ ...PROPS })
const linhas = auto.textArr.length
const formula = PROPS.fontSize * linhas * PROPS.lineHeight + PROPS.padding * 2
console.log(`1) height auto=${auto.height()} | linhas=${linhas} | formula=${formula} -> ${auto.height() === formula ? 'IGUAL' : 'DIFERE'}`)

// 2. nó "da tela" com altura fixa + medidor por clone vs medidor manual
const tela = new Konva.Text({ ...PROPS, height: 120 })
const manual = new Konva.Text({
  text: tela.text(),
  width: tela.width(),
  fontSize: tela.fontSize(),
  fontFamily: tela.fontFamily(),
  fontStyle: tela.fontStyle(),
  fontVariant: tela.fontVariant(),
  lineHeight: tela.lineHeight(),
  letterSpacing: tela.letterSpacing(),
  padding: tela.padding(),
  align: tela.align(),
  wrap: tela.wrap(),
})
const clone = tela.clone()
clone.setAttrs({ height: undefined })
console.log(`2) medidor manual=${Math.round(manual.height())} | clone sem height=${Math.round(clone.height())} -> ${Math.round(manual.height()) === Math.round(clone.height()) ? 'IGUAL' : 'DIFERE'}`)

// clone com override no argumento também funciona?
const clone2 = tela.clone({ height: undefined })
console.log(`   clone({height: undefined})=${Math.round(clone2.height())} (${Math.round(clone2.height()) === Math.round(manual.height()) ? 'override respeitado' : 'override IGNORADO — attrs.height persiste'})`)

// 3. setAttrs({height: undefined}) devolve o modo auto num nó que tinha altura?
const volta = new Konva.Text({ ...PROPS, height: 120 })
volta.setAttrs({ height: undefined })
console.log(`3) height após setAttrs undefined=${volta.height()} -> ${volta.height() === formula ? 'voltou ao auto' : 'NÃO voltou (attrs preso)'} `)

// 4. altura fixa para de quebrar? (armadilha nº 1)
console.log(`4) textArr: auto=${auto.textArr.length} linhas | fixa(120px)=${tela.textArr.length} linhas -> ${tela.textArr.length < auto.textArr.length ? 'FIXA TRUNCA (armadilha confirmada)' : 'sem truncar'}`)

// bônus: o clone carrega listeners? (custo/efeitos colaterais)
tela.on('transform', () => {})
const clone3 = tela.clone()
console.log(`5) clone herda listeners? original=${Object.keys(tela.eventListeners).length} clone=${Object.keys(clone3.eventListeners).length}`)
