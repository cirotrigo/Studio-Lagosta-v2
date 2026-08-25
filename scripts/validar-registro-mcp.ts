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
/** PR 3 — os literais do ciclo do plano, verbatim (Máximo 60 = MAX_ITENS_POR_PLANO resolvido). */
const LITERAIS_PLANOS: Record<string, unknown> = {
  'propor-semana': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      dias: { type: 'number', description: 'Quantos dias à frente olhar (default 7, máx 14).' },
      maxItens: { type: 'number', description: 'Quantos posts no máximo (default 7).' },
      formato: {
        type: 'string',
        enum: ['story', 'feed', 'quadrado'],
        description: 'Formato das peças (default story).',
      },
      observacao: {
        type: 'string',
        description: 'Recado de quem pediu ("é semana de festival", "foca no delivery").',
      },
      titulo: { type: 'string', description: 'Como a pessoa chama esta leva.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'criar-plano': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      titulo: { type: 'string', description: 'Como a pessoa chama esta leva ("Semana de 17 a 23/08").' },
      inicio: { type: 'string', description: 'Primeiro dia da leva ("AAAA-MM-DD").' },
      fim: { type: 'string', description: 'Último dia da leva ("AAAA-MM-DD"), incluído por inteiro.' },
      itens: {
        type: 'array',
        description: 'Os posts pretendidos, na ordem. Máximo 60.',
        items: {
          type: 'object',
          properties: {
            quando: { type: 'string', description: 'Dia e hora de Brasília ("AAAA-MM-DD HH:mm"). Pode ficar vazio se ainda não foi decidido.' },
            tema: { type: 'string', description: 'Do que é o post ("almoço executivo", "happy hour").' },
            texto: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Os blocos de texto da arte, na ordem de leitura (título, apoio, chamada). ESCREVA EM CAIXA NATURAL, como uma frase: "Desacelere e desfrute", nunca "DESACELERE E DESFRUTE". A caixa alta da manchete é decisão de tipografia e quem a toma é a identidade da marca na hora de desenhar a arte — não o texto que você digita. Deixe em maiúsculas só o que é maiúsculo de verdade: sigla, unidade, valor ("50% OFF") e o nome da marca.',
            },
            legenda: { type: 'string', description: 'A legenda do Instagram, quando houver.' },
            fotoDriveId: { type: 'string', description: 'A foto do acervo (de buscar-fotos).' },
            fotoUrl: { type: 'string', description: 'Alternativa: imagem já no Studio.' },
            formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'Obrigatório.' },
            via: {
              type: 'string',
              enum: ['template', 'ia'],
              description: 'Por onde a arte nasce: "template" (modelo do cliente, sem custo — o padrão) ou "ia" (gasta crédito).',
            },
            modeloId: {
              type: 'string',
              description: 'O modelo do cliente que vira a arte — o mesmo id que criar-arte-de-modelo recebe em sourcePageId, vindo de escolher-modelo.',
            },
            direcao: {
              type: 'string',
              description:
                'Via "ia": direção adicional para o modelo de imagem, além do tema — onde a foto é a cena, como tratar um print (ex.: "o print entra como mockup de celular sobre fundo preto, fiel e legível"), o clima da peça. Máx 1200.',
            },
            ajusteDaFoto: {
              type: 'string',
              description: 'Via "ia": ajuste autorizado na FOTO desta peça (ex.: "escurecer o fundo atrás do texto"). Sem isto a foto vai intocada, que é o padrão. ⚠️ Presente, a geração sai no tier caro e lento — dirigir a composição é papel da direção, não deste campo.',
            },
            referencias: {
              type: 'array',
              description:
                'Via "ia": as fotos da peça, cada uma com o papel dela — a cena (subject, obrigatória quando há texto), até 3 âncoras de ambiente/prato, até 2 de estilo e até 1 "documento" (print colado TAL E QUAL depois da geração — avaliação do Google, cartaz, QR). Presente, vence fotoDriveId/fotoUrl. Uma foto só? Use fotoDriveId, que continua valendo.',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'], description: 'Papel da foto na geração.' },
                  driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos).' },
                  url: { type: 'string', description: 'Alternativa: imagem já no Studio.' },
                  label: { type: 'string', description: 'Rótulo curto ("salão principal", "picanha na tábua").' },
                },
                required: ['role'],
                additionalProperties: false,
              },
            },
            clienteCitadoId: {
              type: 'number',
              description:
                'Co-branding: o ID do cliente CITADO na peça (de listar-clientes). A logomarca oficial dele é composta na arte, no canto oposto ao da marca da casa. Use sempre que a peça falar do trabalho feito para um cliente.',
            },
            motivoDoSlot: { type: 'string', description: 'Por que este horário — a frase que a pessoa lê ao revisar.' },
            escopo: {
              type: 'string',
              enum: ['rotina', 'campanha', 'pontual'],
              description: 'O que o sistema pode aprender com este post. Mesma escolha de colocar-na-agenda.',
            },
            campanhaId: { type: 'string', description: 'Entrada de CAMPANHAS da base a que este item pertence.' },
            sugestaoId: { type: 'string', description: 'Se o horário veio de sugerir-posts, devolva o sugestaoId dele aqui.' },
          },
          required: ['formato'],
          additionalProperties: false,
        },
      },
    },
    required: ['projectId', 'inicio', 'fim'],
    additionalProperties: false,
  },
  'ver-plano': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      planoId: { type: 'string', description: 'A leva (de criar-plano). Sem isto, a que está em aberto.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'editar-item-do-plano': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      planoId: { type: 'string', description: 'A leva. Sem isto, a que está em aberto.' },
      itemId: { type: 'string', description: 'O item (de ver-plano).' },
      quando: { type: 'string', description: 'Novo dia e hora de Brasília ("AAAA-MM-DD HH:mm").' },
      tema: { type: 'string', description: 'Novo tema.' },
      texto: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Novos blocos de texto da arte (substituem todos). Em caixa natural, como uma frase — a caixa alta da manchete quem decide é a identidade da marca ao desenhar, não o texto digitado aqui.',
      },
      legenda: { type: 'string', description: 'Nova legenda.' },
      fotoDriveId: { type: 'string', description: 'Outra foto do acervo.' },
      fotoUrl: { type: 'string', description: 'Outra imagem já no Studio.' },
      referencias: {
        type: 'array',
        description:
          'Substitui a lista INTEIRA de fotos da peça, cada uma com papel (a cena + âncoras + estilo + o print "documento", colado tal e qual). Lista vazia tira todas. Para trocar só a cena, fotoDriveId continua valendo.',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'] },
            driveFileId: { type: 'string' },
            url: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['role'],
          additionalProperties: false,
        },
      },
      formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'Novo formato.' },
      via: { type: 'string', enum: ['template', 'ia'], description: 'Troca a via de criação da arte.' },
      modeloId: { type: 'string', description: 'Outro modelo do cliente (de escolher-modelo).' },
      direcao: {
        type: 'string',
        description: 'Via "ia": nova direção adicional para o modelo de imagem (como tratar a foto ou o print, o clima da peça). String vazia limpa.',
      },
      ajusteDaFoto: { type: 'string', description: 'Via "ia": novo ajuste autorizado na foto. String vazia limpa (foto intocada).' },
      clienteCitadoId: {
        type: 'number',
        description: 'Co-branding: ID do cliente citado na peça, cuja logomarca é composta na arte. 0 remove.',
      },
      motivoDoSlot: { type: 'string', description: 'Nova explicação do horário.' },
      escopo: { type: 'string', enum: ['rotina', 'campanha', 'pontual'], description: 'Novo escopo de aprendizado.' },
      campanhaId: { type: 'string', description: 'Campanha a que o item passa a pertencer.' },
    },
    required: ['projectId', 'itemId'],
    additionalProperties: false,
  },
  'regenerar-item': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      planoId: { type: 'string', description: 'A leva. Sem isto, a que está em aberto.' },
      itemId: { type: 'string', description: 'O item (de ver-plano).' },
      motivo: { type: 'string', description: 'Por que não serve. Obrigatório — é o que ensina o sistema.' },
      voltarPara: {
        type: 'string',
        enum: ['editado', 'aprovado'],
        description: '"editado" (padrão, para você ajustar) ou "aprovado" (produzir de novo como está).',
      },
    },
    required: ['projectId', 'itemId', 'motivo'],
    additionalProperties: false,
  },
  'executar-plano': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      planoId: { type: 'string', description: 'A leva. Sem isto, a que está em aberto.' },
      itemIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Só estes itens (de ver-plano). Sem isto, todos os que estiverem prontos para produzir.',
      },
      confirmar: {
        type: 'boolean',
        description:
          'Só depois de a pessoa ver a conta e dizer sim. Sem isto a ferramenta apenas calcula e não produz nada.',
      },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'listar-combinacoes-de-texto': {
    type: 'object',
    properties: { projectId: { type: 'number', description: 'ID do projeto.' } },
    required: ['projectId'],
    additionalProperties: false,
  },
}

for (const [nome, literal] of Object.entries(LITERAIS_AGENDA)) {
  comparaSchemas(nome, CATALOGO.get(nome)?.schemaJson, literal)
}
for (const [nome, literal] of Object.entries(LITERAIS_PLANOS)) {
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

const comAninhado = definirTool({
  nome: 'aninhado-de-teste',
  descricao: 'Objeto estrito dentro de lista.',
  schema: z.object({
    itens: z.array(z.object({ formato: z.string() }).strict()).optional(),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false },
  acesso: { tipo: 'autenticado' },
  superficies: ['remoto'],
  handler: async (args) => ({ ok: true, itens: args.itens ?? [] }),
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

const indiceFalso = indiceDe([eco, comAninhado, soLocal, comGate, visual, queLanca])

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

  // 15. chave desconhecida ANINHADA aponta o caminho, não os params da raiz
  {
    const r = await porta('aninhado-de-teste', { itens: [{ formato: 'story', extra: 1 }] })
    confere(
      'chave extra aninhada → mensagem com o caminho do item',
      r.isError === true &&
        textoDe(r).includes('"itens.0" não aceita "extra"') &&
        !textoDe(r).includes('A ferramenta aninhado-de-teste não conhece'),
      textoDe(r),
    )
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
