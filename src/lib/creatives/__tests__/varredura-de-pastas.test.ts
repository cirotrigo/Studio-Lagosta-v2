import { describe, it, expect } from 'vitest'
import {
  PASTAS_POR_CONSULTA,
  consultasDeFilhos,
  varrerArvoreDePastas,
  type ItemDoDrive,
} from '../varredura-de-pastas'

type No = { pastas?: string[]; arquivos?: Array<string | ItemDoDrive> }

/** Drive de mentira: o nome de cada item é o próprio id, e a mãe é a pasta em que ele está. */
function driveFalso(arvore: Record<string, No>) {
  const chamadas = { arquivos: 0, subpastas: 0 }
  const filhos = (pais: string[], tipo: 'pastas' | 'arquivos'): ItemDoDrive[] =>
    pais.flatMap((pai) =>
      (arvore[pai]?.[tipo] ?? []).map((item) =>
        typeof item === 'string' ? { id: item, name: item, parents: [pai] } : item,
      ),
    )
  return {
    chamadas,
    listarArquivos: async (pais: string[]) => {
      chamadas.arquivos++
      return filhos(pais, 'arquivos')
    },
    listarSubpastas: async (pais: string[]) => {
      chamadas.subpastas++
      return filhos(pais, 'pastas')
    },
  }
}

const caminhos = (r: { arquivos: Array<{ arquivo: ItemDoDrive; pasta: string }> }) =>
  Object.fromEntries(r.arquivos.map((a) => [a.arquivo.id, a.pasta]))

describe('varrerArvoreDePastas', () => {
  it('desce todos os níveis e grava o caminho relativo, como o catálogo', async () => {
    // A forma do acervo do TERO: nada solto no 07_ambiente, tudo em subpasta.
    const drive = driveFalso({
      raiz: { pastas: ['07_ambiente', '09_hh', '01_parrilla'], arquivos: ['solta.jpg'] },
      '07_ambiente': { pastas: ['salao', 'fachada'] },
      salao: { arquivos: ['salao-1.jpg', 'salao-2.jpg'] },
      fachada: { arquivos: ['fachada-1.jpg'] },
      '09_hh': { arquivos: ['hh-1.jpg'] },
      '01_parrilla': { pastas: ['grelhados'] },
      grelhados: { pastas: ['01-salao-claro'] },
      '01-salao-claro': { arquivos: ['t-bone.jpg'] },
    })

    const r = await varrerArvoreDePastas({ raiz: 'raiz', profundidadeMaxima: 10, maxPastas: 100, ...drive })

    expect(caminhos(r)).toEqual({
      'solta.jpg': '',
      'salao-1.jpg': '07_ambiente/salao',
      'salao-2.jpg': '07_ambiente/salao',
      'fachada-1.jpg': '07_ambiente/fachada',
      'hh-1.jpg': '09_hh',
      't-bone.jpg': '01_parrilla/grelhados/01-salao-claro',
    })
    expect(r.parcial).toBe(false)
    expect(r.pastasVisitadas).toBe(8)
  })

  it('consulta por NÍVEL, não por pasta', async () => {
    const pastas = Array.from({ length: 45 }, (_, i) => `p${i}`)
    const arvore: Record<string, No> = { raiz: { pastas } }
    for (const p of pastas) arvore[p] = { arquivos: [`${p}.jpg`] }
    const drive = driveFalso(arvore)

    const r = await varrerArvoreDePastas({ raiz: 'raiz', profundidadeMaxima: 10, maxPastas: 100, ...drive })

    expect(r.arquivos).toHaveLength(45)
    // Raiz + um nível com 45 pastas: duas chamadas de cada tipo, não 46.
    expect(drive.chamadas).toEqual({ arquivos: 2, subpastas: 2 })
  })

  it('marca parcial quando sobra pasta além da profundidade', async () => {
    const arvore = {
      raiz: { pastas: ['a'] },
      a: { pastas: ['b'], arquivos: ['a.jpg'] },
      b: { arquivos: ['b.jpg'] },
    }

    const rasa = await varrerArvoreDePastas({ raiz: 'raiz', profundidadeMaxima: 1, maxPastas: 100, ...driveFalso(arvore) })
    expect(caminhos(rasa)).toEqual({ 'a.jpg': 'a' })
    expect(rasa.parcial).toBe(true)

    const funda = await varrerArvoreDePastas({ raiz: 'raiz', profundidadeMaxima: 2, maxPastas: 100, ...driveFalso(arvore) })
    expect(caminhos(funda)).toEqual({ 'a.jpg': 'a', 'b.jpg': 'a/b' })
    expect(funda.parcial).toBe(false)
  })

  it('marca parcial quando o teto de pastas corta a varredura', async () => {
    const drive = driveFalso({ raiz: { pastas: ['a', 'b', 'c'] }, a: { arquivos: ['a.jpg'] } })

    const r = await varrerArvoreDePastas({ raiz: 'raiz', profundidadeMaxima: 10, maxPastas: 2, ...drive })

    expect(r.pastasVisitadas).toBe(2)
    expect(r.parcial).toBe(true)
  })

  it('arquivo com duas mães aparece uma vez só', async () => {
    const duplo = { id: 'duplo.jpg', name: 'duplo.jpg', parents: ['a', 'b'] }
    const drive = driveFalso({ raiz: { pastas: ['a', 'b'] }, a: { arquivos: [duplo] }, b: { arquivos: [duplo] } })

    const r = await varrerArvoreDePastas({ raiz: 'raiz', profundidadeMaxima: 10, maxPastas: 100, ...drive })

    expect(r.arquivos).toHaveLength(1)
    expect(r.arquivos[0].pasta).toBe('a')
  })

  it('não entra em ciclo nem visita a mesma pasta duas vezes', async () => {
    const drive = driveFalso({
      raiz: { pastas: ['a'] },
      a: { pastas: ['raiz', 'a'], arquivos: ['a.jpg'] },
    })

    const r = await varrerArvoreDePastas({ raiz: 'raiz', profundidadeMaxima: 10, maxPastas: 100, ...drive })

    expect(caminhos(r)).toEqual({ 'a.jpg': 'a' })
    expect(r.parcial).toBe(false)
  })

  it('sem "parents", atribui quando o lote tem uma pasta só e falha alto quando tem várias', async () => {
    const semMae = (id: string) => ({ id, name: id })

    const uma = await varrerArvoreDePastas({
      raiz: 'raiz',
      profundidadeMaxima: 0,
      maxPastas: 100,
      listarArquivos: async () => [semMae('x.jpg')],
      listarSubpastas: async () => [],
    })
    expect(caminhos(uma)).toEqual({ 'x.jpg': '' })

    await expect(
      varrerArvoreDePastas({
        raiz: 'raiz',
        profundidadeMaxima: 10,
        maxPastas: 100,
        listarArquivos: async (pais) => (pais.length > 1 ? [semMae('y.jpg')] : []),
        listarSubpastas: async (pais) =>
          pais[0] === 'raiz' ? [{ id: 'a', name: 'a', parents: ['raiz'] }, { id: 'b', name: 'b', parents: ['raiz'] }] : [],
      }),
    ).rejects.toThrow('parents')
  })
})

describe('consultasDeFilhos', () => {
  it('divide em lotes de PASTAS_POR_CONSULTA', () => {
    const pastas = Array.from({ length: PASTAS_POR_CONSULTA * 2 + 5 }, (_, i) => `p${i}`)
    const consultas = consultasDeFilhos(pastas, "mimeType contains 'image/'")

    expect(consultas).toHaveLength(3)
    expect(consultas[0]).toMatch(/^\('p0' in parents or 'p1' in parents/)
    expect(consultas[2]).toBe(
      "('p40' in parents or 'p41' in parents or 'p42' in parents or 'p43' in parents or 'p44' in parents) and mimeType contains 'image/' and trashed = false",
    )
  })

  it('escapa aspas e barra no id', () => {
    expect(consultasDeFilhos(["a'b\\c"], "mimeType = 'x'")[0]).toBe(
      "('a\\'b\\\\c' in parents) and mimeType = 'x' and trashed = false",
    )
  })
})
