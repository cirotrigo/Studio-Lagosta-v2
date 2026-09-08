import { describe, expect, it } from 'vitest'
import { agruparPorArte, avisoDePrazo, chaveDaImagem, ranquearRepost, semaforoPorIdade, type PostPublicadoParaRepost } from '../repostar'

// Todas as datas em UTC; BRT = UTC-3. Slot alvo: quinta 19:00 BRT = quinta 22:00Z.
const AGORA = new Date('2026-09-10T15:00:00Z')
const SLOT = new Date('2026-09-10T22:00:00Z')
const dias = (n: number, horaBRT = 19, dia?: number) => {
  const d = new Date(AGORA.getTime() - n * 86_400_000)
  // ajusta a hora em BRT
  d.setUTCHours(horaBRT + 3, 0, 0, 0)
  if (dia !== undefined) {
    const atual = new Date(d.getTime() - 3 * 3600_000).getUTCDay()
    d.setUTCDate(d.getUTCDate() + (dia - atual))
  }
  return d
}
const post = (id: string, url: string, quando: Date, extra: Partial<PostPublicadoParaRepost> = {}): PostPublicadoParaRepost => ({
  id, mediaUrl: url, generationId: null, generationUrl: null, templateName: null, quando, caption: null, alcance: null, ...extra,
})

describe('chaveDaImagem', () => {
  it('ignora query e hash, e nada mais', () => {
    expect(chaveDaImagem('https://b/x.png?x=1')).toBe('https://b/x.png')
    expect(chaveDaImagem('https://b/x.png#a')).toBe('https://b/x.png')
    expect(chaveDaImagem('https://b/x-2.png')).not.toBe(chaveDaImagem('https://b/x.png'))
  })
})

describe('agruparPorArte', () => {
  it('conta a IMAGEM, prefere a URL da Generation viva e a legenda do último uso', () => {
    const artes = agruparPorArte([
      post('a', 'https://b/1.png', dias(30), { caption: 'antiga' }),
      post('b', 'https://b/1.png', dias(10), { caption: 'nova', generationId: 'g1', generationUrl: 'https://drive/1' }),
      post('c', 'https://b/2.png', dias(5)),
    ])
    const um = artes.find((a) => a.chave === 'https://b/1.png')!
    expect(um.vezesUsada).toBe(2)
    expect(um.url).toBe('https://drive/1')
    expect(um.legenda).toBe('nova')
    expect(um.ultimoPostId).toBe('b')
    expect(artes.find((a) => a.chave === 'https://b/2.png')!.vezesUsada).toBe(1)
  })
})

describe('semaforoPorIdade', () => {
  it('verde ≥14, âmbar 7-13, vermelho <7', () => {
    expect(semaforoPorIdade(14)).toBe('verde')
    expect(semaforoPorIdade(13)).toBe('ambar')
    expect(semaforoPorIdade(7)).toBe('ambar')
    expect(semaforoPorIdade(6)).toBe('vermelho')
  })
})

describe('avisoDePrazo', () => {
  it('pega data comemorativa, dd/mm e urgência; ignora dia da semana igual ao escolhido', () => {
    expect(avisoDePrazo('Feliz Dia dos Pais!', 4)).toBe('fala em "Dia dos Pais"')
    expect(avisoDePrazo('Só até 12/09', 4)).toMatch(/12\/09/)
    expect(avisoDePrazo('Hoje tem festa', 4)).toBe('diz "Hoje"')
    expect(avisoDePrazo('Quinta no Tero', 4)).toBeNull()
    expect(avisoDePrazo('Domingo no Tero', 4)).toBe('fala em domingo')
    expect(avisoDePrazo('Chopp gelado e boa conversa', 4)).toBeNull()
  })
})

describe('ranquearRepost', () => {
  it('mesmo dia + faixa + idade verde vence; recente vai para o fim; nada some', () => {
    const posts = [
      post('verde-mesmo-dia', 'https://b/A.png', dias(21, 19, 4)),   // quinta 19h, 21d
      post('outro-dia', 'https://b/B.png', dias(21, 19, 2)),         // terça 19h, 21d
      post('recente', 'https://b/C.png', dias(3, 19, 4)),            // quinta 19h, 3d
      post('outra-hora', 'https://b/D.png', dias(21, 9, 4)),         // quinta 9h, 21d
    ]
    const r = ranquearRepost(posts, { quando: SLOT, agora: AGORA })
    expect(r.map((x) => x.ultimoPostId)).toEqual(['verde-mesmo-dia', 'outra-hora', 'outro-dia', 'recente'])
    expect(r[0].semaforo).toBe('verde')
    expect(r[3].semaforo).toBe('vermelho')
    expect(r).toHaveLength(4)
  })
  it('o que já está agendado à frente não é sugerido', () => {
    const posts = [post('a', 'https://b/A.png', dias(21, 19, 4)), post('b', 'https://b/B.png', dias(21, 19, 4))]
    const r = ranquearRepost(posts, { quando: SLOT, agora: AGORA, jaAgendadas: new Set(['https://b/A.png']) })
    expect(r.map((x) => x.ultimoPostId)).toEqual(['b'])
  })
  it('entre iguais, a menos usada primeiro', () => {
    const posts = [
      post('x1', 'https://b/X.png', dias(21, 19, 4)), post('x2', 'https://b/X.png', dias(28, 19, 4)),
      post('y1', 'https://b/Y.png', dias(21, 19, 4)),
    ]
    const r = ranquearRepost(posts, { quando: SLOT, agora: AGORA })
    expect(r[0].chave).toBe('https://b/Y.png')
  })
})
