import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
const root = resolve('.tmp-medicao-compositor')
const snapshot = JSON.parse(readFileSync(`${root}/snapshot.json`))
const render = JSON.parse(readFileSync(`${root}/resultados-render.json`))
const median = (a) => [...a].sort((x,y) => x-y)[Math.floor(a.length/2)]
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const resumo = { captura: snapshot.capturadoEm, bancoMs: snapshot.bancoMs, preparacaoTotalMs: snapshot.preparacaoTotalMs, preparacaoAdicionalRasterMs: snapshot.preparacaoAdicionalRasterMs ?? 0, casos: [] }
let verificacoes = 0
let html = '<!doctype html><meta charset="utf-8"><title>Piloto local de composição</title><style>body{font:16px system-ui;background:#171717;color:white;margin:24px}section{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}img{width:360px;max-width:100%;height:auto}figcaption{width:360px;padding:12px 0}a{color:#9edbff}</style><h1>Piloto local · TERO, Quintal, Real</h1><p>Esquerda: baseline. Direita: atual; quando recusado, apenas prévia de diagnóstico. Nenhuma peça aprovada ou publicada.</p>'
for (const c of render.resultados) {
  const original = snapshot.casos.find((x) => x.projeto.id === c.id)
  for (const r of c.rodadas.filter((r) => r.status === 'preview')) {
    const layers = JSON.parse(readFileSync(r.path+'.layers.json'))
    for (const bloco of original.evidencia.spec.blocos) {
      const textos = layers.filter((l) => l.type === 'text' && (l.name === bloco.papel || (bloco.papel === 'headline' && l.name === 'headline2')))
      assert.equal(norm(textos.map((l)=>l.content).join(' ')), norm(bloco.linhas.join(' ')))
    }
    verificacoes++
  }
  const antes = c.rodadas.find((r)=>r.condicao==='anterior' && r.status==='preview')
  const depois = c.rodadas.find((r)=>r.condicao==='atual' && r.status==='preview')
  const paths = [antes.path, depois?.path ?? c.previewDiagnostico]
  html += `<h2>${c.cliente}</h2><section>`
  for (let i=0;i<paths.length;i++) {
    const phone = resolve(root, `${c.id}-celular-${i}.png`)
    await sharp(paths[i]).resize(360).png().toFile(phone)
    html += `<figure><a href="${paths[i]}"><img src="${phone}" alt="${c.cliente} ${i?'atual':'anterior'}"></a><figcaption>${i ? (depois ? 'Atual · revisão humana pendente' : 'Atual · RECUSADO, diagnóstico somente') : 'Baseline anterior'}</figcaption></figure>`
  }
  html += '</section>'
  const labels = Buffer.from(`<svg width="744" height="48"><rect width="744" height="48" fill="#171717"/><text x="8" y="30" fill="white" font-family="Arial" font-size="20">Anterior</text><text x="392" y="30" fill="white" font-family="Arial" font-size="20">${depois ? 'Atual · revisão pendente' : 'Atual · RECUSADA'}</text></svg>`)
  await sharp({ create: { width: 744, height: 688, channels: 4, background: '#171717' } }).composite([
    { input: labels, left: 0, top: 0 },
    { input: `${root}/${c.id}-celular-0.png`, left: 0, top: 48 },
    { input: `${root}/${c.id}-celular-1.png`, left: 384, top: 48 },
  ]).png().toFile(`${root}/${c.id}-comparacao.png`)
  resumo.casos.push({ cliente:c.cliente,id:c.id,preparacaoMs:c.preparacaoMs, fotoHash:snapshot.hashes[original.evidencia.spec.fotoDriveId], assinaturaHistorica:original.historica.fieldValues.composicao.assinatura.pageId, paginasAtualizadasAntesDoEnsaio:c.paginas.every((p)=>p.updatedAt<original.historica.createdAt), condicoes:['anterior','atual'].map((condicao)=>{const rs=c.rodadas.filter((r)=>r.condicao===condicao);return {condicao,ms:rs.map((r)=>r.ms),medianaMs:median(rs.map((r)=>r.ms)),status:rs[0].status,hashes:[...new Set(rs.map((r)=>r.hash).filter(Boolean))]}}), previews:paths })
}
resumo.previewsComCopyLiteralPreservada = verificacoes
writeFileSync(`${root}/resumo.json`, JSON.stringify(resumo,null,2))
writeFileSync(`${root}/galeria.html`,html)
console.log(`${verificacoes} previews com copy literal preservada; galeria e miniaturas de 360px gravadas.`)
