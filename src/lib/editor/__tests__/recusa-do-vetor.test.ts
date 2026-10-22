import { describe, expect, it } from 'vitest'
import { criarRecusas, ehRecusaDoVetor, type PendenteAssinavel } from '../recusa-do-vetor'

type P = PendenteAssinavel & { rotulo?: string }

function cenario() {
  const r = criarRecusas<P>()
  const pendente = (pageId: string, layersString: string, canvasString = '1080x1920|#fff'): P => ({
    pageId, layersString, canvasString, audioString: 'null', linhagem: r.linhagem(pageId), seq: r.proximaSeq(),
  })
  return { r, pendente }
}

describe('recusa do autosave por vetor (CP-X2b)', () => {
  it('só 422 é recusa do vetor', () => {
    expect(ehRecusaDoVetor({ status: 422 })).toBe(true)
    expect(ehRecusaDoVetor({ status: 500 })).toBe(false)
    expect(ehRecusaDoVetor(new Error('x'))).toBe(false)
    expect(ehRecusaDoVetor(null)).toBe(false)
  })

  it('o mesmo conteúdo recusado não é reenviado; conteúdo novo é', () => {
    const { r, pendente } = cenario()
    r.novaLinhagem('p1')
    r.registrar(pendente('p1', 'A'), '422')
    expect(r.jaRecusado(pendente('p1', 'A'))).toBe(true)
    expect(r.jaRecusado(pendente('p1', 'B'))).toBe(false)
    expect(r.jaRecusado(pendente('p1', 'A', '1080x1350|#fff'))).toBe(false)
    expect(r.jaRecusado(pendente('p2', 'A'))).toBe(false)
  })

  it('a correção na MESMA linhagem resolve; o instantâneo muda de identidade só quando muda', () => {
    const { r, pendente } = cenario()
    r.novaLinhagem('p1')
    r.registrar(pendente('p1', 'A'), '422')
    const antes = r.todas()
    expect(r.todas()).toBe(antes)
    r.confirmado(pendente('p1', 'A-corrigido'))
    expect(r.de('p1')).toBeNull()
    expect(r.todas()).not.toBe(antes)
  })

  it('trocar de página e voltar abre linhagem nova: gravar SÓ canvas/áudio sobre o banco não apaga a recusa (achado da revisão)', () => {
    const { r, pendente } = cenario()
    r.novaLinhagem('p1')
    r.registrar(pendente('p1', 'A-invalida'), '422')
    r.novaLinhagem('p2') // vai para a P2
    r.novaLinhagem('p1') // volta: a tela mostra o banco
    r.confirmado(pendente('p1', 'DO-BANCO', '1080x1350|#000'))
    expect(r.de('p1')?.pendente.layersString).toBe('A-invalida')
  })

  it('Restaurar retoma a linhagem da recusa: a correção depois disso resolve', () => {
    const { r, pendente } = cenario()
    r.novaLinhagem('p1')
    r.registrar(pendente('p1', 'A-invalida'), '422')
    r.novaLinhagem('p1')
    r.retomar(r.de('p1')!)
    r.confirmado(pendente('p1', 'A-corrigida'))
    expect(r.de('p1')).toBeNull()
  })

  it('confirmação ANTIGA (capturada antes da recusa) não a resolve, e recusa antiga não troca a mais nova', () => {
    const { r, pendente } = cenario()
    r.novaLinhagem('p1')
    const velho = pendente('p1', 'V')
    const novo = pendente('p1', 'N-invalida')
    r.registrar(novo, 'nova')
    r.confirmado(velho)
    expect(r.de('p1')?.mensagem).toBe('nova')
    r.registrar(velho, 'velha')
    expect(r.de('p1')?.mensagem).toBe('nova')
  })

  it('descartar remove; descartar o que não existe não avisa ninguém', () => {
    const { r, pendente } = cenario()
    let avisos = 0
    r.assinar(() => avisos++)
    r.registrar(pendente('p1', 'A'), '422')
    r.descartar('p9')
    expect(avisos).toBe(1)
    r.descartar('p1')
    expect(avisos).toBe(2)
    expect(r.todas()).toEqual([])
  })
})
