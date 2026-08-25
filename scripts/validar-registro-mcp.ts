/**
 * Validação do registro único de tools MCP (PR 1) — roda no CI, SEM env.
 *
 *   npx tsx scripts/validar-registro-mcp.ts
 *
 * Três seções:
 *  A. Invariantes do catálogo — e o próprio IMPORT é metade do teste: o
 *     catálogo carrega sem DATABASE_URL porque os handlers só alcançam db e
 *     serviços por `await import()`. Alguém que acrescente um import estático
 *     pesado num arquivo de domínio derruba este script na hora.
 *  B. Snapshot dos schemas migrados — o JSON Schema DERIVADO tem de ser
 *     equivalente ao literal que o array legado servia. É a rede de segurança
 *     da migração: transcrever schema errado não passa.
 *  C. A porta com dublês — os comportamentos calibrados por incidente
 *     (parâmetro desconhecido de 12/08, coerção de 23/08), o gate declarado,
 *     apelidos, superfícies e a moldagem de resultado/erro.
 *
 * Sem banco, sem rede, sem custo. Qualquer falha sai com exit 1.
 */

import { z } from 'zod'
import { CATALOGO, INDICE_DO_CATALOGO } from '../src/lib/mcp/catalogo/index'
import { definirTool } from '../src/lib/mcp/registro/definir'
import { executarTool } from '../src/lib/mcp/registro/porta'
import { ErroDeTool, type ToolPronta } from '../src/lib/mcp/registro/tipos'
import { CreativeError } from '../src/lib/creatives/errors'
import type { McpPrincipal } from '../src/lib/mcp/oauth'

let falhas = 0
let passos = 0

function ok(nome: string) {
  passos += 1
  console.log(`  ✓ ${nome}`)
}

function falha(nome: string, detalhe?: string) {
  falhas += 1
  console.error(`  ✗ ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
}

function confere(nome: string, condicao: boolean, detalhe?: string) {
  if (condicao) ok(nome)
  else falha(nome, detalhe)
}

/**
 * Normaliza um JSON Schema para comparação de EQUIVALÊNCIA, não de bytes:
 * `$schema` some, `additionalProperties: {}` equivale a `true` (z.record
 * deriva o primeiro; o literal antigo escrevia o segundo — mesmo significado)
 * e objeto sem `properties` equivale a `properties: {}`. Chaves ordenadas.
 */
function canonizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonizar)
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    const saida: Record<string, unknown> = {}
    for (const chave of Object.keys(objeto).sort()) {
      if (chave === '$schema') continue
      let v = objeto[chave]
      if (
        chave === 'additionalProperties' &&
        v &&
        typeof v === 'object' &&
        Object.keys(v as object).length === 0
      ) {
        v = true
      }
      saida[chave] = canonizar(v)
    }
    if (saida.type === 'object' && !('properties' in saida)) saida.properties = {}
    return saida
  }
  return valor
}

function comparaSchemas(nome: string, derivado: unknown, literalAntigo: unknown) {
  const a = JSON.stringify(canonizar(derivado), null, 2)
  const b = JSON.stringify(canonizar(literalAntigo), null, 2)
  confere(
    `snapshot: ${nome}`,
    a === b,
    `derivado:\n${a}\n      literal antigo:\n${b}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────
// A. Invariantes do catálogo
// ─────────────────────────────────────────────────────────────────────────

console.log('\nA. Invariantes do catálogo')

const NOME_VALIDO = /^[a-z0-9-]{1,64}$/

confere('o catálogo carregou sem env (o import é o teste)', CATALOGO.size > 0)

for (const tool of CATALOGO.values()) {
  const rotulo = `[${tool.nome}]`
  confere(`${rotulo} nome no formato portátil`, NOME_VALIDO.test(tool.nome))
  confere(`${rotulo} descrição presente`, tool.descricao.trim().length > 0)
  confere(
    `${rotulo} readOnlyHint/destructiveHint decididos`,
    typeof tool.annotations.readOnlyHint === 'boolean' &&
      typeof tool.annotations.destructiveHint === 'boolean',
  )
  confere(`${rotulo} superfícies declaradas`, tool.superficies.length > 0)
  confere(
    `${rotulo} acesso "proprio" só com motivo`,
    tool.acesso.tipo !== 'proprio' || tool.acesso.motivo.trim().length > 0,
  )
  confere(
    `${rotulo} schema derivado fecha a porta`,
    tool.schemaJson.type === 'object' && tool.schemaJson.additionalProperties === false,
  )
  // `_def.unknownKeys` é interno do zod v3, mas estável — e o assert de
  // additionalProperties acima é o backstop comportamental.
  confere(
    `${rotulo} schema zod é strict`,
    (tool.schema as unknown as { _def: { unknownKeys?: string } })._def.unknownKeys === 'strict',
  )
}

for (const tool of CATALOGO.values()) {
  for (const apelido of tool.apelidos) {
    confere(
      `[${tool.nome}] apelido "${apelido}" resolve no índice`,
      INDICE_DO_CATALOGO.get(apelido) === tool,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
// B. Snapshot dos schemas migrados vs. os literais que o array legado servia
// ─────────────────────────────────────────────────────────────────────────

console.log('\nB. Snapshots dos schemas migrados')

const LITERAL_LISTAR_CLIENTES = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

const LITERAL_CRIAR_ARTE_DE_MODELO = {
  type: 'object',
  properties: {
    projectId: { type: 'number', description: 'ID do projeto.' },
    sourcePageId: { type: 'string', description: 'ID da página de template (prepare-creative.page.id).' },
    slotValues: {
      type: 'object',
      description:
        'Valores por slot, com as chaves do template (layerId ou nome da camada). String define texto; objeto aceita {content, fileUrl}. Chaves reservadas: _driveImageId, _imageUrl.',
      additionalProperties: true,
    },
    name: { type: 'string', description: 'Nome da página gerada (opcional).' },
    imageUrl: { type: 'string', description: 'URL pública da imagem de fundo. Tem prioridade sobre _driveImageId.' },
  },
  required: ['projectId', 'sourcePageId'],
  additionalProperties: false,
}

/** PR 2 — os literais que o array legado servia para a agenda, verbatim. */
const LITERAIS_AGENDA: Record<string, unknown> = {
  'ver-agenda': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      from: { type: 'string', description: 'Data inicial ("AAAA-MM-DD" ou ISO). Default: ontem.' },
      to: { type: 'string', description: 'Data final (opcional).' },
      situacao: {
        type: 'string',
        enum: ['rascunho', 'agendado', 'publicado', 'falhou'],
        description: 'Filtra por situação (opcional).',
      },
      limit: { type: 'number', description: 'Máximo de posts (default 50).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'sugerir-posts': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      dias: { type: 'number', description: 'Quantos dias à frente (default 7, máx 14).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'colocar-na-agenda': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postType: { type: 'string', enum: ['STORY', 'POST', 'REEL', 'CAROUSEL'], description: 'Tipo de publicação (padrão STORY).' },
      caption: { type: 'string', description: 'Legenda. Story costuma ir sem.' },
      scheduledDatetime: { type: 'string', description: 'Quando: "AAAA-MM-DD HH:mm" no horário de Brasília.' },
      pageId: { type: 'string', description: 'A arte criada aqui (veio de criar-arte ou criar-arte-de-modelo).' },
      mediaUrls: { type: 'array', items: { type: 'string' }, description: 'Imagens prontas, se não vier de uma arte criada aqui.' },
      generationId: { type: 'string', description: 'O generationId da arte. Para arte MELHORADA, basta ele — a imagem é resolvida sozinha (sem copiar URL). Vincula o criativo ao post e habilita melhorar depois. Passe sempre que tiver.' },
      situacao: {
        type: 'string',
        enum: ['rascunho', 'agendado'],
        description: 'rascunho (padrão) só aparece na agenda; agendado publica de verdade no Instagram do cliente. Use "agendado" apenas após confirmação explícita da pessoa.',
      },
      escopo: {
        type: 'string',
        enum: ['rotina', 'campanha', 'pontual'],
        description:
          'O que o sistema pode aprender com este post. "rotina" (padrão) é o post normal, que forma a cadência e o repertório do cliente. "campanha" é post de ação com começo e fim (festival, semana temática, promoção datada) — aprende para a próxima edição dela, não para a rotina. "pontual" é caso isolado (aviso de feriado, mudança de horário, recado de emergência) e não deve virar padrão nenhum.\n\nMarque quando souber: uma leva costuma misturar os três, e post pontual contado como rotina faz o sistema sugerir aviso de feriado toda semana. Não pergunte à pessoa com esse vocabulário — deduza do que ela pediu.',
      },
      campanhaId: {
        type: 'string',
        description:
          'Id da entrada de CAMPANHAS da base (de consultar-base) a que este post pertence. Informar isso já marca o post como campanha, e é o que permite avisar quando um post está marcado para depois do fim dela.',
      },
      sugestaoId: {
        type: 'string',
        description:
          'Se este post veio de um horário proposto por sugerir-posts, devolva aqui o sugestaoId daquele slot — inclusive quando você mudou o horário. É assim que o sistema aprende quais sugestões são boas: sem isso ele só enxerga o que foi aceito. Não invente nem reaproveite id de outra proposta; sem sugestão, omita.',
      },
    },
    required: ['projectId', 'scheduledDatetime'],
    additionalProperties: false,
  },
  'postar-agora': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postType: { type: 'string', enum: ['STORY', 'POST', 'REEL', 'CAROUSEL'], description: 'Tipo (padrão STORY).' },
      caption: { type: 'string', description: 'Legenda. Story costuma ir sem.' },
      pageId: { type: 'string', description: 'A arte criada aqui (de criar-arte ou criar-arte-de-modelo).' },
      mediaUrls: { type: 'array', items: { type: 'string' }, description: 'Imagens prontas, se não vier de uma arte criada aqui.' },
      generationId: { type: 'string', description: 'O generationId da arte, se houver (habilita melhorar depois).' },
      escopo: {
        type: 'string',
        enum: ['rotina', 'campanha', 'pontual'],
        description:
          'O que o sistema pode aprender com este post — mesma escolha de colocar-na-agenda. Publicação imediata costuma ser "pontual" (recado, aviso, algo que aconteceu agora): marcar assim evita que vire cadência.',
      },
      campanhaId: {
        type: 'string',
        description: 'Id da entrada de CAMPANHAS da base a que este post pertence (de consultar-base).',
      },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'aprovar-rascunhos': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ids dos posts a aprovar (de ver-agenda ou do retorno de colocar-na-agenda).',
      },
    },
    required: ['projectId', 'postIds'],
    additionalProperties: false,
  },
  'voltar-para-rascunho': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ids dos posts a devolver para rascunho.',
      },
    },
    required: ['projectId', 'postIds'],
    additionalProperties: false,
  },
  'editar-post': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postId: { type: 'string', description: 'Id do rascunho (de ver-agenda).' },
      caption: { type: 'string', description: 'Nova legenda (substitui a inteira).' },
      postType: { type: 'string', enum: ['STORY', 'POST', 'REEL', 'CAROUSEL'], description: 'Novo tipo (opcional).' },
    },
    required: ['projectId', 'postId'],
    additionalProperties: false,
  },
  'trocar-arte-do-post': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postId: { type: 'string', description: 'Id do rascunho (de ver-agenda).' },
      generationId: {
        type: 'string',
        description: 'A arte pronta que vai entrar (id de criar-arte/gerar-imagem/melhorar-arte).',
      },
      pageId: {
        type: 'string',
        description: 'A arte criada aqui que vai entrar — é renderizada na hora, como a página está agora.',
      },
      indice: {
        type: 'number',
        description: 'Qual imagem trocar num carrossel: 0 é a primeira, 1 a segunda. Padrão 0.',
      },
    },
    required: ['projectId', 'postId'],
    additionalProperties: false,
  },
  'reagendar-post': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postId: { type: 'string', description: 'Id do post (de ver-agenda).' },
      novaDataHora: {
        type: 'string',
        description: 'Novo horário: "AAAA-MM-DD HH:mm" no horário de Brasília.',
      },
    },
    required: ['projectId', 'postId', 'novaDataHora'],
    additionalProperties: false,
  },
  'cancelar-post': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      postId: { type: 'string', description: 'Id do post a cancelar.' },
    },
    required: ['projectId', 'postId'],
    additionalProperties: false,
  },
}

comparaSchemas(
  'listar-clientes',
  CATALOGO.get('listar-clientes')?.schemaJson,
  LITERAL_LISTAR_CLIENTES,
)
comparaSchemas(
  'criar-arte-de-modelo',
  CATALOGO.get('criar-arte-de-modelo')?.schemaJson,
  LITERAL_CRIAR_ARTE_DE_MODELO,
)
for (const [nome, literal] of Object.entries(LITERAIS_AGENDA)) {
  comparaSchemas(nome, CATALOGO.get(nome)?.schemaJson, literal)
}

// ─────────────────────────────────────────────────────────────────────────
// C. A porta, com catálogo e gates de mentira
// ─────────────────────────────────────────────────────────────────────────

console.log('\nC. Comportamento da porta')

const PRINCIPAL: McpPrincipal = { kind: 'service' }

const chamadasDeGate: Array<{ tipo: string; projectId: number }> = []
const gates = {
  projeto: async (projectId: number) => {
    chamadasDeGate.push({ tipo: 'projeto', projectId })
    if (projectId === 999) {
      throw new CreativeError('PROJETO_SEM_ACESSO', 'sem acesso ao 999', 403)
    }
  },
  curador: async (projectId: number) => {
    chamadasDeGate.push({ tipo: 'curador', projectId })
  },
}

const eco = definirTool({
  nome: 'eco-de-teste',
  apelidos: ['echo-test'],
  descricao: 'Devolve o que recebeu.',
  schema: z.object({
    texto: z.string().describe('Texto a ecoar.'),
    lista: z.array(z.number()).optional().describe('Lista opcional.'),
    modo: z.enum(['a', 'b']).optional().describe('Modo.'),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false },
  acesso: { tipo: 'autenticado' },
  superficies: ['remoto'],
  handler: async (args) => ({ eco: args }),
})

const soLocal = definirTool({
  nome: 'so-local-de-teste',
  descricao: 'Só existe no stdio.',
  schema: z.object({}),
  annotations: { readOnlyHint: true, destructiveHint: false },
  acesso: { tipo: 'autenticado' },
  superficies: ['local'],
  handler: async () => ({ ok: true }),
})

const comGate = definirTool({
  nome: 'com-gate-de-teste',
  descricao: 'Exercita o gate declarado.',
  schema: z.object({ projectId: z.number().describe('ID.') }),
  annotations: { readOnlyHint: false, destructiveHint: false },
  acesso: { tipo: 'projeto' },
  superficies: ['remoto'],
  handler: async () => ({ passou: true }),
})

const visual = definirTool({
  nome: 'visual-de-teste',
  descricao: 'Devolve blocos prontos.',
  schema: z.object({}),
  annotations: { readOnlyHint: true, destructiveHint: false },
  acesso: { tipo: 'autenticado' },
  superficies: ['remoto'],
  handler: async () => ({ _mcpContent: [{ type: 'text', text: 'bloco' }] }),
})

const queLanca = definirTool({
  nome: 'que-lanca-de-teste',
  descricao: 'Lança ErroDeTool.',
  schema: z.object({}),
  annotations: { readOnlyHint: true, destructiveHint: false },
  acesso: { tipo: 'autenticado' },
  superficies: ['remoto'],
  handler: async () => {
    throw new ErroDeTool({
      codigo: 'REGRA_DE_NEGOCIO',
      mensagem: 'não pode',
      comoResolver: 'tente outra coisa',
    })
  },
})

function indiceDe(tools: ToolPronta[]): Map<string, ToolPronta> {
  const indice = new Map<string, ToolPronta>()
  for (const tool of tools) {
    for (const nome of [tool.nome, ...tool.apelidos]) indice.set(nome, tool)
  }
  return indice
}

const indiceFalso = indiceDe([eco, soLocal, comGate, visual, queLanca])

async function porta(nome: string, args: Record<string, unknown> | undefined, extras?: {
  legado?: Parameters<typeof executarTool>[5]['legado']
}) {
  return executarTool(indiceFalso, 'remoto', nome, args, PRINCIPAL, {
    gates,
    legado: extras?.legado,
  })
}

function textoDe(resultado: { content: Array<Record<string, unknown>> }): string {
  return String(resultado.content[0]?.text ?? '')
}

async function secaoC() {
  // 1. desconhecida sem legado
  {
    const r = await porta('nao-existe', {})
    confere(
      'desconhecida sem legado → "Ferramenta desconhecida"',
      r.isError === true && textoDe(r) === 'Ferramenta desconhecida: nao-existe',
      textoDe(r),
    )
  }

  // 2. desconhecida com legado → repassa
  {
    let chamado: string | null = null
    const r = await porta('nao-existe', { x: 1 }, {
      legado: async (nome) => {
        chamado = nome
        return { content: [{ type: 'text', text: 'do legado' }] }
      },
    })
    confere('desconhecida com legado → fallback chamado', chamado === 'nao-existe' && textoDe(r) === 'do legado')
  }

  // 3. apelido resolve
  {
    const r = await porta('echo-test', { texto: 'oi' })
    confere('apelido resolve na chamada', !r.isError && textoDe(r).includes('"texto": "oi"'), textoDe(r))
  }

  // 4. superfície errada NÃO cai no legado
  {
    let legadoChamado = false
    const r = await porta('so-local-de-teste', {}, {
      legado: async () => {
        legadoChamado = true
        return { content: [{ type: 'text', text: 'não devia' }] }
      },
    })
    confere(
      'tool de outra superfície → desconhecida, sem fallback',
      r.isError === true && !legadoChamado && textoDe(r).startsWith('Ferramenta desconhecida'),
      textoDe(r),
    )
  }

  // 5. chave desconhecida → mensagem VERBATIM do guard legado
  {
    const r = await porta('eco-de-teste', { texto: 'oi', filtro: 'x' })
    confere(
      'chave extra → mensagem calibrada (12/08) com a lista de aceitos',
      r.isError === true &&
        textoDe(r) ===
          'A ferramenta eco-de-teste não conhece "filtro". Os parâmetros aceitos são: texto, lista, modo.',
      textoDe(r),
    )
  }

  // 6. required faltando
  {
    const r = await porta('eco-de-teste', {})
    confere(
      'required ausente → falta "campo"',
      r.isError === true && textoDe(r).includes('falta "texto"'),
      textoDe(r),
    )
  }

  // 7. tipo errado
  {
    const r = await porta('com-gate-de-teste', { projectId: 'doze' })
    confere(
      'tipo errado → espera número, veio texto',
      r.isError === true && textoDe(r).includes('"projectId" espera número, veio texto'),
      textoDe(r),
    )
  }

  // 8. enum violado é ERRO claro (não default silencioso)
  {
    const r = await porta('eco-de-teste', { texto: 'oi', modo: 'z' })
    confere(
      'enum violado → lista as opções',
      r.isError === true && textoDe(r).includes('"modo" aceita: a, b'),
      textoDe(r),
    )
  }

  // 9. coerção string→lista (23/08) antes do parse
  {
    const r = await porta('eco-de-teste', { texto: 'oi', lista: '[1,2]' })
    confere(
      'coerção de string JSON → o handler recebe a lista',
      !r.isError && textoDe(r).includes('"lista": [\n      1,\n      2\n    ]'),
      textoDe(r),
    )
  }

  // 10. gate declarado roda com o id certo
  {
    chamadasDeGate.length = 0
    const r = await porta('com-gate-de-teste', { projectId: 7 })
    confere(
      'gate "projeto" chamado com o id validado',
      !r.isError && chamadasDeGate.length === 1 && chamadasDeGate[0].projectId === 7,
    )
  }

  // 11. gate negando → CreativeError vira o MESMO JSON de hoje
  {
    const r = await porta('com-gate-de-teste', { projectId: 999 })
    confere(
      'gate nega → isError com o JSON do CreativeError',
      r.isError === true && textoDe(r).includes('"error": "PROJETO_SEM_ACESSO"'),
      textoDe(r),
    )
  }

  // 12. _mcpContent passa intacto
  {
    const r = await porta('visual-de-teste', {})
    confere(
      '_mcpContent atravessa sem embrulho',
      !r.isError && r.content.length === 1 && r.content[0].text === 'bloco',
    )
  }

  // 13. ErroDeTool → envelope da taxonomia
  {
    const r = await porta('que-lanca-de-teste', {})
    confere(
      'ErroDeTool → JSON com codigo e comoResolver',
      r.isError === true &&
        textoDe(r).includes('"codigo": "REGRA_DE_NEGOCIO"') &&
        textoDe(r).includes('"comoResolver": "tente outra coisa"'),
      textoDe(r),
    )
  }

  // 14. args undefined não estoura (tools/call sem arguments)
  {
    const r = await porta('visual-de-teste', undefined)
    confere('args ausentes viram objeto vazio', !r.isError)
  }
}

secaoC()
  .then(() => {
    console.log(`\n${passos} verificações, ${falhas} falha(s).`)
    if (falhas > 0) process.exitCode = 1
  })
  .catch((error) => {
    console.error('\nO script quebrou antes de terminar:', error)
    process.exitCode = 1
  })
