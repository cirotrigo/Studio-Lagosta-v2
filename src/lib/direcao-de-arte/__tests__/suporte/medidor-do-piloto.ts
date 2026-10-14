/**
 * O medidor calibrado nas caixas que o medidor do servidor deu na peça piloto
 * (`composicao.medidasFinais`): devolve as mesmas larguras e alturas por bloco.
 */
import { fixture } from './fixture'
import { medidorCalibrado, type Calibragem } from './compositor'

function calibragensDoPiloto(): Calibragem[] {
  const peca = fixture.peca()
  const estiloDe = (id: string) => peca.v1.layers.find((l) => l.id === id)?.style ?? {}
  return peca.composicaoRegistrada.medidasFinais.map((m) => {
    const linhas = peca.spec.blocos.find((b) => b.papel === m.papel)?.linhas ?? ['']
    return {
      fontFamily: m.fontFamily,
      fontSize: m.fontSize,
      lineHeight: m.lineHeight,
      letterSpacing: Number(estiloDe(m.id).letterSpacing ?? 0),
      linhaMaisLonga: linhas.reduce((a, b) => (b.length > a.length ? b : a), ''),
      width: m.width,
      height: m.height,
      linhas: m.linhas,
    }
  })
}

export const medidor = medidorCalibrado(calibragensDoPiloto())
