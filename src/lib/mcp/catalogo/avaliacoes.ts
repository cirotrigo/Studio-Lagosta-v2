/**
 * Catálogo · avaliações e comentários (30/08/2026 — Fase 4a do Windsor).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro (zod,
 * registro/); db e serviços entram por `await import()` relativo DENTRO do
 * handler — o validar-registro-mcp.ts carrega este módulo sem env no CI.
 *
 * `propor-resposta` é o motor do botão do Farol da Lagosta: a IA PROPÕE o
 * rascunho, a EQUIPE edita e envia (pelo próprio Farol, via Windsor). A tool
 * nunca publica nada — por isso destructiveHint: false — mas também não é
 * readOnly: quando gera rascunho novo para avaliação do Google, ela o GRAVA
 * em AvaliacaoGoogle.respostaSugerida (cache que evita chamada paga repetida).
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDeAvaliacoes = [
  definirTool({
    nome: 'propor-resposta',
    descricao:
      'Propõe um rascunho de resposta para a equipe EDITAR e enviar — nunca publica nada sozinho. Serve dois casos: avaliação do Google (mande reviewId; se já houver rascunho guardado, ele volta na hora) e comentário de Instagram (mande texto e, se souber, autor). O rascunho segue o tom de voz do DNA, nunca inventa preço/horário/promoção (dado factual só com lastro na base de conhecimento) e nunca promete compensação. Sempre diga a quem for usar: revise antes de publicar — a resposta sai em nome do restaurante.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      reviewId: z
        .string()
        .optional()
        .describe('Avaliação do Google: o id da avaliação (da coleta diária ou do Farol). Devolve o rascunho guardado, ou gera e guarda.'),
      texto: z
        .string()
        .optional()
        .describe('Comentário de Instagram: o texto do comentário a responder. Ignorado quando reviewId vier.'),
      autor: z.string().optional().describe('Nome de quem comentou/avaliou (opcional, deixa o rascunho pessoal).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const projectId = args.projectId as number
      const reviewId = typeof args.reviewId === 'string' ? args.reviewId : null
      const textoComentario = typeof args.texto === 'string' ? args.texto.trim() : ''
      const autor = typeof args.autor === 'string' ? args.autor : null

      if (!reviewId && !textoComentario) {
        return { erro: 'Mande reviewId (avaliação do Google) ou texto (comentário de Instagram).' }
      }

      const [{ db }] = await Promise.all([import('../../db')])
      const projeto = await db.project.findUnique({ where: { id: projectId }, select: { name: true } })
      if (!projeto) return { erro: `Cliente ${projectId} não encontrado.` }

      const aviso = 'Revise e edite antes de publicar — a resposta sai em nome do restaurante.'

      if (reviewId) {
        const avaliacao = await db.avaliacaoGoogle.findUnique({ where: { reviewId } })
        if (!avaliacao || avaliacao.projectId !== projectId) {
          return { erro: 'Avaliação não encontrada para este cliente — ela entra no banco na coleta diária (09h).' }
        }
        if (avaliacao.respostaSugerida) {
          return { rascunho: avaliacao.respostaSugerida, origem: 'guardado', aviso }
        }
        const { sugerirRespostaDeAvaliacao } = await import('../../avaliacoes/sugerir-resposta')
        const rascunho = await sugerirRespostaDeAvaliacao({
          projectId,
          nomeCliente: projeto.name,
          autor: autor ?? avaliacao.autor,
          estrelas: avaliacao.estrelas,
          texto: avaliacao.texto,
        })
        if (!rascunho) return { erro: 'Não consegui montar o rascunho agora — tente de novo em instantes.' }
        // Guarda como a coleta diária guardaria — clique repetido vira leitura.
        await db.avaliacaoGoogle.update({
          where: { id: avaliacao.id },
          data: { respostaSugerida: rascunho, sugestaoGeradaEm: new Date() },
        })
        return { rascunho, origem: 'gerado', aviso }
      }

      const { sugerirRespostaDeComentario } = await import('../../avaliacoes/sugerir-resposta')
      const rascunho = await sugerirRespostaDeComentario({
        projectId,
        nomeCliente: projeto.name,
        autor,
        texto: textoComentario,
      })
      if (!rascunho) return { erro: 'Não consegui montar o rascunho agora — tente de novo em instantes.' }
      return { rascunho, origem: 'gerado', aviso }
    },
  }),
]
