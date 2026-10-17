/**
 * CP5b — o registro do gate (`gate-registro.ts`): H3b/H3c (decidir E montar: vínculo antes da decisão, copy dentro
 * da fronteira, registro selado), H4–H6 (validade fail-closed, sem "vigente") e H7 (leitura em três estados: forma
 * inválida nunca expõe o JSON). Puro: sem banco, sem render.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { VERSAO_DAS_REGRAS } from '../contrato'
import { CONFERENCIAS_DO_GATE, POLITICA_DO_ASSUNTO_RECOMENDADA, REGRAS_CRITICAS, VERSAO_DO_GATE, gateDaMedida, type EntradaDoGate } from '../gate'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import {
  NAO_CONFERIDO_PELA_IDENTIDADE,
  ORIGENS_DO_GATE,
  congeladoEmProfundidade,
  decidirEMontarRegistro,
  foiSeladoPorDecidir,
  gateDaArteSchema,
  lerGateDaArte,
  validadeDoGate,
  violacaoDaInvarianteDoGate,
  type IdentidadeAtual,
  type RegistroDoGate,
} from '../gate-registro'
import { identidadeDaPagina } from '../versao'
import { CORPUS_DO_GATE, POLITICAS_DO_CORPUS, medida, pecaLimpa } from './suporte/corpus-do-gate'

import { AGORA, PAGINA_LIMPA, VINCULO, camadasDaPaginaLimpa, decidirOk, entradaDa } from './suporte/pagina-limpa'

const atual = (extra: Partial<IdentidadeAtual> = {}): IdentidadeAtual => {
  const id = identidadeDaPagina(PAGINA_LIMPA)
  return { projectId: 8, generationId: 'gen-1', pageId: 'pg-1', formato: id.formato, formatoDoCompositor: id.formatoDoCompositor, pageVersion: id.pageVersion, copyVersion: id.copyVersion, rulesVersion: VERSAO_DAS_REGRAS, versaoDoGate: VERSAO_DO_GATE, politica: POLITICA_DO_ASSUNTO_DO_GATE, ...extra }
}

describe('H3b — decidirEMontarRegistro: o vínculo antes da decisão', () => {
  it('tudo igual → ok: gate ≡ gateDaMedida({ ...entrada, copy calculada }), registro selado, congelado, com identidade e vínculo', () => {
    const r = decidirOk(PAGINA_LIMPA, { principal: { tipo: 'oauth', id: 'cliente-x' } })
    const copy = revisaoDaPaginaComCamadas(PAGINA_LIMPA.copyAutoral, PAGINA_LIMPA.layers, { autor: 'sistema', motivo: 'gate', superficie: 'piloto' })
    expect(copy.estado).toBe('sem-mudanca')
    expect(copy.lacunas).toEqual([])
    const esperado = gateDaMedida({ ...entradaDa(PAGINA_LIMPA), copy: { estado: copy.estado, lacunas: copy.lacunas } })
    expect(JSON.parse(JSON.stringify(r.gate))).toEqual(JSON.parse(JSON.stringify(esperado.gate)))
    expect(r.gate.resultado).toBe('APTO')
    expect(r.relatorio.achados.length).toBe(esperado.relatorio.achados.length)
    expect(r.registro.identidade).toEqual({ projectId: 8, generationId: 'gen-1', pageId: 'pg-1', formato: 'story', formatoDoCompositor: 'story', pageVersion: identidadeDaPagina(PAGINA_LIMPA).pageVersion, copyVersion: identidadeDaPagina(PAGINA_LIMPA).copyVersion })
    expect(r.registro.medidoEm).toBe('2026-10-16T03:00:00.000Z')
    expect(r.registro.origem).toBe('piloto')
    expect(r.registro.principal).toEqual({ tipo: 'oauth', id: 'cliente-x' })
    expect(r.registro.politica).toEqual(POLITICA_DO_ASSUNTO_DO_GATE)
    expect(foiSeladoPorDecidir(r.registro)).toBe(true)
    expect(congeladoEmProfundidade(r.registro)).toBe(true)
    expect(() => {
      ;(r.registro.gate as { resultado: string }).resultado = 'x'
    }).toThrow(TypeError)
    expect(foiSeladoPorDecidir(structuredClone(r.registro))).toBe(false)
    expect(foiSeladoPorDecidir({ ...r.registro })).toBe(false)
  })

  it('formato da medida ≠ página (gate de feed para página story, piso dispensado) → sem-vinculo, sem gate', () => {
    const r = decidirEMontarRegistro({ entrada: entradaDa(PAGINA_LIMPA, { formato: 'feed' }), page: PAGINA_LIMPA, vinculo: VINCULO, origem: 'piloto', agora: AGORA })
    expect(r).toEqual({ decisao: 'sem-vinculo', motivo: expect.stringMatching(/formato feed.*story/) })
    expect('gate' in r).toBe(false)
  })

  it('canvas da medida ≠ página → sem-vinculo', () => {
    const r = decidirEMontarRegistro({ entrada: entradaDa(PAGINA_LIMPA, { canvas: { width: 2160, height: 3840 } }), page: PAGINA_LIMPA, vinculo: VINCULO, origem: 'piloto', agora: AGORA })
    expect(r.decisao).toBe('sem-vinculo')
    expect(r.decisao === 'sem-vinculo' && r.motivo).toMatch(/2160×3840/)
  })

  it('identidade da entrada ≠ identidadeDaPagina(page) → sem-vinculo', () => {
    const e = entradaDa(PAGINA_LIMPA)
    for (const identidade of [{ ...e.identidade, pageVersion: 'v1:00000000000000000000' }, { ...e.identidade, copyVersion: 'c1:00000000000000000000' }, { ...e.identidade, pageVersion: null }]) {
      const r = decidirEMontarRegistro({ entrada: { ...e, identidade }, page: PAGINA_LIMPA, vinculo: VINCULO, origem: 'piloto', agora: AGORA })
      expect(r.decisao, JSON.stringify(identidade)).toBe('sem-vinculo')
    }
  })

  it('a medida LIMPA de OUTRA peça do mesmo formato e canvas (camadas ≠ page.layers) → sem-vinculo', () => {
    const outra = pecaLimpa().camadas.map((l) => (l.id === 'apoio' ? { ...l, position: { x: 100, y: 460 } } : l))
    const r = decidirEMontarRegistro({ entrada: entradaDa(PAGINA_LIMPA, { camadas: outra }), page: PAGINA_LIMPA, vinculo: VINCULO, origem: 'piloto', agora: AGORA })
    expect(r.decisao).toBe('sem-vinculo')
    expect(r.decisao === 'sem-vinculo' && r.motivo).toMatch(/camadas/)
    // Camadas iguais gravadas como string JSON (dupla) na página → o mesmo `estavel` → ok.
    const paginaString = { ...PAGINA_LIMPA, layers: JSON.stringify(JSON.stringify(PAGINA_LIMPA.layers)) }
    expect(decidirEMontarRegistro({ entrada: entradaDa(paginaString, { camadas: camadasDaPaginaLimpa() }), page: paginaString, vinculo: VINCULO, origem: 'piloto', agora: AGORA }).decisao).toBe('ok')
  })

  it('postType STORY para formato feed → sem-vinculo; POST → ok', () => {
    const feed = { ...PAGINA_LIMPA, name: 'Qua 14/10 · feed', tags: ['feed'], height: 1350, layers: camadasDaPaginaLimpa().map((l) => (l.id === 'bg-foto' ? { ...l, size: { width: 1080, height: 1350 } } : l.id === 'servico' ? { ...l, position: { x: 100, y: 1150 } } : l)) }
    const medidaFeed = (page: typeof feed) => entradaDa(page, { formato: 'feed', canvas: { width: 1080, height: 1350 }, metricas: medida().metricas.map((m) => (m.layerId === 'servico' ? { ...m, box: { ...m.box, y: 1150 }, glyphTop: 1150, glyphBottom: 1210 } : m)), assunto: { rect: { x: 0, y: 700, width: 1080, height: 400 }, origem: 'catalogo' } })
    const story = decidirEMontarRegistro({ entrada: medidaFeed(feed), page: feed, vinculo: { ...VINCULO, postType: 'STORY' }, origem: 'piloto', agora: AGORA })
    expect(story).toEqual({ decisao: 'sem-vinculo', motivo: expect.stringMatching(/STORY.*feed.*POST/) })
    expect(decidirEMontarRegistro({ entrada: medidaFeed(feed), page: feed, vinculo: { ...VINCULO, postType: 'POST' }, origem: 'piloto', agora: AGORA }).decisao).toBe('ok')
  })

  it('os dois classificadores discordam (nome "feed", tags [story], 1080×1350) → sem-vinculo; formato null (400×300 sem nome) idem', () => {
    const discorda = { ...PAGINA_LIMPA, name: 'feed de quarta', tags: ['story'], height: 1350 }
    const id = identidadeDaPagina(discorda)
    expect([id.formato, id.formatoDoCompositor]).toEqual(['feed', 'story'])
    const r = decidirEMontarRegistro({ entrada: entradaDa(discorda, { formato: 'feed', canvas: { width: 1080, height: 1350 } }), page: discorda, vinculo: { ...VINCULO, postType: 'POST' }, origem: 'piloto', agora: AGORA })
    expect(r).toEqual({ decisao: 'sem-vinculo', motivo: expect.stringMatching(/divergem.*revisor feed.*compositor story/) })
    const semFormato = { ...PAGINA_LIMPA, name: 'x', tags: [], width: 400, height: 300 }
    expect(decidirEMontarRegistro({ entrada: entradaDa(semFormato, { formato: null, canvas: { width: 400, height: 300 } }), page: semFormato, vinculo: { ...VINCULO, postType: 'POST' }, origem: 'piloto', agora: AGORA }).decisao).toBe('sem-vinculo')
  })
})

describe('H3c — a copy é reconciliada DENTRO da fronteira', () => {
  it('bloco apagado nas camadas → copy-completa não comprovada, mesmo com `copy: sem-mudanca` injetada em runtime nos args', () => {
    const semApoio = { ...PAGINA_LIMPA, layers: camadasDaPaginaLimpa().filter((l) => l.id !== 'apoio') }
    const entrada = { ...entradaDa(semApoio, { metricas: medida().metricas.filter((m) => m.layerId !== 'apoio') }), copy: { estado: 'sem-mudanca', lacunas: [] } } as Omit<EntradaDoGate, 'copy'>
    const r = decidirEMontarRegistro({ entrada, page: semApoio, vinculo: VINCULO, origem: 'piloto', agora: AGORA })
    expect(r.decisao).toBe('ok')
    if (r.decisao !== 'ok') return
    const revisao = revisaoDaPaginaComCamadas(semApoio.copyAutoral, semApoio.layers, { autor: 'sistema', motivo: 'gate', superficie: 'piloto' })
    expect(revisao.estado).toBe('registrada')
    expect(r.gate.cobertura['copy-completa']).toEqual({ estado: 'nao-comprovada', motivo: `copy ${revisao.estado}` })
    expect(r.gate.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
  })

  it('sem contrato de copy → copy-completa não comprovada (9.4 do CP5a)', () => {
    const semCopy = { ...PAGINA_LIMPA, copyAutoral: undefined }
    const r = decidirOk(semCopy)
    expect(r.gate.cobertura['copy-completa']).toEqual({ estado: 'nao-comprovada', motivo: 'copy sem-contrato' })
    expect(r.registro.identidade.copyVersion).toBe('sem-contrato')
  })
})

describe('H4/H5/H6 — validadeDoGate é fail-closed e nunca diz "vigente"', () => {
  it('H4: tudo igual → coincidente com a lista FIXA do que não foi conferido (não vazia)', () => {
    const v = validadeDoGate(decidirOk().registro, atual())
    expect(v).toEqual({ estado: 'coincidente', naoConferido: NAO_CONFERIDO_PELA_IDENTIDADE })
    expect(NAO_CONFERIDO_PELA_IDENTIDADE.length).toBeGreaterThanOrEqual(4)
    expect(NAO_CONFERIDO_PELA_IDENTIDADE.join(' ')).toMatch(/assets[\s\S]*fontes[\s\S]*assinatura[\s\S]*gradiente/)
    expect(JSON.stringify(v)).not.toMatch(/vigente|resultado|APTO/)
  })

  it('H5: cada divergência, uma por vez → historico com o nome; duas → as duas', () => {
    const r = decidirOk().registro
    const casos: Array<[Partial<IdentidadeAtual>, string]> = [
      [{ projectId: 9 }, 'vinculo'],
      [{ generationId: 'gen-2' }, 'vinculo'],
      [{ pageId: 'pg-2' }, 'vinculo'],
      [{ formato: 'feed' }, 'formato'],
      [{ formatoDoCompositor: 'feed' }, 'formatoDoCompositor'],
      [{ pageVersion: 'v1:ffffffffffffffffffff' }, 'pageVersion'],
      [{ copyVersion: 'c1:ffffffffffffffffffff' }, 'copyVersion'],
      [{ rulesVersion: 'revisao-v2' }, 'rulesVersion'],
      [{ versaoDoGate: 'gate-v2' }, 'versaoDoGate'],
      [{ politica: { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' } }, 'politica'],
      [{ politica: { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' } }, 'politica'], // a PROPOSTA antiga do CP5a: registro gravado com ela vira historico
    ]
    for (const [mudanca, divergencia] of casos) expect(validadeDoGate(r, atual(mudanca)), JSON.stringify(mudanca)).toEqual({ estado: 'historico', divergencias: [divergencia] })
    expect(validadeDoGate(r, atual({ generationId: 'gen-2', rulesVersion: 'revisao-v2' }))).toEqual({ estado: 'historico', divergencias: ['vinculo', 'rulesVersion'] })
    // O sentido que importa em produção (17/10/2026): registro GRAVADO com a política ANTIGA (a proposta do CP5a) lido pelo
    // leitor com a política EFETIVA → historico por `politica`, e só por ela.
    const antigo = decidirOk(PAGINA_LIMPA, { entrada: { ...entradaDa(PAGINA_LIMPA), politicaDoAssunto: POLITICA_DO_ASSUNTO_RECOMENDADA } }).registro
    expect(antigo.politica).toEqual(POLITICA_DO_ASSUNTO_RECOMENDADA)
    expect(validadeDoGate(antigo, atual())).toEqual({ estado: 'historico', divergencias: ['politica'] })
  })

  it('H5 pelas páginas: renomear 1080×1920 para "feed" muda só o formato do revisor; trocar só as tags de uma 1080×1350 muda só o do compositor; o mesmo conteúdo noutra Generation → vinculo', () => {
    const r = decidirOk().registro
    const renomeada = identidadeDaPagina({ ...PAGINA_LIMPA, name: 'feed especial', tags: [] })
    expect(renomeada.pageVersion).toBe(r.identidade.pageVersion)
    expect(validadeDoGate(r, atual({ formato: renomeada.formato, formatoDoCompositor: renomeada.formatoDoCompositor }))).toEqual({ estado: 'historico', divergencias: ['formato'] })
    const feed = { ...PAGINA_LIMPA, name: 'feed de quarta', tags: ['feed'], height: 1350, layers: camadasDaPaginaLimpa().map((l) => (l.id === 'bg-foto' ? { ...l, size: { width: 1080, height: 1350 } } : l.id === 'servico' ? { ...l, position: { x: 100, y: 1150 } } : l)) }
    const rf = decidirEMontarRegistro({ entrada: entradaDa(feed, { formato: 'feed', canvas: { width: 1080, height: 1350 }, metricas: medida().metricas.map((m) => (m.layerId === 'servico' ? { ...m, box: { ...m.box, y: 1150 }, glyphTop: 1150, glyphBottom: 1210 } : m)) }), page: feed, vinculo: { ...VINCULO, postType: 'POST' }, origem: 'piloto', agora: AGORA })
    expect(rf.decisao).toBe('ok')
    if (rf.decisao !== 'ok') return
    const soTags = identidadeDaPagina({ ...feed, tags: ['story'] })
    expect([soTags.pageVersion, soTags.formato, soTags.formatoDoCompositor]).toEqual([rf.registro.identidade.pageVersion, 'feed', 'story'])
    expect(validadeDoGate(rf.registro, { ...atual(), ...rf.registro.identidade, formatoDoCompositor: 'story' })).toEqual({ estado: 'historico', divergencias: ['formatoDoCompositor'] })
    expect(validadeDoGate(r, atual({ generationId: 'gen-outra' })).estado).toBe('historico')
  })

  it('H6: pageVersion nulo de qualquer lado ou identidade ≠ gate → ilegivel com motivo', () => {
    const r = decidirOk().registro
    expect(validadeDoGate(r, atual({ pageVersion: null })).estado).toBe('ilegivel')
    const gravadoIlegivel: RegistroDoGate = { ...r, gate: { ...r.gate, pageVersion: null }, identidade: { ...r.identidade, pageVersion: null } }
    expect(validadeDoGate(gravadoIlegivel, atual()).estado).toBe('ilegivel')
    const divergente: RegistroDoGate = { ...r, identidade: { ...r.identidade, copyVersion: 'c1:ffffffffffffffffffff' } }
    const v = validadeDoGate(divergente, atual())
    expect(v.estado === 'ilegivel' && v.motivo).toMatch(/identidade/)
  })

  it('H7 (determinismo): medidoEm e principal não entram na validade', () => {
    const r = decidirOk().registro
    const outro: RegistroDoGate = { ...r, medidoEm: '2020-01-01T00:00:00.000Z', principal: { tipo: 'x', id: 'y' } }
    expect(validadeDoGate(outro, atual())).toEqual(validadeDoGate(r, atual()))
  })
})

describe('H7 — lerGateDaArte em três estados, estrito, nunca lança, nunca expõe o JSON rejeitado', () => {
  const valido = () => JSON.parse(JSON.stringify(decidirOk().registro)) as Record<string, any>

  it('registro válido → ok com igualdade estrutural; sem a chave → ausente', () => {
    const r = valido()
    expect(lerGateDaArte({ pageId: 'pg-1', composicao: {}, gateDaArte: r })).toEqual({ estado: 'ok', registro: r })
    for (const fv of [null, undefined, 'x', 12, [], { pageId: 'pg-1' }]) expect(lerGateDaArte(fv), JSON.stringify(fv)).toEqual({ estado: 'ausente' })
  })

  it('forma inválida → invalido com motivo, e só as versões gravadas (quando válidas pelo regex) saem', () => {
    const casos: Array<[string, (r: Record<string, any>) => void, RegExp]> = [
      ['versao gate-v2', (r) => (r.gate.versao = 'gate-v2'), /versão anterior ou desconhecida.*gate-v2/],
      ['sem politica', (r) => delete r.politica, /forma inválida em politica/],
      ['politica fora do enum', (r) => (r.politica.estimado = 'sempre'), /politica\.estimado/],
      ['cobertura sem colisao', (r) => delete r.gate.cobertura.colisao, /cobertura\.colisao/],
      ['cobertura com entrada a mais', (r) => (r.gate.cobertura.visao = { estado: 'comprovada' }), /cobertura/],
      ['estado inválido', (r) => (r.gate.cobertura.colisao = { estado: 'avaliada' }), /colisao/],
      ['origem fora do conjunto', (r) => (r.origem = 'cron'), /origem/],
      ['sem identidade.generationId', (r) => delete r.identidade.generationId, /generationId/],
      ['formato inválido', (r) => (r.identidade.formato = 'reels'), /formato/],
      ['sem formatoDoCompositor', (r) => delete r.identidade.formatoDoCompositor, /formatoDoCompositor/],
      ['medidoEm não ISO', (r) => (r.medidoEm = 'ontem'), /medidoEm/],
      ['chave extra no topo', (r) => (r.extra = 1), /raiz/],
      ['chave extra no gate', (r) => (r.gate.extra = 1), /gate/],
      ['motivo com código desconhecido', (r) => (r.gate.motivos = [{ regra: 'colisao', codigo: 'TALVEZ', motivo: 'x', camadas: [] }]), /motivos/],
      ['achado com certeza visao', (r) => (r.gate.achados = [{ regra: 'colisao', camadas: [], id: 'x', severidade: 'problema', certeza: 'visao' }]), /achados/],
      ['resultado fora do enum', (r) => (r.gate.resultado = 'TALVEZ'), /resultado/],
      ['registro nulo', (r) => Object.keys(r).forEach((k) => delete r[k]), /forma inválida/],
    ]
    for (const [nome, mexer, motivo] of casos) {
      const r = valido()
      mexer(r)
      const lido = lerGateDaArte({ gateDaArte: r })
      expect(lido.estado, nome).toBe('invalido')
      if (lido.estado !== 'invalido') continue
      expect(lido.motivo, nome).toMatch(motivo)
      // Nada do JSON rejeitado sai: só estado, motivo (o CAMINHO do campo, nunca o valor) e as versões filtradas.
      expect(Object.keys(lido).sort(), nome).toEqual(expect.arrayContaining(['estado', 'motivo']))
      expect(Object.keys(lido).every((k) => ['estado', 'motivo', 'versaoGravada', 'rulesVersionGravada'].includes(k)), nome).toBe(true)
      expect(JSON.stringify(lido), nome).not.toMatch(/APTO|REVISAO_HUMANA|comprovada/)
    }
    const v2 = valido()
    v2.gate.versao = 'gate-v2'
    expect(lerGateDaArte({ gateDaArte: v2 })).toMatchObject({ estado: 'invalido', versaoGravada: 'gate-v2', rulesVersionGravada: 'revisao-v1' })
    for (const versao of ['x'.repeat(200), '<script>', 'Gate-V2', ' gate-v2', '']) {
      const r = valido()
      r.gate.versao = versao
      const lido = lerGateDaArte({ gateDaArte: r })
      expect(lido.estado).toBe('invalido')
      expect(lido.estado === 'invalido' && 'versaoGravada' in lido, JSON.stringify(versao)).toBe(false)
    }
    expect(lerGateDaArte({ gateDaArte: null })).toMatchObject({ estado: 'invalido' })
    expect(lerGateDaArte({ gateDaArte: 'lixo' })).toMatchObject({ estado: 'invalido' })
  })

  it('invariante 2.3 violada → invalido: APTO com motivos, com achados, com cobertura não comprovada/reprovada, com nao-se-aplica em copy/identidade/oclusao; RHN sem motivo', () => {
    const casos: Array<[string, (r: Record<string, any>) => void]> = [
      ['APTO com motivo', (r) => (r.gate.motivos = [{ regra: 'colisao', codigo: 'ACHADO_CRITICO', motivo: 'x', camadas: ['a'] }])],
      ['APTO com naoMedidos', (r) => (r.gate.naoMedidos = [{ regra: 'oclusao', motivo: 'x', camadas: ['a'] }])],
      ['APTO com achado', (r) => (r.gate.achados = [{ regra: 'colisao', camadas: ['a'], id: 'colisao:a', severidade: 'problema', certeza: 'medida' }])],
      ['APTO com cobertura nao-comprovada', (r) => (r.gate.cobertura.colisao = { estado: 'nao-comprovada', motivo: 'x' })],
      ['APTO com cobertura reprovada', (r) => (r.gate.cobertura.colisao = { estado: 'reprovada', achados: ['colisao:a'] })],
      ['APTO com copy-completa nao-se-aplica', (r) => (r.gate.cobertura['copy-completa'] = { estado: 'nao-se-aplica', motivo: 'x' })],
      ['APTO com identidade nao-se-aplica', (r) => (r.gate.cobertura.identidade = { estado: 'nao-se-aplica', motivo: 'x' })],
      ['APTO com oclusao nao-se-aplica', (r) => (r.gate.cobertura.oclusao = { estado: 'nao-se-aplica', motivo: 'x' })],
      ['RHN sem motivo', (r) => (r.gate.resultado = 'REVISAO_HUMANA_NECESSARIA')],
      // Codex R1 do PR #240: o CP5a nunca produz estes.
      ['APTO de story com o piso dispensado', (r) => (r.gate.cobertura['piso-de-interface'] = { estado: 'nao-se-aplica', motivo: 'forjado' })],
      ['APTO com pageVersion nulo nos dois lados', (r) => ((r.gate.pageVersion = null), (r.identidade.pageVersion = null))],
      ['feed com o piso medido (comprovada)', (r) => ((r.identidade.formato = 'feed'), (r.identidade.formatoDoCompositor = 'feed'))],
    ]
    for (const [nome, mexer] of casos) {
      const r = valido()
      mexer(r)
      const lido = lerGateDaArte({ gateDaArte: r })
      expect(lido.estado, nome).toBe('invalido')
      expect(lido.estado === 'invalido' && lido.motivo, nome).toMatch(/invariante|forma inválida/)
      // O motivo é texto FIXO: nunca o resultado nem contagens do JSON rejeitado.
      expect(lido.estado === 'invalido' && lido.motivo, nome).not.toMatch(/APTO com \d|REVISAO_HUMANA_NECESSARIA|\d motivo/)
    }
    // Codex R2: RHN com um motivo acrescentado e TODAS as coberturas comprovadas → incoerente → inválido.
    const contraditorio = valido()
    contraditorio.gate.resultado = 'REVISAO_HUMANA_NECESSARIA'
    contraditorio.gate.motivos = [{ regra: 'colisao', codigo: 'ACHADO_CRITICO', motivo: 'x', camadas: ['a'] }]
    expect(lerGateDaArte({ gateDaArte: contraditorio })).toMatchObject({ estado: 'invalido', motivo: expect.stringMatching(/motivos incoerentes/) })
    // Cobertura reprovada sem achado, e achado numa crítica comprovada → inválidos.
    const semAchado = valido()
    semAchado.gate.resultado = 'REVISAO_HUMANA_NECESSARIA'
    semAchado.gate.motivos = [{ regra: 'colisao', codigo: 'ACHADO_CRITICO', motivo: 'x', camadas: ['a'] }]
    semAchado.gate.cobertura.colisao = { estado: 'reprovada', achados: ['colisao:a'] }
    expect(lerGateDaArte({ gateDaArte: semAchado })).toMatchObject({ estado: 'invalido', motivo: expect.stringMatching(/reprovada sem achado/) })
    semAchado.gate.achados = [{ regra: 'texto-cortado', camadas: ['a'], id: 'x', severidade: 'problema', certeza: 'medida' }]
    expect(lerGateDaArte({ gateDaArte: semAchado })).toMatchObject({ estado: 'invalido' })
    // E o RHN COERENTE (motivo + cobertura reprovada + achado) é ok.
    semAchado.gate.achados = [{ regra: 'colisao', camadas: ['a'], id: 'colisao:a', severidade: 'problema', certeza: 'medida' }]
    expect(lerGateDaArte({ gateDaArte: semAchado }).estado).toBe('ok')
    // Controle: RHN de story com motivo e piso dispensado continua inválido (piso × formato vale para todo resultado).
    const rhn = valido()
    rhn.gate.resultado = 'REVISAO_HUMANA_NECESSARIA'
    rhn.gate.motivos = [{ regra: 'colisao', codigo: 'ACHADO_CRITICO', motivo: 'x', camadas: ['a'] }]
    rhn.gate.cobertura.colisao = { estado: 'reprovada', achados: ['colisao:a'] }
    rhn.gate.achados = [{ regra: 'colisao', camadas: ['a'], id: 'colisao:a', severidade: 'problema', certeza: 'medida' }]
    rhn.gate.cobertura['piso-de-interface'] = { estado: 'nao-se-aplica', motivo: 'forjado' }
    expect(lerGateDaArte({ gateDaArte: rhn })).toMatchObject({ estado: 'invalido', motivo: expect.stringMatching(/piso de interface dispensado/) })
    const g = decidirOk().gate
    expect(violacaoDaInvarianteDoGate(g)).toBeNull()
    expect(violacaoDaInvarianteDoGate({ ...g, pageVersion: null })).toMatch(/pageVersion nulo/)
    expect(violacaoDaInvarianteDoGate({ ...g, achados: [{ regra: 'colisao', camadas: [], id: 'x', severidade: 'problema', certeza: 'medida' }] })).toMatch(/achado/)
  })

  it('TODA saída de gateDaMedida sobre o corpus (com as 4 políticas) passa pelo schema e pela invariante — inclusive G19 com naoMedidos piso-de-interface', () => {
    let n = 0
    let viuPiso = false
    for (const p of CORPUS_DO_GATE) {
      for (const politica of POLITICAS_DO_CORPUS) {
        const { gate } = gateDaMedida({ medida: p.medida, identidade: p.identidade, copy: p.copy, politicaDoAssunto: politica })
        const parse = gateDaArteSchema.safeParse(JSON.parse(JSON.stringify(gate)))
        expect(parse.success, `${p.nome} / ${JSON.stringify(politica)}: ${parse.success ? '' : JSON.stringify(parse.error.issues.slice(0, 3))}`).toBe(true)
        expect(violacaoDaInvarianteDoGate(gate), p.nome).toBeNull()
        if (gate.naoMedidos.some((x) => x.regra === 'piso-de-interface')) viuPiso = true
        n++
      }
    }
    expect(n).toBe(CORPUS_DO_GATE.length * 4)
    expect(viuPiso).toBe(true)
  })

  it('conjuntos fechados: 4 origens; a cobertura exige as 11 críticas + 4 conferências', () => {
    expect([...ORIGENS_DO_GATE]).toEqual(['agendar-leva', 'ajustar-arte', 'revisar-arte', 'piloto'])
    expect(REGRAS_CRITICAS.length + CONFERENCIAS_DO_GATE.length).toBe(15)
  })
})
