/**
 * Catálogo · compositor (a usina de arte do editor — plano editor-como-usina).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; serviço e
 * helpers por `await import()` relativo dentro do handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'
// Módulos PUROS (zod + tipos): o catálogo continua carregando sem env.
import { GRUPOS_VISUAIS, PAPEIS, blocoSchema } from '../../compositor/spec'
import { MAX_LINHAS } from '../../copy-autoral/contrato'

/**
 * 🔴 Os limites do bloco vêm do schema da SPEC, nunca redeclarados aqui (R02 da
 * revisão dos patches do PR 10, 12/09/2026). O schema público exigia linha não
 * vazia e até 6 linhas, e `compor-arte`, `compor-leva` e `medir-copy` recusavam
 * na porta o respiro ("") e as 7 a 12 linhas que `validarSpec` e o contrato
 * aceitam. O id, o grupo de leitura e a ordem saem da mesma fonte, e os tetos
 * que ficam literais (40 blocos, 3 candidatas, 20 slides, 8 arranjos) têm teste
 * de paridade com a spec.
 */
const papelDaAssinatura = z.enum(PAPEIS)
const linhasDoBloco = blocoSchema.shape.linhas.describe(
  `As linhas do bloco, JÁ quebradas como devem aparecer (uma string por linha). Headline em 1-2 linhas curtas; apoio em 1-2 linhas. Linha vazia ("") é respiro e fica onde está; até ${MAX_LINHAS} linhas. Palavra-chave entre [colchetes] sai DESTACADA na cor e no peso de destaque da marca (ex.: "Seu milk-shake vem [em dobro]") — marque 1 ou 2 por peça, só o que decide a leitura (preço, dia, a oferta); sem colchetes, sem destaque.`,
)
/** O id de camada da spec (`idDeCamadaSchema`). */
const idDaCamadaExtra = blocoSchema.shape.id.unwrap()
const grupoVisual = z
  .enum(GRUPOS_VISUAIS)
  .describe('Onde a camada extra POUSA: principal (junto do bloco da manchete, depois dele), topo ou rodape (grupo próprio naquela borda). Padrão: servico vai ao rodape; o resto, ao principal. Nunca o lugar do papel de que ela herda o estilo.')
const grupoDeLeitura = blocoSchema.shape.grupoDeLeitura
  .unwrap()
  .describe('Os blocos que se leem como UMA frase têm o mesmo nome (pelo menos dois). É do autor: não muda posição — posição é o grupoVisual.')
const ordemDeLeitura = blocoSchema.shape.ordem
  .unwrap()
  .describe('A ordem de leitura da camada extra: os extras dos blocos e os de camadasExtras são ordenados JUNTOS por ela; sem ordem, vale a posição (blocos antes de camadasExtras).')

const bloco = z.object({
  papel: papelDaAssinatura.describe('O papel (a FUNÇÃO) do texto: pre (pré-título curto), headline (a manchete), apoio (a frase de apoio), cta (a chamada), servico (horário/endereço — vai para o rodapé).'),
  linhas: linhasDoBloco,
  herdaDe: papelDaAssinatura
    .optional()
    .describe('CAMADA EXTRA: o papel da assinatura de que este texto veste o estilo (fonte, peso, corpo, entrelinha, cor, sombra e prefixo) SEM virar esse papel e sem herdar a posição dele. Use quando a variante escolhida não tem o papel do texto — a linha de horário numa variante sem servico: papel "servico", herdaDe "apoio" — em vez de trocar de variante; ou para repetir um papel com estilo emprestado (a segunda linha de serviço). O herdaDe é sempre honrado, mesmo quando a variante tem o papel. A manchete nunca herda.'),
  id: idDaCamadaExtra
    .optional()
    .describe('Só com herdaDe: o id da camada extra, do autor e único na peça — obrigatório quando o papel se repete. Sem herdaDe a camada se chama pelo papel e um id é recusado. Não pode ser headline2, <papel>-N, bg-foto, logo, gradiente-leitura-* nem <texto>-elemento-N (a composição gera esses).'),
  grupoVisual: grupoVisual.optional(),
  grupoDeLeitura: grupoDeLeitura.optional(),
  ordem: ordemDeLeitura.optional(),
})

const camadaExtra = z.object({
  id: idDaCamadaExtra.describe('O id da camada extra, do autor e único na peça (mesmas proibições do id do bloco).'),
  linhas: linhasDoBloco,
  herdaDe: papelDaAssinatura.describe('O papel da assinatura de que a camada veste o estilo — sem virar esse papel e sem a posição dele.'),
  grupoVisual: grupoVisual.optional(),
  grupoDeLeitura: grupoDeLeitura.optional(),
  ordem: ordemDeLeitura.optional(),
})

const preferencias = z
  .object({
    tratamentoDeTexto: z.enum(['gradiente', 'assinatura', 'gradiente-suave-topo']).optional().describe('Legado — não precisa mandar. Todo texto ganha o gradiente de leitura na borda onde pousa (topo, rodapé ou os dois, em camadas independentes); os valores antigos dão o mesmo resultado.'),
    ancora: z.enum(['topo', 'meio', 'rodape', 'auto']).optional().describe('Onde o bloco de texto pousa. "auto" (default) deixa a foto decidir — a área mais calma ganha.'),
    alinha: z.enum(['esquerda', 'centro', 'direita', 'auto']).optional().describe('Alinhamento do bloco. "auto" (default) segue a área livre da foto.'),
    cantoDaMarca: z
      .enum(['inferior-esquerdo', 'inferior-direito', 'superior-esquerdo', 'superior-direito', 'auto', 'nenhum'])
      .optional()
      .describe('Canto da logo. "auto" (default) escolhe o canto mais calmo e escuro que não encosta no texto; "nenhum" tira a logo.'),
    enquadramento: z.enum(['auto', 'fixo']).optional().describe('"auto" (default) deixa o compositor deslocar o corte da foto para abrir área livre; "fixo" mantém o centro.'),
    variante: z.string().optional().describe('A variante da assinatura, quando o cliente tem mais de uma página no formato: o `id` da página (ver-assinatura lista; vence nome e tag, e é o que fixa a variante sem ambiguidade), ou o nome/tag. Sem isso: foto clara/escura escolhe entre as marcadas, e o rodízio varia entre as demais. A recomposição fixa sozinha a variante com que a peça nasceu.'),
    arranjos: z
      .array(z.union([z.string().max(160), z.object({ grupo: z.string().max(80), arranjo: z.string().max(160) })]))
      .max(8)
      .optional()
      .describe('Os arranjos de texto a REPETIR, por grupo: a `fixacao.arranjos` que medir-copy devolveu ([{ grupo, arranjo }]). Sem isso o rodízio de arranjos usa a chave da peça (que inclui a foto) e pode escolher outra combinação salva para um grupo — fonte, tamanho e distribuição das linhas mudam, e uma copy medida como "cabe" pode ser recusada. Mande junto com preferencias.variante para reproduzir uma medição.'),
  })
  .optional()

const spec = {
  projectId: z.number().describe('ID do cliente.'),
  formato: z.enum(['story', 'feed', 'quadrado']).describe('story (1080x1920), feed (1080x1350) ou quadrado (1080x1080).'),
  fotoDriveId: z.string().optional().describe('A foto do acervo (driveFileId de buscar-fotos). Preferido: liga a peça ao rodízio de fotos.'),
  selecaoExperimental: z.boolean().optional().describe('Opt-in explícito para comparar variantes com o baseline. Default false: candidatas presentes não ativam seleção nem alteram o layout. Comparação técnica, sem aprovação estética automática.'),
  fotosCandidatas: z.array(z.string().min(1)).min(1).max(3).optional().describe('Só com selecaoExperimental: true. Até 3 driveFileIds já curados por buscar-fotos, em ordem de relevância. Avalia até 6 combinações com variantes, sem geração paga. Foto explícita prevalece. Sem combinação utilizável retorna diagnóstico; não remove copy.'),
  fotoUrl: z.string().optional().describe('URL pública da foto, quando ela não está no acervo (ex.: fotoUrl de ver-foto-enviada).'),
  blocos: z
    .array(bloco)
    .max(40)
    .optional()
    .describe('A copy por papel, na ordem de leitura. Um bloco por papel; o papel só se repete como CAMADA EXTRA (herdaDe + id próprio). Dispensável quando copyAutoral vem — aí os blocos saem do contrato. Blocos e camadasExtras somados: até 40.'),
  camadasExtras: z
    .array(camadaExtra)
    .max(40)
    .optional()
    .describe('Texto SEM papel (uma nota, "vale só no almoço", um aviso) que veste o estilo de um papel da assinatura: {id, linhas, herdaDe, grupoVisual?, grupoDeLeitura?, ordem?}. Vira camada editável na página, com o id dado. Com copyAutoral não mande aqui: declare o bloco com funcao "livre" e estilo.herdaDe no contrato (as camadas extras saem dele).'),
  copyAutoral: z.record(z.string(), z.unknown()).optional().describe('O CONTRATO da copy autoral (F1): a copy inteira como você a escreveu — {versao: "copy-autoral-v1", origem: {autor: "claude", superficie: "chat"}, blocos: [{id, funcao (pre|headline|apoio|cta|servico|livre), grupoDeLeitura?, ordem, linhas (EXATAS: caixa, acento e [colchetes] como escritos), fatos?: [{entradaId, trecho}], estilo?: {herdaDe?, grupoVisual?, linhasNaVoz2?: [índices]}}], revisoes: []}. Com ele, `blocos` e `camadasExtras` são dispensáveis (saem do contrato, sem transformar texto). CAMADA EXTRA no contrato: bloco com estilo.herdaDe (o papel de que veste o estilo) e estilo.grupoVisual (principal|topo|rodape) — um bloco com função que a variante não tem (funcao "servico", herdaDe "apoio") ou um texto sem papel (funcao "livre", que EXIGE herdaDe). É o que deixa a copy inteira ser comparada com a arte depois (ver-geracao). O contrato é gravado ANTES de qualquer adaptação (página, arte e item).'),
  preferencias,
  nome: z.string().optional().describe('Nome da peça na galeria (opcional).'),
  tema: z.string().optional().describe('Tema/assunto, para o registro e o rodízio de layout.'),
  itemDePlanoId: z.string().optional().describe('Quando a peça é de um item de plano: o id do item (ver-plano).'),
  planoId: z.string().optional(),
  quando: z
    .string()
    .optional()
    .describe('Data/hora prevista (ISO). É o que decide a PASTA da peça na aba de templates (a semana daquela data) e a ordem dela lá dentro — sem isso a peça cai nas avulsas do mês.'),
  carrossel: z
    .object({
      slide: z.number().int().min(1).max(20).describe('A posição desta peça no carrossel como ele sai no Instagram — 1 é a capa. Carrossel cuja capa é foto do acervo começa as peças compostas no 2.'),
      de: z.number().int().min(2).max(20).optional().describe('Quantas mídias o carrossel tem no total.'),
    })
    .optional()
    .describe('Só quando a peça é SLIDE de um carrossel. É o que dá nome próprio a cada slide na pasta ("slide 2/5") e mantém a ordem deles — sem isso os irmãos ficam com nomes idênticos e a equipe não sabe qual é qual ao aprovar.'),
}

function specDe(args: Record<string, unknown>) {
  return {
    projectId: args.projectId,
    formato: args.formato,
    ...(args.fotoDriveId || args.fotoUrl ? { foto: { ...(args.fotoDriveId ? { driveFileId: args.fotoDriveId } : {}), ...(args.fotoUrl ? { url: args.fotoUrl } : {}) } } : {}),
    fotosCandidatas: args.fotosCandidatas,
    selecaoExperimental: args.selecaoExperimental,
    blocos: args.blocos,
    ...(Array.isArray(args.camadasExtras) ? { camadasExtras: args.camadasExtras } : {}),
    ...(args.copyAutoral && typeof args.copyAutoral === 'object' ? { copyAutoral: args.copyAutoral } : {}),
    ...(args.preferencias ? { preferencias: args.preferencias } : {}),
    ...(args.nome ? { nome: args.nome } : {}),
    ...(args.tema ? { tema: args.tema } : {}),
    ...(args.itemDePlanoId ? { itemDePlanoId: args.itemDePlanoId } : {}),
    ...(args.planoId ? { planoId: args.planoId } : {}),
    ...(args.quando ? { quando: args.quando } : {}),
    ...(args.carrossel ? { carrossel: args.carrossel } : {}),
  }
}

export const toolsDoCompositor = [
  definirTool({
    nome: 'reverter-arte',
    descricao:
      'Volta uma peça do compositor para como ela nasceu — desfaz o que foi ajustado no editor depois. Só peça composta (compor-arte/compor-leva) tem esse histórico. Os posts agendados que usam a página voltam à fila de render. Use quando a pessoa disser "voltou pior, desfaz" ou "quero a versão original".',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      generationId: z.string().describe('A arte (id de compor-arte / ver-geracao).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { reverterCamadasDaArte } = await import('../../compositor/reverter')
      return reverterCamadasDaArte(args.generationId as string, { projectId: args.projectId as number })
    },
  }),

  definirTool({
    nome: 'ver-ajustes-da-assinatura',
    descricao:
      'O que a equipe muda SISTEMATICAMENTE nas peças do compositor deste cliente (fonte encolhida, bloco deslocado, logo movida, alinhamento trocado) e o placar gostei/melhorar por posição do texto — destilado em PROPOSTAS de ajuste da assinatura, para a pessoa aprovar. Nunca aplica nada sozinho: quem muda a página de assinatura ou os números é gente. Use quando a pessoa perguntar "o que a equipe mais corrige?" ou antes de mexer na assinatura.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      dias: z.number().int().min(7).max(365).optional().describe('Janela em dias (default 60).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { destilarGeometria } = await import('../../aprendizado/destilar-geometria')
      const r = await destilarGeometria(args.projectId as number, typeof args.dias === 'number' ? args.dias : 60)
      return {
        ...r,
        nota:
          r.sinais === 0
            ? 'Ainda não há edição registrada em peça do compositor deste cliente — o sinal nasce quando a equipe ajusta uma peça composta no editor.'
            : 'Propostas são para aprovação humana: ajustar é abrir a página de assinatura no editor (estilo) ou Project.assinatura (números).',
      }
    },
  }),

  definirTool({
    nome: 'ver-assinatura',
    descricao:
      'Mostra a assinatura de composição do cliente: quais papéis de texto (pre, headline, apoio, cta, servico) a página de assinatura define, com fonte, tamanho, cor e o estilo do DESTAQUE de cada um, a logo, o gradiente de leitura e os números (margens, safe area). Use ANTES de compor-arte para saber o que o cliente tem — sem assinatura o compositor não compõe. Também diz o link para a equipe ajustar a assinatura no editor.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      formato: z.enum(['story', 'feed', 'quadrado']).optional().describe('Formato a conferir (default story).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { carregarAssinatura } = await import('../../compositor/compor')
      const { descreverVariantes } = await import('../../compositor/medir-copy-service')
      const { getPublicAppUrl } = await import('../../creatives/persist')
      const projectId = args.projectId as number
      const formato = (args.formato as 'story' | 'feed' | 'quadrado' | undefined) ?? 'story'
      const a = await carregarAssinatura(projectId, formato)
      // Cada variante com os PRÓPRIOS estilos, a fonte disponível no servidor,
      // a área útil do formato pedido e o orçamento por papel (PR 8).
      const { templateId, variantes } = await descreverVariantes(projectId, formato)
      const template = templateId ? { id: templateId } : null
      return {
        temAssinatura: Boolean(a.origem.pageId),
        formatoDaPagina: a.origem.formatoDaPagina,
        varianteCarregada: a.origem.pageId ? { id: a.origem.pageId, nome: a.origem.variante, motivo: a.origem.motivoDaVariante ?? null } : null,
        variantes,
        papeis: Object.fromEntries(
          Object.entries(a.papeis).map(([papel, e]) => [
            papel,
            {
              fonte: e.fontFamily,
              tamanho: e.fontSize,
              cor: e.color,
              caixa: e.textTransform ?? 'como escrito',
              ...(e.prefixo ? { prefixo: e.prefixo.trim() } : {}),
              ...(e.destaque ? { destaqueDaPagina: e.destaque } : {}),
            },
          ]),
        ),
        destaquePadrao: a.numeros.destaque,
        gradiente: { ...a.numeros.gradiente, ...(a.gradienteDaPagina ? { daPagina: a.gradienteDaPagina } : {}) },
        logo: a.logo ? { largura: a.logo.largura } : null,
        numeros: a.numeros,
        editorUrl: template ? `${getPublicAppUrl()}/templates/${template.id}/editor` : null,
        dica: a.origem.pageId
          ? 'A equipe ajusta fonte, tamanho, cor e destaque de cada papel abrindo a página de assinatura no editor; uma camada de gradiente na página manda na cor e na curva do gradiente de leitura. O próximo lote sai com a mudança. Cada variante traz o orçamento por papel (caracteres por linha, aproximado) e a fonte disponível: papel com fonteDisponivel false sai na fonte de fallback e a medida não vale. Antes de compor, medir-copy mede a copy escrita contra a variante.'
          : 'Este cliente ainda não tem página de assinatura. Peça para a equipe criar (template "Assinatura", uma página por formato com camadas de texto chamadas pre, headline, apoio, cta, servico).',
      }
    },
  }),

  definirTool({
    nome: 'medir-copy',
    descricao:
      'MEDE a copy ANTES de compor, com a MESMA preparação da composição (agrupamento pela assinatura, arranjos, divisão das linhas, segunda voz, estilos, ids dos blocos) e o MESMO medidor do render que compor-arte usa — sem gravar nada (nem página, nem arte, nem prova). Para cada bloco diz se cabe na coluna útil da variante no tamanho da assinatura (cabe), só com a fonte reduzida até 80% (cabe-reduzido, com a escala), ou não cabe nem assim (nao-cabe, com o orçamento: quantos caracteres cabem em cada linha) — e se a variante não tem o papel (papel-ausente). Cada linha volta com a largura medida e os caracteres que cabem; cada bloco com o corpo final, a caixa e as linhas.\n\nA medida é dita pelo que é: naoMedido = a fonte do papel não está carregada no servidor (os números saíram na fonte de fallback e NÃO valem — avise a pessoa e não confie neles); aproximado = há destaque entre [colchetes] e a largura extra do trecho é estimada. A resposta também mede a copy contra as OUTRAS variantes do formato (outrasVariantes: cabe tudo? falta papel?) para você escolher a variante pela capacidade, não só pelo nome. Use antes de compor-arte/compor-leva quando a copy estiver perto do limite ou quando a peça tiver muitos blocos; ver-assinatura já traz o orçamento aproximado por papel antes de escrever.',
    schema: z.object({
      projectId: spec.projectId,
      formato: spec.formato,
      blocos: spec.blocos,
      camadasExtras: spec.camadasExtras,
      copyAutoral: spec.copyAutoral,
      variante: z.string().optional().describe('A variante a medir (id da página, nome ou tag, como em compor-arte). Sem ela, a que a composição escolheria para esta copy — mande também nome, tema e a foto (a luz da foto e a chave da peça entram nessa escolha); sem a LUZ da foto (foto ausente, ou que não carregou) a escolha é PROVISÓRIA (escolhaProvisoria: true, com os motivos) — o rodízio de arranjos também usa a chave da peça, que inclui a foto, então fixar só a variante não basta: repita a medição com a foto definitiva antes de confiar nas medidas, ou fixe ao compor a `fixacao` inteira (preferencias.variante E preferencias.arranjos).'),
      tema: spec.tema,
      nome: spec.nome,
      fotoDriveId: spec.fotoDriveId,
      fotoUrl: spec.fotoUrl,
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { medirCopyDoProjeto } = await import('../../compositor/medir-copy-service')
      const r = await medirCopyDoProjeto({
        projectId: args.projectId as number,
        formato: args.formato as 'story' | 'feed' | 'quadrado',
        blocos: args.blocos as NonNullable<Parameters<typeof medirCopyDoProjeto>[0]['blocos']> | undefined,
        ...(Array.isArray(args.camadasExtras) ? { camadasExtras: args.camadasExtras as NonNullable<Parameters<typeof medirCopyDoProjeto>[0]['camadasExtras']> } : {}),
        ...(args.copyAutoral && typeof args.copyAutoral === 'object' ? { copyAutoral: args.copyAutoral } : {}),
        variante: typeof args.variante === 'string' ? args.variante : null,
        tema: typeof args.tema === 'string' ? args.tema : null,
        nome: typeof args.nome === 'string' ? args.nome : null,
        fotoDriveId: typeof args.fotoDriveId === 'string' ? args.fotoDriveId : null,
        fotoUrl: typeof args.fotoUrl === 'string' ? args.fotoUrl : null,
      })
      const m = r.medicao
      return {
        variante: r.variante,
        // O que reproduz ESTA medição na composição: variante E arranjos (o rodízio de arranjos usa a chave da
        // peça, que inclui a foto — fixar só a variante não fixa o segundo sorteio, R12).
        fixacao: r.fixacao,
        ...(r.escolhaProvisoria
          ? {
              escolhaProvisoria: true,
              motivos: r.motivosDaProvisoriedade,
              comoFixar: `repita a medição com a foto definitiva antes de confiar nas medidas; para reutilizar ESTA medição ao compor, mande preferencias.variante = ${JSON.stringify(r.fixacao.variante)} E preferencias.arranjos = ${JSON.stringify(r.fixacao.arranjos)} — sem os dois a composição pode escolher outra variante (luz clara/escura e rodízio) e outro arranjo (o rodízio de arranjos usa a chave da peça, que inclui a foto).`,
            }
          : {}),
        formato: args.formato,
        areaUtil: m.areaUtil,
        cabeTudo: m.cabeTudo,
        naoMedido: m.naoMedido,
        aproximado: m.aproximado,
        ...(m.papeisAusentes.length ? { papeisAusentes: m.papeisAusentes } : {}),
        ...(m.fontesNaoCarregadas.length ? { fontesNaoCarregadas: m.fontesNaoCarregadas } : {}),
        arranjos: m.arranjos,
        blocos: m.blocos.map((b) => ({
          id: b.id,
          papel: b.papel,
          // A camada extra diz a FUNÇÃO e de que papel veio o estilo — `papel` aqui é o de estilo.
          ...(b.extra ? { extra: b.extra } : {}),
          situacao: b.situacao,
          ...(b.fonte ? { fonte: b.fonte } : {}),
          ...(b.escala !== null ? { escala: b.escala } : {}),
          ...(b.fontSize !== null ? { corpo: b.fontSize } : {}),
          ...(b.width !== null && b.height !== null ? { caixa: { largura: b.width, altura: b.height } } : {}),
          linhas: b.linhasMedidas.map((l) => ({ linha: l.linha, largura: l.largura, coluna: l.coluna, cabe: l.cabe, caracteresQueCabem: l.caracteresQueCabem })),
          ...(b.naoMedido ? { naoMedido: true } : {}),
          ...(b.aproximado ? { aproximado: true } : {}),
          ...(b.orcamento ? { orcamento: b.orcamento } : {}),
          ...(b.avisos.length ? { avisos: b.avisos } : {}),
        })),
        alturaDosBlocos: m.alturaDosBlocos,
        segundaVoz: m.segundaVoz,
        outrasVariantes: r.outrasVariantes,
        ...(m.avisos.length ? { avisos: m.avisos } : {}),
        nota: m.naoMedido
          ? 'Há bloco NÃO MEDIDO: a fonte dele não está no servidor de render, e a peça sairia na fonte de fallback — avise a pessoa (a equipe cadastra a fonte em Configurações → Fontes) antes de compor.'
          : m.cabeTudo
            ? 'Tudo cabe nesta variante. Nada foi gravado: compor-arte é o próximo passo.'
            : 'Algum bloco não cabe (ou falta papel na variante): reescreva com o orçamento devolvido ou escolha outra variante (outrasVariantes) — nunca insista com o mesmo texto.',
      }
    },
  }),

  definirTool({
    nome: 'revisar-arte',
    descricao:
      'Revisa uma arte feita no EDITOR — peça do compositor, arte de modelo ou página editada — ANTES de ela ir para a agenda, e devolve o que está errado COM A MEDIDA e os AJUSTES prontos para aplicar. Não grava nada.\n\nDuas camadas. O código mede: texto cortado, fonte não cadastrada, colisão, texto fora da margem de segurança, logo sobre texto, texto sem leitura sobre a foto (a régua de contraste — o "horário não deu leitura"), gradiente mais forte do que o texto precisa, título grande demais para a peça ou maior que o modelo, entrelinha grande, texto pequeno, palavra sozinha na última linha e texto sobre o assunto da foto. A visão olha a peça renderizada, com cada bloco marcado (T1, T2… e L1 para a logo), e aponta o que a medida não vê — bloco mal colocado, gradiente pesando na foto, respiro desequilibrado. A resposta traz a miniatura com as marcas para você conferir.\n\nCada achado tem severidade (problema, aviso, sugestão), a evidência e os índices dos ajustes que o corrigem; o número de todo ajuste é calculado pelas medidas. Para corrigir: ajustar-arte com o pageId, versaoEsperada = a `versao` desta revisão e os ajustes que decidir aplicar — todos, ou só os que concordar (sugestão é gosto; achado de confiança média, confira na miniatura) — e revise de novo. No máximo DUAS rodadas por peça; o que sobrar vira observação para a pessoa. A revisão nunca bloqueia: peça com pendência vai para a agenda como rascunho do mesmo jeito, com a pendência dita. Achado sem ajuste é decisão de gente (trocar a foto, reescrever, mudar o bloco de borda) — proponha em vez de insistir.\n\nNa leva (compor-leva), revise pelo generationId assim que a peça aparecer pronta em ver-geracao. Com a visão leva ~20 a 40 segundos por peça; visao: false devolve só as medidas em poucos segundos.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      pageId: z.string().optional().describe('A peça (pageId de compor-arte, criar-arte, ajustar-arte ou do post).'),
      generationId: z.string().optional().describe('Alternativa ao pageId: o id da arte (compor-leva devolve só este); a página é achada por ele.'),
      visao: z.boolean().optional().describe('Olhar da visão sobre a peça renderizada (default true). false = só as medidas, mais rápido.'),
      previa: z.boolean().optional().describe('Devolver a miniatura com as marcas (default true).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const [{ revisarArte }, { CreativeError }] = await Promise.all([
        import('../../creatives/revisao/revisar-arte'),
        import('../../creatives/errors'),
      ])
      const projectId = args.projectId as number
      const pageId = typeof args.pageId === 'string' && args.pageId.trim() ? args.pageId.trim() : null
      const generationId = typeof args.generationId === 'string' && args.generationId.trim() ? args.generationId.trim() : null
      if (!pageId && !generationId) throw new CreativeError('SEM_PAGINA', 'Informe pageId ou generationId da peça.', 400)
      const r = await revisarArte({ projectId, pageId, generationId, visao: args.visao !== false, previa: args.previa !== false })
      const corpo = {
        pageId: r.pageId,
        pagina: r.pagina,
        editUrl: r.editUrl,
        formato: r.formato,
        versao: r.versao,
        aplicavel: r.aplicavel,
        ...(r.motivo ? { motivo: r.motivo } : {}),
        resumo: r.relatorio.resumo,
        achados: r.relatorio.achados,
        ajustes: r.relatorio.ajustes,
        cobertura: r.relatorio.cobertura,
        visao: r.visao,
        ...(r.referencia ? { referencia: r.referencia } : {}),
        comoAplicar:
          r.aplicavel && r.relatorio.ajustes.length > 0
            ? `ajustar-arte com projectId ${projectId}, pageId "${r.pageId}", versaoEsperada "${r.versao}" e os ajustes escolhidos (a lista inteira ou só os que fizerem sentido). Depois, revisar-arte de novo.`
            : null,
      }
      if (!r.previa) return corpo
      return {
        _mcpContent: [
          { type: 'text', text: JSON.stringify(corpo, null, 2) },
          { type: 'image', data: r.previa.toString('base64'), mimeType: 'image/jpeg' },
        ],
      }
    },
  }),

  definirTool({
    nome: 'compor-arte',
    descricao:
      'Compõe UMA arte pelo EDITOR, sem crédito de imagem: a copy (por papel e por linha) pousa na área livre da foto — o compositor mede a foto, escolhe posição e enquadramento, desenha um gradiente de leitura sutil na borda onde o texto pousou (topo, rodapé ou os dois, em camadas independentes), destaca as palavras marcadas com [colchetes] e põe a logo no canto pela luz — e a peça nasce como página editável, onde a equipe ajusta na mão. Use para peça avulsa ou para testar antes de uma leva (compor-leva). Sem foto, a peça sai sobre o fundo liso da marca.\n\nAntes: ver-assinatura (o cliente precisa de página de assinatura) e consultar-dna/consultar-base para a copy. OS CAMPOS SÃO OPCIONAIS: a mensagem decide quais blocos a peça precisa; nada é escrito para preencher espaço e nenhum texto é descartado por falta de campo. CAMADA EXTRA: quando a variante escolhida não tem o papel de um texto, não troque de variante só por isso — declare no bloco de que papel ele herda o estilo (herdaDe): ele entra como camada extra, com id próprio, a tipografia daquele papel e o lugar dado por grupoVisual (principal, topo ou rodape; serviço vai ao rodapé por padrão), sem virar esse papel (a linha de horário numa variante sem servico: papel "servico", herdaDe "apoio"). Texto sem papel nenhum (uma nota) vai em camadasExtras, ou como bloco livre com estilo.herdaDe no copyAutoral. A camada extra é editável no editor e sobrevive a editar o texto, trocar a foto e recompor. Papel sem herdaDe que a variante não tem, ou herdaDe de um papel que ela também não tem, devolve PAPEIS_INCOMPATIVEIS antes de gravar — nunca some em silêncio. Se a variante tem headline2, a última de duas ou mais linhas da headline recebe essa segunda voz automaticamente; não envie headline2 como papel. DESTAQUE: marque com [colchetes] 1 ou 2 palavras-chave da peça (preço, dia, a oferta) — sem colchetes a peça sai sem destaque. selecaoExperimental: true habilita a comparação conservadora com o baseline; fotosCandidatas sozinha não ativa seleção; a foto explícita prevalece. Se a resposta disser "texto não cabe", reescreva com o orçamento devolvido (caracteres que cabem por linha) — nunca insista igual.\n\nprovar: true renderiza e devolve só a prova (URL do PNG + diagnóstico), sem gravar nada na galeria.',
    schema: z.object({
      ...spec,
      provar: z.boolean().optional().describe('true = só a prova (PNG + diagnóstico), nada gravado. Default false: grava a peça na galeria como página editável.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ comporPeca }, { quemDecidiu, canalDoPrincipal }] = await Promise.all([import('../../compositor/compor'), import('../tools')])
      const projectId = args.projectId as number
      const s = specDe(args)
      const decididoPor = await quemDecidiu(projectId, principal)
      const r = await comporPeca(s, { provar: args.provar === true, decididoPor, autor: decididoPor, canal: canalDoPrincipal(principal) })
      const d = r.diagnostico
      const resumo = {
        posicao: `${d.posicao.ancora}/${d.posicao.alinha}`,
        enquadramento: d.posicao.crop,
        logo: d.logo?.canto ?? 'sem logo',
        selecao: d.selecao,
        tratamentoDeTexto: d.tratamentoDeTexto ?? 'gradiente-de-leitura',
        gradientes: (d.gradientes ?? []).map((g) => ({ borda: g.borda, forca: g.forca })),
        destaques: d.blocos.filter((b) => b.destacado).map((b) => b.papel),
        contraste: d.contraste?.map((c) => ({ bloco: c.grupo, ok: c.ok, p98: c.p98ComHalo, alvo: Math.round(c.alvo) })) ?? null,
        avisos: d.avisos,
      }
      if (r.prova) {
        const { put } = await import('@vercel/blob')
        const blob = await put(`compor/provas/${projectId}-${Date.now()}.png`, r.prova, { access: 'public', contentType: 'image/png' })
        return { prova: true, imageUrl: blob.url, ...resumo }
      }
      const p = r.persistido!
      return {
        generationId: p.generationId,
        pageId: p.pageId,
        imageUrl: p.url,
        editUrl: p.editUrl,
        galleryUrl: p.galleryUrl,
        ...resumo,
        nota: 'A peça é uma página editável: o link editUrl abre no editor, onde a equipe move, redimensiona e reescreve. Cada gradiente de leitura é uma camada própria (topo e rodapé separados) — ao mover o texto para outra borda, confira a leitura e ajuste a camada.',
      }
    },
  }),

  definirTool({
    nome: 'compor-leva',
    descricao:
      'Compõe VÁRIAS artes pelo editor de uma vez (uma semana, uma sessão de fotos), sem crédito de imagem. Cada item vira uma peça na fila durável — nada espera na conversa: a resposta traz os ids para acompanhar com ver-geracao, e as peças aparecem na galeria em poucos minutos (a fila roda de minuto em minuto, ~12 peças por varredura). Mesmos campos de compor-arte por item, inclusive o destaque com [colchetes] nas linhas. Teto de 60 itens.\n\nUse depois de montar a copy de cada peça (consultar-dna + consultar-base) e de escolher as fotos (buscar-fotos, sem repetir na leva). Antes de uma leva grande, prove UMA peça com compor-arte e mostre à pessoa.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      itens: z
        .array(
          z.object({
            formato: spec.formato,
            fotoDriveId: spec.fotoDriveId,
            fotoUrl: spec.fotoUrl,
            fotosCandidatas: spec.fotosCandidatas,
            selecaoExperimental: spec.selecaoExperimental,
            blocos: spec.blocos,
            camadasExtras: spec.camadasExtras,
            copyAutoral: spec.copyAutoral,
            preferencias,
            nome: spec.nome,
            tema: spec.tema,
            itemDePlanoId: spec.itemDePlanoId,
            planoId: spec.planoId,
            quando: spec.quando,
            carrossel: spec.carrossel,
          }),
        )
        .min(1)
        .max(60)
        .describe('As peças da leva, uma por item.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ enfileirarPeca }, { quemDecidiu, canalDoPrincipal }] = await Promise.all([import('../../compositor/fila'), import('../tools')])
      const projectId = args.projectId as number
      const decididoPor = await quemDecidiu(projectId, principal)
      const itens = args.itens as Array<Record<string, unknown>>
      const enfileiradas: Array<{ indice: number; generationId: string; nome: string | null }> = []
      const falhas: Array<{ indice: number; erro: string }> = []
      // Em SÉRIE, como todo lote da casa: cada item valida e grava sozinho.
      for (const [indice, item] of itens.entries()) {
        try {
          const r = await enfileirarPeca(specDe({ ...item, projectId }), { decididoPor, autor: decididoPor, canal: canalDoPrincipal(principal) })
          enfileiradas.push({ indice, generationId: r.generationId, nome: (item.nome as string | undefined) ?? null })
        } catch (erro) {
          falhas.push({ indice, erro: erro instanceof Error ? erro.message : String(erro) })
        }
      }
      return {
        enfileiradas: enfileiradas.length,
        falhas,
        pecas: enfileiradas,
        nota: 'As peças entram na galeria conforme a fila roda (ver-geracao com cada generationId). Nada foi cobrado.',
      }
    },
  }),
]
