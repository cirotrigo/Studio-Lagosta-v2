/**
 * A VARREDURA DA CLASSE "a que bloco pertence esta camada" (PR3-R12-01, revisão
 * FINAL do Codex sobre 927d57b5, 20/09/2026).
 *
 * O vínculo declarado (`metadata.compositor.bloco`, gravado por quem desenha)
 * resolveu a inferência por texto igual, por bloco vazio e por ordem visual —
 * mas nem todo caminho de camada passava por ele: a SEGUNDA VOZ vive numa lista
 * à parte (`voz2`), ficava fora da reserva, e esconder só a primeira voz a
 * jogava para um bloco `extra-…` de função `livre`, onde a leitura seguinte a
 * prendia pelo id. Reexibir não desfazia.
 *
 * Em vez de mais um caso solto, este arquivo trava a classe inteira com UMA
 * invariante executável, no método que fechou o PR 2 (varredura de fronteira):
 *
 * 🔴 **Numa peça com vínculo declarado, esconder QUALQUER subconjunto de
 * camadas e reexibi-las devolve o contrato EXATAMENTE ao que era** — os mesmos
 * ids, na mesma ordem, com as mesmas linhas e o mesmo estilo. Nenhum bloco
 * nasce, nenhum texto muda de dono, nenhuma `extra-…` aparece (nem na leitura
 * com as camadas escondidas: a que sumiu da arte só esvazia o bloco DELA).
 *
 * A peça cobre, de uma vez, os caminhos que decidem dono de camada: papel
 * principal, SEGUNDA VOZ, bloco repartido em duas camadas (serviço), rich text,
 * e o bloco `livre` casado por `vincularExtras` (camada nomeada pelo bloco, sem
 * marca — é o caminho de quem cria camada no editor). Camada de imagem presa ao
 * texto (ícone, filete) entra como controle: ela não é texto e NUNCA vira
 * bloco, esconda-se quem se esconder.
 *
 * Caminho novo que decida dono de camada entra na peça aqui — e a invariante o
 * cobre sozinha.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, type CopyAutoral } from '..'
import { registroDaCopyDaArte } from '../registro-da-arte'

const EM = '2026-09-20T12:00:00.000Z'

function camada(id: string, papel: string | null, y: number, content: string, vinculo?: { bloco: string; linhas: number[] }, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: y,
    content,
    position: { x: 100, y },
    size: { width: 800, height: 60 },
    style: { fontSize: 40 },
    metadata: { compositor: { ...(papel ? { papel } : {}), ...(vinculo ? { bloco: vinculo.bloco, linhas: vinculo.linhas } : {}) } },
    ...extra,
  } as Layer
}

/** O contrato do autor: manchete em duas vozes, apoio em rich text, serviço repartido e uma nota livre. */
const original: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Milk-shake', 'em dobro'], estilo: { linhasNaVoz2: [1] } },
    { id: 'apoio-da-peca', funcao: 'apoio', ordem: 1, linhas: ['Sexta é dia'] },
    { id: 'servico-info', funcao: 'servico', ordem: 2, linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    { id: 'nota', funcao: 'livre', ordem: 3, linhas: ['Sujeito a lotação'] },
  ],
  revisoes: [],
}

/** As camadas como o compositor as desenha, cada uma declarando o bloco e as posições que desenha. */
const PECA: Array<{ nome: string; camada: Layer }> = [
  { nome: 'manchete (voz 1)', camada: camada('headline', 'headline', 200, 'Milk-shake', { bloco: 'manchete', linhas: [0] }) },
  { nome: 'manchete (voz 2)', camada: camada('headline2', 'headline2', 280, 'em dobro', { bloco: 'manchete', linhas: [1] }) },
  { nome: 'apoio (rich text)', camada: camada('apoio', 'apoio', 400, 'Sexta é dia', { bloco: 'apoio-da-peca', linhas: [0] }, { type: 'rich-text' } as Partial<Layer>) },
  { nome: 'serviço (horário)', camada: camada('servico', 'servico', 1600, 'Das 11h às 15h', { bloco: 'servico-info', linhas: [0] }) },
  { nome: 'serviço (endereço)', camada: camada('servico-2', 'servico', 1680, 'Rua Aleixo Netto, 1158', { bloco: 'servico-info', linhas: [1] }) },
  // Sem marca, casada por `vincularExtras` pelo NOME do bloco — é o caminho de
  // quem cria camada no editor.
  { nome: 'nota livre (sem marca)', camada: camada('nota', null, 1800, 'Sujeito a lotação') },
]
/** Controle: o ícone preso ao serviço. Não é texto, e não pode virar bloco nunca. */
const ICONE = { id: 'icone-relogio', name: 'icone-relogio', type: 'image', visible: true, locked: false, order: 1601, position: { x: 60, y: 1600 }, size: { width: 40, height: 40 }, fileUrl: 'https://blob.test/relogio.png', metadata: { compositor: { elementoDe: 'servico' } } } as unknown as Layer

const TODAS = [...PECA.map((p) => p.camada), ICONE]
const ler = (base: CopyAutoral, camadas: Layer[]) => copyEfetivaDasCamadas(base, camadas, { superficie: 'editor', em: EM }).efetiva
const resumo = (c: CopyAutoral) => c.blocos.map((b) => ({ id: b.id, funcao: b.funcao, ordem: b.ordem, linhas: b.linhas, voz2: b.estilo?.linhasNaVoz2 }))

describe('o vínculo declarado vale para TODO caminho de camada (PR3-R12-01)', () => {
  const base = ler(original, TODAS)

  it('a leitura da peça inteira não mexe em nada: os mesmos blocos do autor', () => {
    expect(resumo(base)).toEqual(resumo(original))
    expect(copyEfetivaDasCamadas(original, TODAS, { superficie: 'compositor', em: EM }).mudancas).toEqual([])
  })

  /**
   * 🔴 A RESTAURAÇÃO PARCIAL entre estados SALVOS (PR3-R13-01). A invariante de
   * cima sempre volta direto para TODAS as camadas visíveis, e por isso não
   * enxergava o caso em que uma parte do que foi escondido volta e o resto
   * continua fora: lida a partir do contrato JÁ ESVAZIADO, a camada que volta
   * era reservada pelo vínculo e o bloco saía vazio antes de ela ser
   * incorporada — a arte mostrava o texto e o contrato dizia que não havia.
   *
   * Duas exigências, em toda transição:
   *  1. **o contrato descreve EXATAMENTE o que está visível** — as linhas dos
   *     blocos, juntas, são as linhas das camadas visíveis, juntas;
   *  2. **o caminho não importa**: ler encadeado (base → esconder A → reexibir
   *     B) dá o MESMO contrato que ler o estado final direto da base. É o que
   *     garante que nenhum estado intermediário deixa resíduo.
   */
  it('INVARIANTE: reexibir PARTE do que foi escondido — o contrato descreve o visível, e o caminho não importa', () => {
    const falhas: Array<Record<string, unknown>> = []
    const visiveis = (fora: number) => PECA.filter((_, i) => !((fora >> i) & 1))
    const comEscondidas = (fora: number) => [...PECA.map((p, i) => ((fora >> i) & 1 ? ({ ...p.camada, visible: false } as Layer) : p.camada)), ICONE]
    const linhasVisiveis = (fora: number) => visiveis(fora).flatMap((p) => String(p.camada.content ?? '').split('\n')).sort()
    const linhasDoContrato = (c: CopyAutoral) => c.blocos.flatMap((b) => b.linhas).sort()
    const nomes = (fora: number) => PECA.filter((_, i) => (fora >> i) & 1).map((p) => p.nome)

    for (let a = 1; a < 1 << PECA.length; a++) {
      const estado1 = ler(base, comEscondidas(a))
      // B = o que VOLTA (subconjunto próprio e não vazio de A); o resto de A
      // continua escondido. `b !== a` tira o "voltou tudo", que é a invariante
      // anterior, e `b !== 0` tira o "não voltou nada", que é o mesmo estado.
      for (let b = a & (a - 1); b > 0; b = (b - 1) & a) {
        const fora = a & ~b
        const encadeado = ler(estado1, comEscondidas(fora))
        const direto = ler(base, comEscondidas(fora))
        const descreveOVisivel = JSON.stringify(linhasDoContrato(encadeado)) === JSON.stringify(linhasVisiveis(fora))
        const mesmoCaminho = JSON.stringify(resumo(encadeado)) === JSON.stringify(resumo(direto))
        const idsIguais = JSON.stringify(encadeado.blocos.map((x) => x.id)) === JSON.stringify(base.blocos.map((x) => x.id))
        if (!descreveOVisivel || !mesmoCaminho || !idsIguais) {
          falhas.push({
            escondi: nomes(a),
            reexibi: nomes(a & ~fora),
            aindaEscondidas: nomes(fora),
            contrato: linhasDoContrato(encadeado),
            visivel: linhasVisiveis(fora),
            ...(mesmoCaminho ? {} : { direto: resumo(direto), encadeado: resumo(encadeado) }),
          })
        }
      }
    }
    // 602 transições (todo A não vazio × todo B próprio não vazio dele): a
    // varredura exaustiva É a cobertura de classe, e roda em milissegundos.
    expect(falhas).toEqual([])
  })

  it('o caso que abriu o R13-01, por extenso: esconder as DUAS vozes e reexibir só a segunda', () => {
    const soAVoz1 = TODAS.map((c) => (c.id === 'headline' || c.id === 'headline2' ? ({ ...c, visible: false } as Layer) : c))
    const soAVoz2 = TODAS.map((c) => (c.id === 'headline' ? ({ ...c, visible: false } as Layer) : c))
    // 1. as duas escondidas: a manchete fica vazia, com a lacuna
    const vazia = ler(base, soAVoz1)
    expect(vazia.blocos.find((x) => x.id === 'manchete')!.linhas).toEqual([])
    // 2. volta SÓ a segunda voz: a manchete é a linha que está na arte, na voz 2
    const r = copyEfetivaDasCamadas(vazia, soAVoz2, { superficie: 'editor', em: EM })
    expect(r.efetiva.blocos.find((x) => x.id === 'manchete')).toEqual(
      expect.objectContaining({ id: 'manchete', linhas: ['em dobro'], estilo: { linhasNaVoz2: [0] } }),
    )
    expect(r.mudancas.map((m) => m.id)).toEqual(['manchete'])
    expect(r.efetiva.blocos.some((x) => x.id.startsWith('extra-'))).toBe(false)
    // 3. releitura estável: nada muda de novo
    expect(copyEfetivaDasCamadas(r.efetiva, soAVoz2, { superficie: 'editor', em: EM }).mudancas).toEqual([])

    // 4. e o registro da copy do PNG re-renderizado (a arte que a recomposição
    // grava) diz o mesmo: a imagem nova mostra a segunda voz. Com o contrato
    // VAZIO como base, era ele que declarava o bloco sem texto.
    const { registro } = registroDaCopyDaArte({
      anterior: { original, efetiva: original, comparavel: true },
      contratoDaPagina: vazia,
      camadas: soAVoz2,
      superficie: 'recomposicao',
    })
    expect(registro!.efetiva!.blocos.find((x) => x.id === 'manchete')!.linhas).toEqual(['em dobro'])
    expect(registro!.comparavel).toBe(true)
  })

  it('INVARIANTE: esconder QUALQUER subconjunto e reexibir devolve o contrato ao que era, sem bloco a mais', () => {
    const falhas: Array<Record<string, unknown>> = []
    for (let mascara = 1; mascara < 1 << PECA.length; mascara++) {
      const escondidas = PECA.filter((_, i) => (mascara >> i) & 1).map((p) => p.nome)
      const comOcultas = [...PECA.map((p, i) => ((mascara >> i) & 1 ? ({ ...p.camada, visible: false } as Layer) : p.camada)), ICONE]
      const oculta = ler(base, comOcultas)
      // 1. esconder só esvazia o bloco DA camada escondida — nunca cria bloco,
      //    nunca passa o texto de um bloco para outro.
      const idsIguais = JSON.stringify(oculta.blocos.map((b) => b.id)) === JSON.stringify(base.blocos.map((b) => b.id))
      // 2. reexibir devolve o contrato EXATAMENTE ao que era.
      const volta = ler(oculta, TODAS)
      const voltouIgual = JSON.stringify(resumo(volta)) === JSON.stringify(resumo(base))
      if (!idsIguais || !voltouIgual) falhas.push({ escondidas, idsNaOcultacao: oculta.blocos.map((b) => b.id), aoReexibir: resumo(volta) })
    }
    expect(falhas).toEqual([])
  })

  it('o caso que abriu o achado, por extenso: esconder SÓ a primeira voz', () => {
    const soAVoz2 = TODAS.map((c) => (c.id === 'headline' ? ({ ...c, visible: false } as Layer) : c))
    const oculta = ler(base, soAVoz2)
    const manchete = oculta.blocos.find((b) => b.id === 'manchete')!
    // A manchete continua sendo a manchete, com a linha que está na arte — na voz 2.
    expect(manchete.linhas).toEqual(['em dobro'])
    expect(manchete.estilo?.linhasNaVoz2).toEqual([0])
    expect(oculta.blocos.some((b) => b.id.startsWith('extra-'))).toBe(false)
    expect(oculta.lacunas ?? []).toEqual([])
    // E reexibir restaura o bloco do autor, com a voz 2 no lugar.
    expect(resumo(ler(oculta, TODAS))).toEqual(resumo(base))
  })

  it('a segunda voz vai para o bloco que ela DECLARA, não para a primeira manchete da ordem', () => {
    // Com duas manchetes no contrato, "a primeira `headline2` livre" (a reserva
    // de sempre) daria a voz 2 à manchete de cima. É o caso que separa a
    // RESERVA declarada da ordenação: sem ela, o texto vai para o bloco errado.
    const duasManchetes: CopyAutoral = {
      ...original,
      blocos: [
        { id: 'manchete-de-cima', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia'] },
        { id: 'manchete', funcao: 'headline', ordem: 1, linhas: ['Milk-shake', 'em dobro'], estilo: { linhasNaVoz2: [1] } },
      ],
    }
    const camadas = [
      camada('headline-de-cima', 'headline', 150, 'Sexta é dia', { bloco: 'manchete-de-cima', linhas: [0] }),
      camada('headline', 'headline', 200, 'Milk-shake', { bloco: 'manchete', linhas: [0] }),
      camada('headline2', 'headline2', 280, 'em dobro', { bloco: 'manchete', linhas: [1] }),
    ]
    const r = copyEfetivaDasCamadas(duasManchetes, camadas, { superficie: 'editor', em: EM })
    expect(r.mudancas).toEqual([])
    expect(r.efetiva.blocos.find((b) => b.id === 'manchete-de-cima')!.linhas).toEqual(['Sexta é dia'])
    expect(r.efetiva.blocos.find((b) => b.id === 'manchete')).toEqual(
      expect.objectContaining({ linhas: ['Milk-shake', 'em dobro'], estilo: { linhasNaVoz2: [1] } }),
    )
  })

  it('o ícone preso ao texto nunca vira bloco, com o texto dele visível ou escondido', () => {
    const semServico = TODAS.map((c) => (c.id === 'servico' || c.id === 'servico-2' ? ({ ...c, visible: false } as Layer) : c))
    expect(ler(base, semServico).blocos.map((b) => b.id)).toEqual(base.blocos.map((b) => b.id))
  })

  it('camada que declara bloco INEXISTENTE ou de papel incompatível é descartada, nunca recusa a leitura', () => {
    const forasteiras = [
      ...TODAS,
      camada('intruso', 'apoio', 900, 'De outro contrato', { bloco: 'bloco-que-nao-existe', linhas: [0] }),
      camada('trocado', 'cta', 1000, 'Papel que não é a função do bloco', { bloco: 'servico-info', linhas: [0] }),
    ]
    const r = copyEfetivaDasCamadas(base, forasteiras, { superficie: 'editor', em: EM })
    // As duas viram texto A MAIS declarado (bloco `extra-…` com lacuna), e
    // nenhum bloco do autor perde o que é dele.
    expect(r.efetiva.blocos.filter((b) => b.id.startsWith('extra-')).map((b) => b.linhas)).toEqual([['De outro contrato'], ['Papel que não é a função do bloco']])
    expect(resumo(r.efetiva).slice(0, base.blocos.length)).toEqual(resumo(base))
  })
})
