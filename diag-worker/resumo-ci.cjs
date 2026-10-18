/**
 * DIAGNÓSTICO: resumo SANITIZADO do diário (só campos já fechados pelo diario-seguro) e do dmesg (só contagens e nomes de
 * biblioteca/processo). Nada de linha bruta. Uso: node resumo-ci.cjs <diario.jsonl> [dmesg.txt]
 */
const fs = require('node:fs')
const ler = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return null } }
const [LOG, DMESG] = process.argv.slice(2)
const out = ['## Diagnóstico da morte do worker (resumo sanitizado)', '']
const txt = ler(LOG)
if (txt === null) out.push('- diário AUSENTE: inconclusivo (instrumentação não gravou).')
else {
  const ev = txt.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
  const papel = new Map(ev.filter((e) => e.ev === 'spawn').map((e) => [e.filho, e.papel]))
  const workers = ev.filter((e) => e.ev === 'spawn' && e.papel === 'worker-forks').length
  const saidas = ev.filter((e) => e.ev === 'exit' && e.papel === 'worker-forks')
  const grupos = {}
  for (const s of saidas) { const k = `code=${s.code} signal=${s.signal}`; grupos[k] = (grupos[k] || 0) + 1 }
  const abertos = new Map()
  for (const e of ev) {
    if (e.ev === 'it-inicio') abertos.set(`${e.pid}:${e.teste}`, e)
    if (e.ev === 'it-fim') abertos.delete(`${e.pid}:${e.teste}`)
  }
  const pico = new Map()
  let livreMin = Infinity
  for (const e of ev.filter((x) => x.ev === 'mem')) {
    pico.set(e.pid, Math.max(pico.get(e.pid) || 0, e.rssMB))
    livreMin = Math.min(livreMin, e.livreSistemaMB)
  }
  const amostras = [...pico].filter(([pid]) => papel.get(pid) === "worker-forks").map(([, v]) => v)
  const picoWorker = amostras.length ? Math.max(...amostras) : "sem amostra"
  out.push(`- workers do pool forks criados: ${workers}; com linha \`exit\`: ${saidas.length} (sem \`exit\` = inconclusivo)`)
  out.push(`- saídas dos workers: ${Object.entries(grupos).map(([k, n]) => `${k} ×${n}`).join(' · ') || 'nenhuma'}`)
  // R5: SIGTERM não é presumido normal — lista-se todo worker que não saiu com code 0; o SIGTERM com `it` em curso é o suspeito.
  const emCurso = (pid) => [...abertos.values()].filter((e) => e.pid === pid).map((e) => `${e.arquivo}#${e.teste}`)
  const detalhar = saidas.filter((s) => !(s.code === 0 && s.signal === null))
  const anormais = detalhar.filter((s) => s.signal !== 'SIGTERM' || emCurso(s.filho).length > 0)
  out.push(`- saídas ANORMAIS (sinal ≠ SIGTERM, code ≠ 0, ou SIGTERM com it em curso): ${anormais.length}`)
  out.push(`- detalhe de todo worker que não saiu com code 0 (${detalhar.length}):`)
  for (const s of detalhar) {
    const its = emCurso(s.filho)
    out.push(`  - worker ${s.filho}: code=${s.code} signal=${s.signal} vida=${s.vidaMs} ms; it em curso: ${its.join(', ') || 'nenhum registrado'}; pico RSS ${pico.get(s.filho) ?? '?'} MB`)
  }
  out.push(`- it-inicio sem it-fim (todos os processos): ${abertos.size}`)
  out.push(`- pico de RSS por worker: ${picoWorker} MB · menor memória livre do sistema vista: ${livreMin === Infinity ? '?' : livreMin} MB`)
}
const dm = DMESG ? ler(DMESG) : null
if (dm === null) out.push('- dmesg: indisponível (ausência NÃO prova ausência de falha)')
else {
  const oom = [...dm.matchAll(/Killed process \d+ \(([A-Za-z0-9_.-]{1,32})\)/g)].map((m) => m[1])
  const seg = [...dm.matchAll(/segfault at [0-9a-f]+ ip [0-9a-f]+ sp [0-9a-f]+ error \d+ in ([A-Za-z0-9_.+-]{1,64})\[/g)].map((m) => m[1])
  out.push(`- dmesg: OOM-killer ${oom.length} (${[...new Set(oom)].join(', ') || '—'}) · segfault ${(dm.match(/segfault/g) || []).length} (biblioteca: ${[...new Set(seg)].join(', ') || '—'}) · linhas totais ${dm.split('\n').length}`)
}
console.log(out.join('\n'))
