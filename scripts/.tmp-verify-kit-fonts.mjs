import { readFileSync } from 'node:fs'
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'

function parseFont(path) {
  const buf = readFileSync(path)
  const numTables = buf.readUInt16BE(4)
  const tables = {}
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16
    const tag = buf.toString('ascii', off, off + 4)
    tables[tag] = { offset: buf.readUInt32BE(off + 8), length: buf.readUInt32BE(off + 12) }
  }
  const os2 = tables['OS/2']
  const weight = os2 ? buf.readUInt16BE(os2.offset + 4) : null
  // name table: family (1), subfamily (2), typographic family (16)
  let family = null, subfamily = null
  const name = tables['name']
  if (name) {
    const count = buf.readUInt16BE(name.offset + 2)
    const strOff = name.offset + buf.readUInt16BE(name.offset + 4)
    for (let i = 0; i < count; i++) {
      const rec = name.offset + 6 + i * 12
      const nameId = buf.readUInt16BE(rec + 6)
      const len = buf.readUInt16BE(rec + 8)
      const off2 = strOff + buf.readUInt16BE(rec + 10)
      if (nameId === 1 || nameId === 2 || nameId === 16 || nameId === 17) {
        const raw = buf.slice(off2, off2 + len)
        // UTF-16BE (platform 3) ou ASCII
        const text = raw.length && raw[0] === 0 ? raw.toString('utf16le').split('').map((_, i2, a) => a[i2]).join('') : raw.toString('latin1')
        const decoded = raw[0] === 0 ? Buffer.from(raw).swap16().toString('utf16le') : text
        if (nameId === 1 && !family) family = decoded
        if (nameId === 16) family = decoded
        if (nameId === 2 && !subfamily) subfamily = decoded
        if (nameId === 17) subfamily = decoded
      }
    }
  }
  const isVariable = 'fvar' in tables
  return { weight, family, subfamily, isVariable }
}

const DIR='/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/1fd3daa2-f200-4878-a35a-a2a70bc9f884/scratchpad/fonts/'
const files = [
  ['Bevan-Regular.ttf', 'KitBevan'],
  ['BarlowCondensed-Regular.ttf', 'KitBC400'],
  ['BarlowCondensed-SemiBold.ttf', 'KitBC600'],
  ['Caveat-SemiBold.ttf', 'KitCaveat600'],
]

for (const [file, alias] of files) {
  const info = parseFont(DIR + file)
  const ok = GlobalFonts.registerFromPath(DIR + file, alias)
  console.log(`${file}: family="${info.family}" subfamily="${info.subfamily}" usWeightClass=${info.weight} variable=${info.isVariable} registered=${ok}`)
}

// Prova de peso: medir o mesmo texto nas duas Barlow — SemiBold deve ser mais larga
const canvas = createCanvas(600, 100)
const ctx = canvas.getContext('2d')
ctx.font = '48px KitBC400'
const w400 = ctx.measureText('Espeto Gaúcho 18h30').width
ctx.font = '48px KitBC600'
const w600 = ctx.measureText('Espeto Gaúcho 18h30').width
console.log(`Barlow 400 width=${w400.toFixed(1)} | 600 width=${w600.toFixed(1)} | diff=${(w600 - w400).toFixed(1)} (deve ser > 0)`)

ctx.font = '48px KitBevan'
console.log('Bevan measure:', ctx.measureText('ESPETO').width.toFixed(1))
ctx.font = '48px KitCaveat600'
console.log('Caveat600 measure:', ctx.measureText('bom demais').width.toFixed(1))
