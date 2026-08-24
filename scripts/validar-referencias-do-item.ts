/**
 * Prova do contrato de referências do ItemDePlano (23/08/2026) — módulo PURO,
 * sem banco, sem rede, sem custo.
 *
 *   npx tsx scripts/validar-referencias-do-item.ts
 *
 * O que está em jogo: a validação dos tetos (1 cena + 3 âncoras + 2 estilo),
 * a leitura DEFENSIVA da coluna Json (linha antiga/lixo → nunca erro), o
 * espelho derivado da cena e a decisão de geração com a lista presente.
 */
import {
  cenaDasReferencias,
  decidirGeracao,
  ehRecusa,
  lerReferenciasDoItem,
  validarReferencias,
} from '../src/lib/planos/execucao'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✓ ${nome}`)
  else {
    falhas++
    console.error(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

console.log('\nvalidarReferencias')
{
  const cheia = validarReferencias([
    { role: 'subject', driveFileId: 'a' },
    { role: 'anchor-ambient', driveFileId: 'b' },
    { role: 'anchor-dish', driveFileId: 'c' },
    { role: 'style', url: 'https://x.blob.vercel-storage.com/s.jpg', label: 'clima' },
  ])
  ok('lista completa válida passa', cheia.ok && cheia.referencias.length === 4)

  ok('2 cenas recusa', !validarReferencias([{ role: 'subject', driveFileId: 'a' }, { role: 'subject', driveFileId: 'b' }]).ok)
  ok(
    '4 âncoras recusa',
    !validarReferencias([
      { role: 'anchor-ambient', driveFileId: 'a' },
      { role: 'anchor-ambient', driveFileId: 'b' },
      { role: 'anchor-dish', driveFileId: 'c' },
      { role: 'anchor-dish', driveFileId: 'd' },
    ]).ok,
  )
  ok('3 estilos recusa', !validarReferencias([
    { role: 'style', driveFileId: 'a' },
    { role: 'style', driveFileId: 'b' },
    { role: 'style', driveFileId: 'c' },
  ]).ok)
  ok('url E driveFileId juntos recusa', !validarReferencias([{ role: 'subject', driveFileId: 'a', url: 'https://x/b.jpg' }]).ok)
  ok('sem endereço nenhum recusa', !validarReferencias([{ role: 'subject' }]).ok)
  ok('papel desconhecido recusa', !validarReferencias([{ role: 'logo-gigante', driveFileId: 'a' }]).ok)
  ok('ausente = lista vazia ok', validarReferencias(undefined).ok && validarReferencias(undefined).referencias.length === 0)
}

console.log('\nlerReferenciasDoItem (defensivo)')
{
  ok('não-lista vira []', lerReferenciasDoItem('lixo').length === 0 && lerReferenciasDoItem(null).length === 0)
  const mista = lerReferenciasDoItem([
    { role: 'subject', driveFileId: 'a' },
    { role: 'inventado', driveFileId: 'b' },
    { role: 'style', url: 'https://x/c.jpg' },
  ])
  ok('item quebrado é filtrado sem derrubar os bons', mista.length === 2 && mista[0].role === 'subject' && mista[1].role === 'style')
}

console.log('\ncenaDasReferencias')
{
  const cena = cenaDasReferencias([
    { role: 'anchor-ambient', driveFileId: 'amb' },
    { role: 'subject', driveFileId: 'prato' },
  ])
  ok('a cena é o subject, não a primeira', cena?.driveFileId === 'prato')
  ok('sem subject, a primeira serve', cenaDasReferencias([{ role: 'style', driveFileId: 's' }])?.driveFileId === 's')
}

console.log('\ndecidirGeracao com a lista')
{
  const soAncoras = decidirGeracao({
    tema: 'promoção',
    copyProposta: ['Headline'],
    // Espelho preenchido de propósito: com lista presente, a cena tem de estar NELA.
    fotoDriveId: 'espelho-velho',
    referencias: [{ role: 'anchor-ambient', driveFileId: 'amb' }],
  })
  ok('copy + lista SEM cena recusa (o espelho não a salva)', ehRecusa(soAncoras))

  const arte = decidirGeracao({
    tema: 'promoção',
    copyProposta: ['Headline'],
    referencias: [
      { role: 'subject', driveFileId: 'prato' },
      { role: 'style', url: 'https://x/clima.jpg' },
    ],
  })
  ok(
    'copy + cena → trilha arte com a lista inteira',
    !ehRecusa(arte) && arte.trilha === 'arte' && arte.referencias?.length === 2,
  )

  const cena = decidirGeracao({
    tema: 'salão à noite',
    referencias: [{ role: 'subject', driveFileId: 'salao' }],
  })
  ok(
    'sem copy → trilha imagem e a cena vira âncora de ambiente',
    !ehRecusa(cena) && cena.trilha === 'imagem' && cena.referencias?.[0]?.role === 'anchor-ambient',
  )

  const antigo = decidirGeracao({ tema: 'promoção', copyProposta: ['H'], fotoDriveId: 'foto' })
  ok('item antigo sem lista mantém o caminho do espelho', !ehRecusa(antigo) && antigo.referencias === null)
}

console.log('\npapel documento (print colado tal e qual)')
{
  ok('2 documentos recusa', !validarReferencias([
    { role: 'documento', driveFileId: 'a' },
    { role: 'documento', driveFileId: 'b' },
  ]).ok)
  const comPrint = decidirGeracao({
    tema: 'prova social',
    copyProposta: ['Headline'],
    referencias: [
      { role: 'subject', driveFileId: 'salao' },
      { role: 'documento', driveFileId: 'print-avaliacao' },
    ],
  })
  ok(
    'copy + cena + documento → trilha arte com o documento na lista',
    !ehRecusa(comPrint) && comPrint.trilha === 'arte' && comPrint.referencias?.some((r) => r.role === 'documento') === true,
  )
  const semCopy = decidirGeracao({
    tema: 'salão',
    referencias: [
      { role: 'subject', driveFileId: 'salao' },
      { role: 'documento', driveFileId: 'print' },
    ],
  })
  ok('documento SEM copy recusa (a trilha imagem é insumo)', ehRecusa(semCopy))
}

console.log('\nfaixa reservada no prompt')
{
  // Import tardio: o builder é pesado e só este bloco precisa dele.
  const { buildArtePrompt } = require('../src/lib/ai/image-prompt-builder') as typeof import('../src/lib/ai/image-prompt-builder')
  const prompt = buildArtePrompt({
    copy: ['Headline'],
    brand: null,
    refs: [{ role: 'subject' }],
    formato: 'story',
    alturaPx: 1936,
    documentoFaixa: { topoPx: 970, basePx: 1180 },
  })
  ok('o prompt reserva a faixa em pixel', prompt.includes('entre 970px e 1180px'))
  ok('o prompt proíbe desenhar o cartão', prompt.includes('NÃO desenhe você mesmo nenhum cartão'))
  const sem = buildArtePrompt({ copy: ['Headline'], brand: null, refs: [{ role: 'subject' }], formato: 'story', alturaPx: 1936 })
  ok('sem documento o prompt não gasta a seção', !sem.includes('CARTÃO REAL'))

  // O caminho EMBUTIDO (24/08): cartão dentro da foto + recolagem por cima.
  const naCena = buildArtePrompt({
    copy: ['Headline'],
    brand: null,
    refs: [{ role: 'subject' }],
    formato: 'story',
    alturaPx: 1936,
    documentoFaixa: { topoPx: 471, basePx: 681 },
    documentoNaCena: true,
  })
  ok('cartão na cena: o prompt manda MANTER, não criar', naCena.includes('CARTÃO REAL NA FOTO') && naCena.includes('recola o arquivo original'))
  ok('faixa no alto: TODA a copy vai para baixo', naCena.includes('TODA a copy listada neste prompt pousa ABAIXO'))
  const naCenaBaixa = buildArtePrompt({
    copy: ['Headline'],
    brand: null,
    refs: [{ role: 'subject' }],
    formato: 'story',
    alturaPx: 1936,
    documentoFaixa: { topoPx: 970, basePx: 1180 },
    documentoNaCena: true,
  })
  ok('faixa no meio: copy acima e/ou abaixo', naCenaBaixa.includes('acima e/ou abaixo dele'))
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)
