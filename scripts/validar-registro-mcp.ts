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
import { INSTRUCOES } from '../src/lib/mcp/instrucoes'
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
 * `$schema` some; `additionalProperties: {}`, `true` e AUSENTE são o mesmo
 * significado em JSON Schema (permite tudo) e colapsam em ausente — é o que
 * deixa `.passthrough()` do zod casar com literal antigo que não fechava o
 * objeto; objeto sem `properties` equivale a `properties: {}`. Só o `false`
 * (porta fechada) é significativo e preservado. Chaves ordenadas.
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
      if (chave === 'additionalProperties' && v === true) continue
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

/** PR 4 — os literais da arte por IA, verbatim. */
const REF_LITERAL_GERAR_IMAGEM = {
  type: 'object',
  properties: {
    role: {
      type: 'string',
      enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'],
      description: 'Papel da foto na geração.',
    },
    driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos / listar-fotos-da-pasta).' },
    url: { type: 'string', description: 'Alternativa: URL de imagem já no Studio (Blob).' },
    label: { type: 'string', description: 'Rótulo curto (ex: "salão principal", "picanha na tábua").' },
    generationId: {
      type: 'string',
      description:
        'Só em role "style": o id da arte deste projeto que serve de MODELO. Com ele a peça nova copia a DIAGRAMAÇÃO daquela arte — posição do texto, alinhamento, caixa das letras, cor por nível e ornamentos —, mudando só a foto e a copy. Sem ele, a referência combina apenas clima e luz, e o layout continua livre. Use quando alguém disser "faz parecida com aquela".',
    },
    excluir: {
      type: 'array',
      items: { type: 'string' },
      description:
        'O que NÃO reproduzir desta foto (ex: ["garrafa de molho", "lata de refrigerante"]). Use para marca de terceiro que aparece na foto e não pode ir para a peça — dizer isso dentro do `pedido` não segura: na produção do By Rock a garrafa de Tabasco vazou em 2 de 6 peças mesmo com a instrução explícita.',
    },
  },
  required: ['role'],
  additionalProperties: false,
}

const REF_LITERAL_LOTE = {
  type: 'object',
  properties: {
    role: { type: 'string', enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'] },
    driveFileId: { type: 'string' },
    url: { type: 'string' },
    label: { type: 'string' },
    excluir: { type: 'array', items: { type: 'string' } },
  },
  required: ['role'],
  additionalProperties: false,
}

const LITERAIS_ARTE_IA: Record<string, unknown> = {
  'escolher-modelo': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do projeto (preferido). Veja list-projects.' },
      projectHint: { type: 'string', description: 'Nome ou parte do nome do projeto, se não souber o id.' },
      theme: { type: 'string', description: 'Tema do criativo (ex: "happy hour", "almoço executivo", "delivery").' },
      day: { type: 'string', description: 'Dia da semana em PT para desempatar (ex: "sexta", "sabado").' },
    },
    required: ['theme'],
    additionalProperties: false,
  },
  'criar-arte': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do projeto.' },
      formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'story 1080x1920 (default), feed 1080x1350, quadrado 1080x1080.' },
      imageUrl: { type: 'string', description: 'URL pública da foto de fundo.' },
      driveImageId: { type: 'string', description: 'ID do arquivo no Google Drive, alternativa ao imageUrl.' },
      backgroundColor: { type: 'string', description: 'Cor de fundo quando não houver foto (ex: "#111111").' },
      overlay: { type: 'string', enum: ['nenhum', 'inferior', 'superior', 'completo'], description: 'Escurecimento sobre a foto. Default "inferior".' },
      combinationId: { type: 'string', description: 'ID da combinação tipográfica (ver list-font-combinations).' },
      textos: { type: 'object', description: 'Textos da combinação, por id ou label do elemento. Ex: {"titulo":"HAPPY HOUR","detalhes":"Todo dia até as 20h"}.', additionalProperties: { type: 'string' } },
      textosLivres: {
        type: 'array',
        description: 'Blocos posicionados por você. Alternativa à combinação.',
        items: {
          type: 'object',
          properties: {
            texto: { type: 'string', description: 'Conteúdo. \n quebra linha.' },
            x: { type: 'number', description: 'Canto esquerdo, fração da largura (0..1).' },
            y: { type: 'number', description: 'Topo, fração da altura (0..1).' },
            width: { type: 'number', description: 'Largura da caixa, fração da largura (0..1).' },
            fontSize: { type: 'number', description: 'Corpo em px na base de 1080 de largura.' },
            role: { type: 'string', enum: ['title', 'subtitle', 'body'], description: 'De qual fonte da marca herda. subtitle cai na fonte de corpo quando a marca não define uma própria.' },
            fontFamily: { type: 'string' },
            fontWeight: { type: 'string' },
            textTransform: { type: 'string', enum: ['none', 'uppercase'] },
            textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
            lineHeight: { type: 'number' },
            letterSpacing: { type: 'number' },
            color: { type: 'string' },
          },
          required: ['texto', 'x', 'y', 'width', 'fontSize'],
        },
      },
      logo: { type: 'boolean', description: 'Inclui o logo da marca (default true).' },
      name: { type: 'string', description: 'Nome da página gerada.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'ajustar-arte': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      pageId: { type: 'string', description: 'A arte a ajustar (pageId devolvido por criar-arte ou criar-arte-de-modelo).' },
      slotValues: {
        type: 'object',
        description: 'Só o que muda: chave = id ou nome da camada, valor = novo texto (string) ou {content, fileUrl}.',
        additionalProperties: true,
      },
      imageUrl: { type: 'string', description: 'Nova foto de fundo (URL pública).' },
      driveImageId: { type: 'string', description: 'Nova foto de fundo pelo id do Drive (de buscar-fotos).' },
      name: { type: 'string', description: 'Novo nome da página (opcional).' },
    },
    required: ['projectId', 'pageId'],
    additionalProperties: false,
  },
  'conferir-arte': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      generationId: { type: 'string', description: 'A arte (vem de criar-arte, criar-arte-de-modelo ou ajustar-arte).' },
      postId: { type: 'string', description: 'Alternativa: confere a arte ATUAL de um post da agenda.' },
      verificarTextos: { type: 'boolean', description: 'Roda a conferência de texto por visão (default true; só quando há textos de referência).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'melhorar-arte': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      generationId: { type: 'string', description: 'A arte a melhorar (de criar-arte, criar-arte-de-modelo, ajustar-arte ou do post).' },
      pedido: { type: 'string', description: 'Instruções de melhoria vindas da sua análise da arte (máx 1200 caracteres). Vazio = só as diretrizes do Diretor de Arte da marca.' },
      postId: { type: 'string', description: 'Post da agenda (rascunho ou agendado) que recebe a arte melhorada ao final (opcional — sem ele a melhoria fica na galeria).' },
    },
    required: ['projectId', 'generationId'],
    additionalProperties: false,
  },
  'ver-geracao': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      geracaoId: { type: 'string', description: 'O geracaoId (ou melhoriaId) devolvido por quem disparou.' },
      melhoriaId: { type: 'string', description: 'Nome antigo de `geracaoId` — segue aceito.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'gerar-imagem': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      trilha: {
        type: 'string',
        enum: ['imagem', 'arte'],
        description: '"imagem" = cena sem texto; "arte" = peça com os textos desenhados.',
      },
      pedido: {
        type: 'string',
        description:
          'O que gerar, em português (máx 1200). Obrigatório na trilha imagem; na trilha arte é instrução adicional opcional.',
      },
      copy: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Trilha arte: os blocos de texto EXATOS da peça, na ordem de leitura (máx 12 blocos de 200 chars). As PALAVRAS são reproduzidas verbatim e conferidas por visão; a CAIXA das letras, não — quem decide se a manchete sai em caixa alta é a identidade da marca. Escreva em caixa natural ("Desacelere e desfrute"), deixando em maiúsculas só sigla, unidade, valor e o nome da marca.',
      },
      formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'story 9:16, feed 4:5, quadrado 1:1.' },
      referencias: {
        type: 'array',
        items: REF_LITERAL_GERAR_IMAGEM,
        description: '1 a 3 fotos reais com papel declarado. Máx: 1 subject + 3 âncoras + 2 style.',
      },
      instrucaoImagem: {
        type: 'string',
        description:
          'Trilha arte, opcional: ajuste autorizado na FOTO (ex: "escurecer o fundo atrás do texto", "cortar o primeiro pedaço ao meio mostrando o ponto da carne"). Sem isso a foto é preservada intocada — a regra da casa é "a foto se melhora, nunca se modifica". Com ajuste, a peça é gerada no modelo mais caprichoso (leva ~2 min em vez de ~40s, mesmo custo em créditos): editar foto exige detalhe que o modelo rápido não entrega.',
      },
      clienteCitadoId: {
        type: 'number',
        description:
          'Trilha arte, opcional — co-branding: o ID do cliente CITADO na peça (de listar-clientes). A logomarca oficial dele é composta na arte no canto oposto ao da marca da casa. É como uma agência mostra o trabalho feito para um cliente.',
      },
      promptPronto: {
        type: 'string',
        description: 'Modo diretor (trilha imagem): prompt final em inglês, anatomia CAMERA:/LIGHT:/…; validado antes de usar.',
      },
      modelo: {
        type: 'string',
        description:
          'Override do modelo, trilha imagem. "nano-banana-2" (padrão, 10 créditos) ou "nano-banana-pro" (15 créditos em 2K, e o único que entrega 4K). Não troque sem motivo: o padrão resolve a maioria das cenas.',
      },
      resolution: {
        type: 'string',
        enum: ['2K', '4K'],
        description:
          'Trilha imagem, padrão 2K (~1536x2752 no 9:16). "4K" só existe no nano-banana-pro, entrega ~3072x5504 e custa 30 créditos — o TRIPLO do padrão. Peça 4K quando a foto for virar arte depois e precisar de margem para recorte; para uso direto, 2K basta. (1K foi removido: custava o mesmo que 2K e entregava um quarto dos pixels.)',
      },
    },
    required: ['projectId', 'trilha', 'formato'],
    additionalProperties: false,
  },
  'gerar-imagem-lote': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      trilha: { type: 'string', enum: ['imagem', 'arte'], description: 'Vale para o lote inteiro.' },
      formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'Vale para o lote inteiro.' },
      modelo: { type: 'string', description: 'Override do modelo (trilha imagem).' },
      resolution: { type: 'string', enum: ['2K', '4K'], description: 'Trilha imagem, padrão 2K.' },
      pedidoBase: {
        type: 'string',
        description: 'O que TODAS as cenas têm em comum (máx 1200). Cada variação acrescenta o que muda.',
      },
      referenciasBase: {
        type: 'array',
        items: REF_LITERAL_LOTE,
        description: 'Referências que valem para todas. A variação pode ACRESCENTAR as suas.',
      },
      variacoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pedido: { type: 'string', description: 'O que muda nesta peça (gesto, cenário, prato).' },
            promptPronto: { type: 'string', description: 'Modo diretor, só desta peça.' },
            copy: { type: 'array', items: { type: 'string' }, description: 'Trilha arte: os blocos desta peça.' },
            referencias: { type: 'array', items: REF_LITERAL_LOTE },
            instrucaoImagem: { type: 'string', description: 'Ajuste autorizado na foto, só desta peça.' },
          },
          additionalProperties: false,
        },
        description: 'De 2 a 12 peças. Cada uma herda a base e acrescenta o que é seu.',
      },
    },
    required: ['projectId', 'trilha', 'formato', 'variacoes'],
    additionalProperties: false,
  },
  'marcar-referencia-de-estilo': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      generationId: { type: 'string', description: 'A arte. Omita para apenas listar as referências atuais.' },
      marcada: { type: 'boolean', description: 'true marca (default), false tira das referências.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'criar-carrossel': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ordem: { type: 'number', description: 'Posição no carrossel, de 1 a N. 1 = capa.' },
            copy: {
              type: 'array',
              items: { type: 'string' },
              description: 'Blocos de texto do slide, na ordem de leitura. VAZIO na capa.',
            },
            driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos).' },
            url: { type: 'string', description: 'Alternativa: imagem já no Studio.' },
            label: { type: 'string', description: 'Rótulo curto da foto.' },
          },
          required: ['ordem', 'copy'],
          additionalProperties: false,
        },
        description: 'Os slides, de 1 a N. Varie as fotos: repetir a mesma foto entre slides deixa o carrossel monótono.',
      },
      legenda: { type: 'string', description: 'Legenda do post no feed (guardada para o agendamento).' },
      pedido: { type: 'string', description: 'Direção de arte adicional para toda a série (opcional).' },
    },
    required: ['projectId', 'slides'],
    additionalProperties: false,
  },
  'confirmar-estilo-carrossel': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      carrosselId: { type: 'string', description: 'O carrosselId devolvido por criar-carrossel.' },
    },
    required: ['projectId', 'carrosselId'],
    additionalProperties: false,
  },
  'ver-carrossel': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      carrosselId: { type: 'string', description: 'O carrosselId devolvido por criar-carrossel.' },
    },
    required: ['projectId', 'carrosselId'],
    additionalProperties: false,
  },
}

for (const [nome, literal] of Object.entries(LITERAIS_AGENDA)) {
  comparaSchemas(nome, CATALOGO.get(nome)?.schemaJson, literal)
}
for (const [nome, literal] of Object.entries(LITERAIS_PLANOS)) {
  comparaSchemas(nome, CATALOGO.get(nome)?.schemaJson, literal)
}
/**
 * PR 5 — os literais do restante, verbatim. Os enums que o array montava por
 * import (Object.values(KnowledgeCategory), BRAND_DNA_FIELDS) aparecem aqui
 * RESOLVIDOS — e é o espelho de base-e-dna.ts + as sentinelas de integracao.ts
 * que garantem que continuam iguais aos donos.
 */
const CATEGORIAS = ['ESTABELECIMENTO_INFO', 'HORARIOS', 'CARDAPIO', 'DELIVERY', 'POLITICAS', 'TOM_DE_VOZ', 'CAMPANHAS', 'DIFERENCIAIS', 'FAQ']
const SECOES = ['toneOfVoice', 'contentRules', 'composition', 'visualStyle', 'photoDirection', 'approvalChecklist']

const LITERAIS_RESTANTE: Record<string, unknown> = {
  'consultar-base': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do projeto.' },
      category: { type: 'string', enum: CATEGORIAS, description: 'Filtra por categoria. Omita para trazer tudo.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'consultar-dna': {
    type: 'object',
    properties: { projectId: { type: 'number', description: 'ID do cliente.' } },
    required: ['projectId'],
    additionalProperties: false,
  },
  'atualizar-dna': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      toneOfVoice: { type: ['string', 'null'], description: 'Como a marca fala (usado em copies e chat). null limpa.' },
      contentRules: { type: ['string', 'null'], description: 'O que nunca fazer ou dizer (usado em copies, chat e artes). null limpa.' },
      composition: { type: ['string', 'null'], description: 'Como os elementos se organizam nas artes. null limpa.' },
      visualStyle: { type: ['string', 'null'], description: 'A estética geral da marca (usado nas artes). null limpa.' },
      photoDirection: { type: ['string', 'null'], description: 'Luz e tratamento fotográfico (usado nas artes). null limpa.' },
      approvalChecklist: {
        type: ['string', 'null'],
        description: 'Crivo de aprovação: perguntas binárias, UMA POR LINHA, conferidas por gente antes de agendar. NÃO entra em prompt de geração. null limpa.',
      },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'virar-regra': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      secao: {
        type: 'string',
        enum: SECOES,
        description: 'Onde a regra mora no DNA: contentRules (proibições), composition (layout), visualStyle (estética), photoDirection (foto), toneOfVoice (texto), approvalChecklist (crivo). Obrigatória para regra PERMANENTE; dispensável quando você manda validade.',
      },
      regra: { type: 'string', description: 'A regra na forma imperativa, como deve valer daqui para a frente.' },
      motivo: { type: 'string', description: 'O caso concreto que gerou a regra. Sem motivo a regra não se explica daqui a três meses.' },
      validade: {
        type: 'string',
        description: 'Último dia em que a regra vale (AAAA-MM-DD). Manda a regra para a base de conhecimento, categoria CAMPANHAS, em vez do DNA — ela deixa de valer sozinha depois dessa data.',
      },
      titulo: { type: 'string', description: 'Título da entrada na base, quando a regra tem validade (ex: "Festival Italiano — agosto"). Opcional.' },
      confirmado: { type: 'boolean', description: 'Só grava com true. Sem isto devolve a proposta para você mostrar à pessoa.' },
    },
    required: ['projectId', 'regra', 'motivo'],
    additionalProperties: false,
  },
  'criar-entrada-base': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      category: { type: 'string', enum: CATEGORIAS, description: 'Categoria da entrada (TOM_DE_VOZ, HORARIOS, CARDAPIO, CAMPANHAS...).' },
      title: { type: 'string', description: 'Título curto e específico (ex: "Promoção Costela no Bafo — agosto").' },
      content: { type: 'string', description: 'O conteúdo, em texto corrido, do jeito que deve alimentar as copies.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas opcionais para busca.' },
      validade: {
        type: 'string',
        description: 'Último dia em que a informação vale (AAAA-MM-DD, no fuso de Brasília — o dia inteiro conta). Depois disso a entrada sai sozinha dos textos e das sugestões. Obrigatório na prática para CAMPANHAS com data de fim; omita só para informação permanente (horário, cardápio fixo, política).',
      },
    },
    required: ['projectId', 'category', 'title', 'content'],
    additionalProperties: false,
  },
  'atualizar-entrada-base': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      entradaId: { type: 'string', description: 'Id da entrada (de consultar-base).' },
      title: { type: 'string', description: 'Novo título (opcional).' },
      content: { type: 'string', description: 'Novo conteúdo completo (opcional — substitui o texto inteiro, não é acréscimo).' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Novas etiquetas (opcional, substitui as atuais).' },
      category: { type: 'string', enum: CATEGORIAS, description: 'Nova categoria (opcional).' },
      validade: {
        type: ['string', 'null'],
        description: 'Último dia em que a informação vale (AAAA-MM-DD, fuso de Brasília — o dia inteiro conta). null tira o prazo e a entrada volta a valer para sempre.',
      },
    },
    required: ['projectId', 'entradaId'],
    additionalProperties: false,
  },
  'arquivar-entrada-base': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      entradaId: { type: 'string', description: 'Id da entrada (de consultar-base).' },
    },
    required: ['projectId', 'entradaId'],
    additionalProperties: false,
  },
  'buscar-fotos': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do projeto.' },
      theme: { type: 'string', description: 'Tema — casa com tags, bestFor e o caminho da pasta (ex: "ambiente", "picanha", "chopp").' },
      folder: { type: 'string', description: 'Pasta exata ou prefixo (ex: "01_cortes/picanha-bovina", "02_ambiente"). Veja pastasDisponiveis no retorno.' },
      menuCategory: { type: 'string', description: 'Categoria do cardápio (ex: PRATOS_PRINCIPAIS, BEBIDAS).' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags a casar.' },
      quality: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Qualidade mínima.' },
      fileName: {
        type: 'string',
        description: 'Nome do arquivo, exato ou início dele ("ambiente-f3a" acha "ambiente-f3a8693.jpg"). Use quando já souber qual foto quer.',
      },
      limit: { type: 'number', description: 'Máximo de resultados (default 20). Pode pedir mais — não há teto.' },
      offset: { type: 'number', description: 'Quantas pular, para ver o resto da lista. A ordem é estável.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'marcar-foto-como-usada': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      driveFileIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'As fotos usadas (o driveFileId que buscar-fotos devolve). Aceita várias de uma vez.',
      },
      tema: { type: 'string', description: 'Assunto da peça, para explicar depois por que a foto foi usada.' },
      quando: { type: 'string', description: 'Data da publicação "AAAA-MM-DD". Padrão: hoje.' },
      // Mudança DELIBERADA de 30/08 (plano da sugestão de fotos): o id da arte
      // liga a foto à correção pós-produção na colheita do aprendizado.
      geracaoId: {
        type: 'string',
        description:
          'A arte que nasceu com essa foto (o id que gerar-imagem/ver-geracao usam). Preencha sempre que a foto virou uma arte identificável — em especial ao REFAZER uma peça na correção: é o que liga a foto escolhida ao aprendizado.',
      },
    },
    required: ['projectId', 'driveFileIds'],
    additionalProperties: false,
  },
  // Tool NOVA (29/08, F1.4 da sugestão de fotos) — o fixture nasce com ela,
  // como manda a regra do registro: mudança de schema daqui para a frente é
  // deliberada ou o snapshot acusa.
  'marcar-foto-destaque': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      driveFileId: { type: 'string', description: 'A foto (o driveFileId que buscar-fotos devolve).' },
      destaque: { type: 'boolean', description: 'true (default) marca como destaque; false tira o destaque.' },
    },
    required: ['projectId', 'driveFileId'],
    additionalProperties: false,
  },
  'pedir-foto': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente (a foto fica no acervo de envio dele).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'ver-foto-enviada': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      uploadId: { type: 'string', description: 'O uploadId devolvido por pedir-foto.' },
    },
    required: ['projectId', 'uploadId'],
    additionalProperties: false,
  },
  'listar-fotos-da-pasta': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do projeto.' },
      folder: {
        type: 'string',
        description: 'Pasta pelo NOME, exata ou prefixo ("09_ambiente" traz "09_ambiente/noite" junto). Veja pastasDisponiveis no retorno.',
      },
      limit: { type: 'number', description: 'Máximo de imagens (default 30).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'definir-ancora': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      sceneTag: {
        type: 'string',
        description: 'Tipo de cena em kebab-case (ex: "ambiente", "mesa", "chopp"). "ambiente" é a tag da injeção automática.',
      },
      driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos).' },
      url: { type: 'string', description: 'Alternativa: URL de imagem já no Studio.' },
      label: { type: 'string', description: 'Rótulo curto (ex: "salão com teto real").' },
      removerAncoraId: {
        type: 'string',
        description: 'Para REMOVER: id da âncora (de listar-ancoras). Ignora os outros campos.',
      },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'listar-ancoras': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'marcar-como-modelo': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      pageId: { type: 'string', description: 'A página a marcar (de criar-arte, ajustar-arte ou listar-modelos).' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Temas do modelo, normalizados com hífen (ex: ["happy-hour", "sexta"]). Substituem as tags atuais.',
      },
      marcar: { type: 'boolean', description: 'true (default) marca como modelo; false despromove.' },
    },
    required: ['projectId', 'pageId'],
    additionalProperties: false,
  },
  'listar-modelos': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      incluirNaoMarcadas: { type: 'boolean', description: 'Inclui páginas que ainda não são modelo (candidatas a promoção).' },
      limit: { type: 'number', description: 'Máximo de páginas (default 50, teto 200).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  'ver-feedback-das-artes': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      de: { type: 'string', description: 'Data inicial ("AAAA-MM-DD" ou ISO). Opcional.' },
      ate: { type: 'string', description: 'Data final ("AAAA-MM-DD" ou ISO). Opcional.' },
      veredito: {
        type: 'string',
        enum: ['gostei', 'melhorar'],
        description: 'Filtra só os elogios ou só os pedidos de melhoria (opcional).',
      },
      limit: { type: 'number', description: 'Máximo de itens (default 50, teto 200).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
}

for (const [nome, literal] of Object.entries(LITERAIS_ARTE_IA)) {
  comparaSchemas(nome, CATALOGO.get(nome)?.schemaJson, literal)
}
// Tool NOVA (30/08/2026, Fase 4a do Windsor) — o fixture nasce com ela, como
// manda a regra do registro: mudança de schema daqui para a frente é
// deliberada ou o snapshot acusa.
const LITERAIS_AVALIACOES: Record<string, unknown> = {
  'propor-resposta': {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'ID do cliente.' },
      reviewId: {
        type: 'string',
        description:
          'Avaliação do Google: o id da avaliação (da coleta diária ou do Farol). Devolve o rascunho guardado, ou gera e guarda.',
      },
      texto: {
        type: 'string',
        description: 'Comentário de Instagram: o texto do comentário a responder. Ignorado quando reviewId vier.',
      },
      autor: { type: 'string', description: 'Nome de quem comentou/avaliou (opcional, deixa o rascunho pessoal).' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
}

for (const [nome, literal] of Object.entries(LITERAIS_RESTANTE)) {
  comparaSchemas(nome, CATALOGO.get(nome)?.schemaJson, literal)
}
for (const [nome, literal] of Object.entries(LITERAIS_AVALIACOES)) {
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

async function porta(nome: string, args: Record<string, unknown> | undefined) {
  return executarTool(indiceFalso, 'remoto', nome, args, PRINCIPAL, { gates })
}

function textoDe(resultado: { content: Array<Record<string, unknown>> }): string {
  return String(resultado.content[0]?.text ?? '')
}

async function secaoC() {
  // 1. desconhecida → mensagem estável
  {
    const r = await porta('nao-existe', {})
    confere(
      'desconhecida → "Ferramenta desconhecida"',
      r.isError === true && textoDe(r) === 'Ferramenta desconhecida: nao-existe',
      textoDe(r),
    )
  }

  // 3. apelido resolve
  {
    const r = await porta('echo-test', { texto: 'oi' })
    confere('apelido resolve na chamada', !r.isError && textoDe(r).includes('"texto": "oi"'), textoDe(r))
  }

  // 4. superfície errada → não existe aqui
  {
    const r = await porta('so-local-de-teste', {})
    confere(
      'tool de outra superfície → desconhecida',
      r.isError === true && textoDe(r).startsWith('Ferramenta desconhecida'),
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

// ─────────────────────────────────────────────────────────────────────────
// D. As INSTRUCTIONS do handshake só citam tools que existem
// ─────────────────────────────────────────────────────────────────────────

console.log('\nD. Referências de tools nas INSTRUCTIONS')

/**
 * Palavras hifenizadas do texto que NÃO são nome de tool. Toda entrada nova
 * aqui é uma decisão explícita — o caso que este teste existe para impedir é
 * o `ver-melhoria`: a tool virou `ver-geracao` e o prompt recomendou o nome
 * morto por 12 dias, vivo só por apelido.
 */
const PALAVRAS_PERMITIDAS = new Set<string>([
  'grave-a', // ênclise em "…grave-a na base" — português, não tool
])

{
  const tokens = INSTRUCOES.match(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g) ?? []
  const desconhecidos = Array.from(new Set(tokens)).filter(
    (t) => !INDICE_DO_CATALOGO.has(t) && !PALAVRAS_PERMITIDAS.has(t),
  )
  confere(
    'todo nome hifenizado das INSTRUCTIONS é tool do catálogo (ou permitido)',
    desconhecidos.length === 0,
    `desconhecidos: ${desconhecidos.join(', ')}`,
  )
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
