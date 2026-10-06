/** Todas as fontes, pessoas, IDs e frases desta prova são fictícios. */
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atestarFonteLocal } from '../../../../scripts/lib/atestar-fonte-local'
import { ctasAtestados, hashDaFonteAtestada, hashDoDnaDeTexto, hashDoTextoAprovado, type FonteDeTextoAtestada } from '../texto-aprovado'
import type { VozCompacta } from '../voz'

const dirs: string[] = []
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../scripts/lib/__tests__/fixtures/${name}.json`, import.meta.url), 'utf8'))
function arquivos() {
  const dir = mkdtempSync(join(tmpdir(), 'fonte-sintetica-')); dirs.push(dir)
  const origem = fixture('origem-sintetica')
  const contexto = fixture('contexto-sintetico') as { voz: VozCompacta; dna: { toneOfVoice: string; contentRules: string }; pergunta: string; resposta: string }
  const fonte = { ...fixture('fonte-sintetica'), vozSha256: hashDoTextoAprovado(contexto.voz), dnaSha256: hashDoDnaDeTexto(contexto.dna) }
  // Critérios independentes dos arquivos; alterá-los é uma nova decisão revisada.
  const politica = {
    origemSha256: hashDoTextoAprovado(origem), fonteSha256: hashDoTextoAprovado(fonte),
    projectId: 7001, threadId: 'fixture-thread-alpha', turnId: 'fixture-turn-alpha',
    userMessageId: 'fixture-user-message-alpha', pergunta: contexto.pergunta, resposta: contexto.resposta,
    trecho: fonte.fonte.trecho, referencia: 'fixture-reference-alpha',
    aprovadoPor: 'Pessoa fictícia', aprovadoEm: '2030-01-02',
  }
  const args = { fontePath: join(dir, 'fonte.json'), origemPath: join(dir, 'origem.json'), reciboPath: join(dir, 'recibo.json'), politica }
  const salvar = () => { writeFileSync(args.fontePath, JSON.stringify(fonte)); writeFileSync(args.origemPath, JSON.stringify(origem)) }
  salvar(); return { args, origem, fonte, contexto, salvar }
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
describe('verificador genérico com evidência inteiramente sintética', () => {
  it('confere origem revisada, retorna capacidade opaca e recibo local sem ativar', async () => {
    const x = arquivos(); const r = await atestarFonteLocal(x.args)
    expect(r.recibo).toMatchObject({ projectId: 7001, aprovadoEm: '2030-01-02', ativado: false, escritaServidor: false, userMessageId: 'fixture-user-message-alpha' })
    expect(JSON.parse(readFileSync(x.args.reciboPath, 'utf8'))).toEqual(r.recibo)
    expect(ctasAtestados({ projectId: 7001, fonte: r.fonte }, x.contexto.voz, x.contexto.dna)).toEqual(['Acenda a estrela!', 'Faça sua órbita!'])
    expect(() => hashDaFonteAtestada(JSON.parse(JSON.stringify(r.fonte)) as FonteDeTextoAtestada)).toThrow('não atestada')
  })
  it.each(['thread', 'turno', 'item', 'resposta', 'pergunta', 'data'])('origem adulterada %s não concede capacidade/recibo', async (tipo) => {
    const x = arquivos()
    if (tipo === 'thread') x.origem.thread.id = 'fixture-other-thread'
    if (tipo === 'turno') x.origem.turn.id = 'fixture-other-turn'
    if (tipo === 'item') x.origem.turn.items[0].type = 'agentMessage'
    if (tipo === 'resposta') x.origem.turn.items[0].content[0].text = x.origem.turn.items[0].content[0].text.replaceAll(x.contexto.resposta, 'Não aprovo a simulação')
    if (tipo === 'pergunta') x.origem.turn.items[0].content[0].text = x.origem.turn.items[0].content[0].text.replaceAll('Aurora', 'Nebulosa')
    if (tipo === 'data') x.origem.turn.startedAt += 86400
    x.salvar(); await expect(atestarFonteLocal(x.args)).rejects.toThrow('Origem'); expect(existsSync(x.args.reciboPath)).toBe(false)
  })
  it.each(['thread', 'turno', 'item', 'contexto', 'data', 'duplicado'])('mesmo com pin refeito, critérios independentes recusam %s', async (tipo) => {
    const x = arquivos()
    if (tipo === 'thread') x.origem.thread.id = 'fixture-other-thread'
    if (tipo === 'turno') x.origem.turn.id = 'fixture-other-turn'
    if (tipo === 'item') x.origem.turn.items[0].type = 'agentMessage'
    if (tipo === 'contexto') x.origem.turn.items[0].content[0].text = `<input>${x.contexto.resposta}</input>\n<transcript_delta>assistant:  Outra pergunta?\nuser:  ${x.contexto.resposta}</transcript_delta>`
    if (tipo === 'data') x.origem.turn.startedAt += 86400
    if (tipo === 'duplicado') x.origem.turn.items.push(structuredClone(x.origem.turn.items[0]))
    x.args.politica.origemSha256 = hashDoTextoAprovado(x.origem); x.salvar()
    await expect(atestarFonteLocal(x.args)).rejects.toThrow('Origem')
  })
  it.each(['projeto', 'literal', 'condicao', 'voz', 'dna'])('hash do pacote vincula %s; adulteração não passa', async (tipo) => {
    const x = arquivos()
    if (tipo === 'projeto') x.fonte.projectId = 7002
    if (tipo === 'literal') x.fonte.ctas[0].literal = 'Outra frase!'
    if (tipo === 'condicao') x.fonte.ctas[1].condicao.texto = 'Use livremente'
    if (tipo === 'voz') x.fonte.vozSha256 = '0'.repeat(64)
    if (tipo === 'dna') x.fonte.dnaSha256 = '0'.repeat(64)
    x.salvar(); await expect(atestarFonteLocal(x.args)).rejects.toThrow('pacote revisado')
  })
  it.each(['projeto', 'aprovador', 'referencia', 'trecho'])('mesmo com hash refeito, a política recusa documento com outro %s', async (tipo) => {
    const x = arquivos()
    if (tipo === 'projeto') x.fonte.projectId = 7002
    if (tipo === 'aprovador') x.fonte.fonte.aprovadoPor = 'Outra pessoa fictícia'
    if (tipo === 'referencia') x.fonte.fonte.referencia = 'fixture-other-reference'
    if (tipo === 'trecho') x.fonte.fonte.trecho += ' Outro contexto.'
    x.args.politica.fonteSha256 = hashDoTextoAprovado(x.fonte); x.salvar()
    await expect(atestarFonteLocal(x.args)).rejects.toThrow('Origem')
  })
  it('condição/literal/projeto/voz/DNA continuam vinculados após a atestação', async () => {
    const x = arquivos(); const { fonte } = await atestarFonteLocal(x.args)
    expect(() => ctasAtestados({ projectId: 7002, fonte }, x.contexto.voz, x.contexto.dna)).toThrow('outro projeto')
    expect(() => ctasAtestados({ projectId: 7001, fonte }, { ...x.contexto.voz, descricao: 'Outra' }, x.contexto.dna)).toThrow('outro projeto')
    expect(() => ctasAtestados({ projectId: 7001, fonte }, x.contexto.voz, { ...x.contexto.dna, contentRules: 'Outra' })).toThrow('outro projeto')
    const v = { ...x.contexto.voz, regras: [] }
    x.fonte.vozSha256 = hashDoTextoAprovado(v); x.args.politica.fonteSha256 = hashDoTextoAprovado(x.fonte); x.salvar()
    x.args.reciboPath = x.args.reciboPath.replace('.json', '-alterado.json')
    const altered = await atestarFonteLocal(x.args)
    expect(() => ctasAtestados({ projectId: 7001, fonte: altered.fonte }, v, x.contexto.dna)).toThrow('Condição')
  })
  it('recibo existente não é sobrescrito', async () => {
    const x = arquivos(); writeFileSync(x.args.reciboPath, 'preservar')
    await expect(atestarFonteLocal(x.args)).rejects.toThrow('EEXIST'); expect(readFileSync(x.args.reciboPath, 'utf8')).toBe('preservar')
  })
})
