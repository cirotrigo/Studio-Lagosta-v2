import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
const root = resolve('.tmp-medicao-compositor')
const ler = (p) => JSON.parse(readFileSync(p))
const render = ler(`${root}/resultados-render.json`)
const resumo = ler(`${root}/resumo.json`)
const antigo = ler(`${root}/piloto-073a612a/resumo.json`)
const snapshot = ler(`${root}/snapshot.json`)
const real = render.resultados.find((c) => c.id === 1)
assert.equal(real.rodadas.find((r) => r.condicao === 'atual').diagnostico.selecao.decisao, 'baseline')
const norma = (s) => s.replace(/\s+/g, ' ').trim()
const layers = ler(real.alternativa.path + '.layers.json')
for (const b of snapshot.casos.find((c) => c.projeto.id === 1).evidencia.spec.blocos) {
  assert.equal(norma(layers.filter((l) => l.type === 'text' && (l.name === b.papel || b.papel === 'headline' && l.name === 'headline2')).map((l) => l.content).join(' ')), norma(b.linhas.join(' ')))
}
const a = `${root}/1-anterior-0.png`
const b = real.alternativa.path
const labels = Buffer.from('<svg width="744" height="48"><rect width="744" height="48" fill="#171717"/><text x="8" y="30" fill="white" font-family="Arial" font-size="18">A · baseline conservado</text><text x="392" y="30" fill="white" font-family="Arial" font-size="18">B · alternativa para revisão</text></svg>')
await sharp({ create: { width: 744, height: 688, channels: 4, background: '#171717' } }).composite([
  { input: labels, left: 0, top: 0 },
  { input: await sharp(a).resize(360).png().toBuffer(), left: 0, top: 48 },
  { input: await sharp(b).resize(360).png().toBuffer(), left: 384, top: 48 },
]).png().toFile(`${root}/1-opcoes-revisao.png`)
const html = `<!doctype html><meta charset="utf-8"><title>Revisão conservadora</title><style>body{font:17px system-ui;background:#171717;color:white;margin:24px;max-width:1000px}img{max-width:100%;height:auto}a{color:#9edbff}</style><h1>Real: duas opções para revisão</h1><p>A é o padrão conservado. B usa a assinatura clara já existente: menos escurecimento e apoio maior, mas muda a cor do texto e a mancha. Nenhuma aprovação estética automática.</p><img src="${root}/1-opcoes-revisao.png" alt="A baseline e B alternativa clara"><p><a href="${a}">A em 1080px</a> · <a href="${b}">B em 1080px</a></p><h2>TERO: sem alternativa válida</h2><p>Recusa por contraste. Imagem apenas para diagnóstico.</p><img src="${root}/3-comparacao.png" alt="TERO recusado"><h2>Quintal: sem alternativa válida</h2><p>Recusa pela Brahma preservada. Imagem apenas para diagnóstico.</p><img src="${root}/2-comparacao.png" alt="Quintal recusado">`
writeFileSync(`${root}/revisao.html`, html)
const metricas = { captura: render.capturadoEm, regra: 'Default baseline. Opt-in explícito; cor/estrutura diferente exige revisão; empate conserva baseline.', casos: render.resultados.map((c) => {
  const atual = c.rodadas.find((r) => r.condicao === 'atual')
  return { cliente: c.cliente, id: c.id, defaultIdenticoAoHistorico: c.padraoHash === c.rodadas.find((r) => r.condicao === 'anterior').hash, hashDefault: c.padraoHash, tempos: resumo.casos.find((r) => r.id === c.id).condicoes, tempos073a612a: antigo.casos.find((r) => r.id === c.id).condicoes, selecao: atual.diagnostico?.selecao ?? atual.detalhes, alternativa: c.alternativa ? { variante: c.alternativa.variante, motivos: c.alternativa.motivos, path: c.alternativa.path } : null }
}), copyLiteral: { previews: 12, alternativa: 1 }, postgresReexecutado: false }
writeFileSync(resolve('docs/piloto-compositor-2026-09-09/metricas-conservadoras.json'), JSON.stringify(metricas, null, 2))
console.log('Galeria de revisão e métricas conservadoras gravadas; copy da alternativa preservada.')
