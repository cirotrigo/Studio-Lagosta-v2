/**
 * Confere quem é o instrumental e quem é a voz numa separação do MVSEP.
 *
 * Não toca no banco, não chama a API, não gasta nada — roda com
 * `npx tsx scripts/validar-classificacao-de-stems.ts`.
 *
 * Existe porque trocar os dois arquivos de lugar é o defeito mais caro desta
 * área e sai CALADO: o vídeo publica a faixa com voz achando que é o playback.
 */

import { classificarStems, getFileName } from '@/lib/mvsep/classificar-stems'

const casos: Array<{ nome: string; files: any[]; esperado: { inst: string; voz: string | null } }> = [
  // ---- Forma REAL da API, medida em 22/08/2026 (MelBand Roformer, sep_type 48).
  // Não há campo `name`: quem carrega o nome é `download`, e o instrumental
  // se chama "Other".
  {
    nome: 'REAL: type Vocals + type Other',
    files: [
      { type: 'Vocals', download: 'audio_melroformer_mt_1_vocals.mp3', url: 'https://x/v.mp3' },
      { type: 'Other', download: 'audio_melroformer_mt_1_other.mp3', url: 'https://x/o.mp3' },
    ],
    esperado: { inst: 'audio_melroformer_mt_1_other.mp3', voz: 'audio_melroformer_mt_1_vocals.mp3' },
  },
  {
    nome: 'REAL, ordem invertida pela API',
    files: [
      { type: 'Other', download: 'audio_melroformer_mt_1_other.mp3', url: 'https://x/o.mp3' },
      { type: 'Vocals', download: 'audio_melroformer_mt_1_vocals.mp3', url: 'https://x/v.mp3' },
    ],
    esperado: { inst: 'audio_melroformer_mt_1_other.mp3', voz: 'audio_melroformer_mt_1_vocals.mp3' },
  },
  {
    nome: 'quatro stems: "other" NÃO vira instrumental',
    files: [
      { type: 'Vocals', download: 'v.mp3' },
      { type: 'Drums', download: 'd.mp3' },
      { type: 'Bass', download: 'b.mp3' },
      { type: 'Other', download: 'o.mp3' },
    ],
    esperado: { inst: 'o.mp3', voz: 'v.mp3' },
  },
  {
    nome: 'nomes explícitos, ordem padrão do MVSEP',
    files: [{ name: 'vocals.mp3' }, { name: 'instrumental.mp3' }],
    esperado: { inst: 'instrumental.mp3', voz: 'vocals.mp3' },
  },
  {
    nome: 'ordem invertida',
    files: [{ name: 'instrumental.mp3' }, { name: 'vocals.mp3' }],
    esperado: { inst: 'instrumental.mp3', voz: 'vocals.mp3' },
  },
  {
    nome: 'A ARMADILHA: "no_vocals" contém "vocal"',
    files: [{ name: 'faixa_vocals.mp3' }, { name: 'faixa_no_vocals.mp3' }],
    esperado: { inst: 'faixa_no_vocals.mp3', voz: 'faixa_vocals.mp3' },
  },
  {
    nome: 'só a voz tem nome útil (complemento)',
    files: [{ name: 'saida_1.mp3' }, { name: 'saida_vocals.mp3' }],
    esperado: { inst: 'saida_1.mp3', voz: 'saida_vocals.mp3' },
  },
  {
    nome: 'nenhum nome útil: posição [voz, instrumental]',
    files: [{ name: 'a.mp3' }, { name: 'b.mp3' }],
    esperado: { inst: 'b.mp3', voz: 'a.mp3' },
  },
  {
    nome: 'título da faixa com a palavra "music" não vira instrumental',
    files: [{ name: 'Music Box - vocals.mp3' }, { name: 'Music Box - instrumental.mp3' }],
    esperado: { inst: 'Music Box - instrumental.mp3', voz: 'Music Box - vocals.mp3' },
  },
  {
    nome: 'karaoke como marca de instrumental',
    files: [{ name: 'karaoke.mp3' }, { name: 'voz.mp3' }],
    esperado: { inst: 'karaoke.mp3', voz: 'voz.mp3' },
  },
  {
    nome: 'campo alternativo de nome (filename)',
    files: [{ filename: 'vocals.mp3' }, { filename: 'instrum.mp3' }],
    esperado: { inst: 'instrum.mp3', voz: 'vocals.mp3' },
  },
  {
    nome: 'um arquivo só: instrumental, sem voz',
    files: [{ name: 'instrumental.mp3' }],
    esperado: { inst: 'instrumental.mp3', voz: null },
  },
]

let falhas = 0
for (const caso of casos) {
  const r = classificarStems(caso.files)
  const inst = r.instrumental ? getFileName(r.instrumental) : null
  const voz = r.vocals ? getFileName(r.vocals) : null
  const ok = inst === caso.esperado.inst && voz === caso.esperado.voz
  if (!ok) falhas++
  console.log(`${ok ? '✅' : '❌'} ${caso.nome}`)
  console.log(`   instrumental=${inst} | voz=${voz} | critério: ${r.criterio}`)
  if (!ok) console.log(`   ESPERADO instrumental=${caso.esperado.inst} voz=${caso.esperado.voz}`)
}
console.log(falhas === 0 ? `\n${casos.length}/${casos.length} passaram` : `\n${falhas} FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
