import { z } from 'zod';
import { definirTool } from '../registro/definir';

export const toolsDeRascunhosRestritos = [
  definirTool({
    nome: 'reagendar-rascunho',
    descricao:
      'Muda somente o horário de um rascunho DRAFT sem envio remoto, preservando a arte. Exige a versao de ver-agenda e novo horário UTC ISO com milissegundos. Recusa versão alterada, post aprovado, recorrente e horário ocupado. Não aprova, não publica, não exclui e não renomeia/pasta a arte. Releia a agenda após conflito; não substitua por reagendar-post.',
    schema: z.object({
      projectId: z.number().int().positive(),
      postId: z.string().min(1),
      versaoEsperada: z.string().datetime(),
      quandoISO: z.string().datetime(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    acesso: { tipo: 'curador' },
    superficies: ['remoto', 'local'],
    handler: async (args) => {
      const { reagendarRascunho } =
        await import('../../posts/reagendar-rascunho');
      return reagendarRascunho(args);
    },
  }),
];
