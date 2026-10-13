import { afterEach, describe, expect, it } from 'vitest';
import {
  acoesDoCliente,
  auditarCarteira,
  coberturaDoProjeto,
  expectativaDoProjeto,
  motivoSaneado,
  SEM_DIAGNOSTICO,
  slotsEsperadosNaData,
  TARGET_DAYS_AHEAD,
  type PostDaJanela,
  type PostDoHistoricoDoBanco,
} from '@/lib/posts/cobertura';

/**
 * Cobertura da agenda contra a expectativa do cliente (H2 do Dot, 13/10/2026).
 * As letras são os testes mínimos pedidos pelo owner.
 */

const AGORA = new Date('2026-10-13T12:00:00Z'); // terça 13/10, 09:00 em Brasília
const HOJE = '2026-10-13';
const AMANHA = '2026-10-14';
const DEPOIS = '2026-10-15';

/** "AAAA-MM-DD HH:mm" em Brasília → Date. */
const brt = (s: string) => new Date(`${s.replace(' ', 'T')}:00-03:00`);

const GRADE_10H = {
  title: 'Padrões de Postagem — Teste',
  content: 'SLOT 1 — 10h, todos os dias',
};

/** POSTED semanais, `semanas` para trás, no dia da semana de `dataBase` (uma data). */
function semanal(
  dataBase: string,
  hora: string,
  postType = 'STORY',
  semanas = 6
): PostDoHistoricoDoBanco[] {
  return Array.from({ length: semanas }, (_, i) => {
    const d = new Date(`${dataBase}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * (i + 1));
    return {
      scheduledDatetime: brt(`${d.toISOString().slice(0, 10)} ${hora}`),
      origem: null,
      learningScope: 'ROTINA' as const,
      campaignId: null,
      postType,
    };
  });
}

function post(
  id: string,
  quando: string,
  status: string,
  extra: Partial<PostDaJanela> = {}
): PostDaJanela {
  return {
    id,
    scheduledDatetime: brt(quando),
    postType: 'STORY',
    status,
    mediaUrls: [],
    pageId: null,
    renderStatus: 'NOT_NEEDED',
    renderError: null,
    errorMessage: null,
    verificationStatus: 'SKIPPED',
    campaignId: null,
    ...extra,
  };
}
const pronto = (
  id: string,
  quando: string,
  status = 'DRAFT',
  extra: Partial<PostDaJanela> = {}
) =>
  post(id, quando, status, {
    mediaUrls: ['https://blob.example/arte.png'],
    ...extra,
  });

const comGrade = (agora = AGORA) =>
  expectativaDoProjeto({
    historico: [],
    encerradas: new Set(),
    entradasDaGrade: [GRADE_10H],
    agora,
  });

function cobrir(
  posts: PostDaJanela[],
  opts: { agora?: Date; campanhas?: Map<string, Date> } = {}
) {
  const agora = opts.agora ?? AGORA;
  return coberturaDoProjeto({
    expectativa: comGrade(agora),
    posts,
    campanhasExpiram: opts.campanhas ?? new Map(),
    agora,
  });
}

describe('expectativaDoProjeto', () => {
  it('A. só grade: o horário combinado, em story', () => {
    const e = comGrade();
    expect(e.fonte).toBe('grade');
    expect(
      slotsEsperadosNaData(e, AMANHA).map((s) => [s.hora, s.formato, s.origem])
    ).toEqual([['10:00', 'story', 'grade']]);
  });

  it('B. só cadência: o hábito do histórico, com o formato do bloco', () => {
    const e = expectativaDoProjeto({
      historico: [
        ...semanal(AMANHA, '18:00'),
        ...semanal(DEPOIS, '12:00', 'POST'),
      ],
      encerradas: new Set(),
      entradasDaGrade: [],
      agora: AGORA,
    });
    expect(e.fonte).toBe('cadencia');
    expect(
      slotsEsperadosNaData(e, AMANHA).map((s) => [s.hora, s.formato])
    ).toEqual([['18:00', 'story']]);
    expect(
      slotsEsperadosNaData(e, DEPOIS).map((s) => [s.hora, s.formato])
    ).toEqual([['12:00', 'feed']]);
  });

  it('C. grade + cadência: a grade substitui o story do histórico, o feed do histórico continua', () => {
    const e = expectativaDoProjeto({
      historico: [
        ...semanal(AMANHA, '18:00'),
        ...semanal(DEPOIS, '12:00', 'POST'),
      ],
      encerradas: new Set(),
      entradasDaGrade: [GRADE_10H],
      agora: AGORA,
    });
    expect(e.fonte).toBe('grade+cadencia');
    expect(
      slotsEsperadosNaData(e, AMANHA).map((s) => [s.hora, s.formato, s.origem])
    ).toEqual([['10:00', 'story', 'grade']]);
    expect(
      slotsEsperadosNaData(e, DEPOIS).map((s) => [s.hora, s.formato, s.origem])
    ).toEqual([
      ['10:00', 'story', 'grade'],
      ['12:00', 'feed', 'cadencia'],
    ]);
  });

  it('campanha encerrada sai da cadência', () => {
    const historico = semanal(AMANHA, '18:00').map((p) => ({
      ...p,
      campaignId: 'velha',
      learningScope: 'CAMPANHA' as const,
    }));
    expect(
      expectativaDoProjeto({
        historico,
        encerradas: new Set(['velha']),
        entradasDaGrade: [],
        agora: AGORA,
      }).fonte
    ).toBe('sem-rotina');
  });
});

describe('coberturaDoProjeto', () => {
  it('D. sem grade e sem histórico: SEM_ROTINA, nunca coberto', () => {
    const expectativa = expectativaDoProjeto({
      historico: [],
      encerradas: new Set(),
      entradasDaGrade: [],
      agora: AGORA,
    });
    const c = coberturaDoProjeto({
      expectativa,
      posts: [],
      campanhasExpiram: new Map(),
      agora: AGORA,
    });
    expect(c.fonte).toBe('sem-rotina');
    expect([c.hoje.estado, c.amanha.estado, c.depoisDeAmanha.estado]).toEqual([
      'sem-rotina',
      'sem-rotina',
      'sem-rotina',
    ]);
    expect(c.diasAdiantados).toBe(0);
    expect(acoesDoCliente(c, true)[0].codigo).toBe('SEM_ROTINA');
  });

  it.each([
    ['E', 'SCHEDULED'],
    ['F', 'POSTING'],
    ['G', 'POSTED'],
  ])('%s. %s ocupa o slot', (_l, status) => {
    const c = cobrir([post('p', `${AMANHA} 10:00`, status)]);
    expect(c.amanha).toMatchObject({
      estado: 'coberto',
      esperados: 1,
      cobertos: 1,
    });
  });

  it('H. rascunho com arte pronta cobre', () => {
    expect(cobrir([pronto('p', `${AMANHA} 10:00`)]).amanha.estado).toBe(
      'coberto'
    );
  });

  describe('rascunho com mídia: só cobre sem render em curso (fechamento do H2)', () => {
    const motivo = (extra: Partial<PostDaJanela>) =>
      cobrir([pronto('p', `${AMANHA} 10:00`, 'DRAFT', extra)]).buracos[0];
    it('A. mídia antiga + pageId + PENDING: PENDENTE', () => {
      expect(motivo({ pageId: 'pg', renderStatus: 'PENDING' })).toMatchObject({
        estado: 'pendente',
        motivo: 'render-pendente',
      });
    });
    it('B. mídia antiga + RENDERING: PENDENTE', () => {
      expect(motivo({ pageId: 'pg', renderStatus: 'RENDERING' })).toMatchObject(
        { estado: 'pendente', motivo: 'render-pendente' }
      );
    });
    it('C. mídia + RENDERED: COBERTO', () => {
      expect(
        cobrir([
          pronto('p', `${AMANHA} 10:00`, 'DRAFT', {
            pageId: 'pg',
            renderStatus: 'RENDERED',
          }),
        ]).amanha.estado
      ).toBe('coberto');
    });
    it('D. mídia própria/importada + NOT_NEEDED: COBERTO', () => {
      expect(
        cobrir([
          pronto('p', `${AMANHA} 10:00`, 'DRAFT', {
            renderStatus: 'NOT_NEEDED',
          }),
        ]).amanha.estado
      ).toBe('coberto');
    });
    it('legado sem status de render, com mídia: COBERTO', () => {
      expect(
        cobrir([
          pronto('p', `${AMANHA} 10:00`, 'DRAFT', { renderStatus: null }),
        ]).amanha.estado
      ).toBe('coberto');
    });
    it('agendado com render PENDING continua coberto (o render sai no cron antes do horário)', () => {
      expect(
        cobrir([
          pronto('p', `${AMANHA} 10:00`, 'SCHEDULED', {
            pageId: 'pg',
            renderStatus: 'PENDING',
          }),
        ]).amanha.estado
      ).toBe('coberto');
    });
  });

  it('dia sem horário esperado conta como satisfeito, com esperados = 0', () => {
    const expectativa = expectativaDoProjeto({
      historico: semanal('2026-10-16', '18:00'),
      encerradas: new Set(),
      entradasDaGrade: [],
      agora: AGORA,
    });
    const c = coberturaDoProjeto({
      expectativa,
      posts: [],
      campanhasExpiram: new Map(),
      agora: AGORA,
    });
    expect(c.amanha).toMatchObject({ estado: 'coberto', esperados: 0 });
    expect(c.depoisDeAmanha).toMatchObject({ estado: 'coberto', esperados: 0 });
    expect(c.diasAdiantados).toBe(2);
    expect(c.buracos).toEqual([]);
    expect(acoesDoCliente(c, true)[0].codigo).toBe('NENHUMA');
  });

  it('I. rascunho só com pageId e render pendente: PENDENTE, não cobre', () => {
    const c = cobrir([
      post('p', `${AMANHA} 10:00`, 'DRAFT', {
        pageId: 'pg',
        renderStatus: 'PENDING',
      }),
    ]);
    expect(c.amanha.estado).toBe('pendente');
    expect(c.buracos).toContainEqual({
      data: AMANHA,
      hora: '10:00',
      formato: 'story',
      estado: 'pendente',
      motivo: 'render-pendente',
      postId: 'p',
    });
  });

  it('J. rascunho sem arte: PENDENTE', () => {
    const c = cobrir([post('p', `${AMANHA} 10:00`, 'DRAFT')]);
    expect(c.buracos[0]).toMatchObject({
      estado: 'pendente',
      motivo: 'rascunho-sem-arte',
    });
  });

  it('render que falhou não cobre, nem rascunho com mídia antiga', () => {
    const c = cobrir([
      pronto('p', `${AMANHA} 10:00`, 'DRAFT', {
        pageId: 'pg',
        renderStatus: 'RENDER_FAILED',
      }),
    ]);
    expect(c.buracos[0]).toMatchObject({
      estado: 'pendente',
      motivo: 'render-falhou',
    });
    expect(c.falhas).toMatchObject([{ postId: 'p', tipo: 'render' }]);
  });

  it('K. FAILED não cobre, ocupa o horário e aparece nas falhas', () => {
    const c = cobrir([
      post('p', `${AMANHA} 10:00`, 'FAILED', {
        errorMessage: 'Later account not configured',
      }),
    ]);
    expect(c.buracos[0]).toMatchObject({
      estado: 'pendente',
      motivo: 'falhou',
      postId: 'p',
    });
    expect(c.falhas).toEqual([
      {
        postId: 'p',
        data: AMANHA,
        quando: `${AMANHA} 10:00`,
        tipo: 'publicacao',
        motivo: 'conta do Instagram não conectada',
      },
    ]);
    const acoes = acoesDoCliente(c, true).map((a) => a.codigo);
    expect(acoes[0]).toBe('RELATAR_FALHA');
    // Não compõe substituto para o horário da falha.
    expect(
      c.buracos.filter((b) => b.data === AMANHA && b.estado === 'vazio')
    ).toEqual([]);
  });

  it('L. campanha vencida não cobre: PENDENTE, e conta no aviso', () => {
    const campanhas = new Map([['c1', brt(`${HOJE} 23:00`)]]);
    const c = cobrir(
      [pronto('p', `${AMANHA} 10:00`, 'SCHEDULED', { campaignId: 'c1' })],
      { campanhas }
    );
    expect(c.buracos[0]).toMatchObject({
      estado: 'pendente',
      motivo: 'campanha-vencida',
    });
    expect(c.avisosDeCampanha).toBe(1);
    expect(acoesDoCliente(c, true).map((a) => a.codigo)).toContain(
      'CONSERTO_PENDENTE'
    );
  });

  it('M. nada no horário: VAZIO; compor só com assinatura', () => {
    const c = cobrir([pronto('p', `${DEPOIS} 10:00`)]);
    expect(c.amanha.estado).toBe('falta');
    expect(c.buracos).toEqual([
      { data: AMANHA, hora: '10:00', formato: 'story', estado: 'vazio' },
    ]);
    expect(acoesDoCliente(c, true)[0].codigo).toBe('COMPOR');
    expect(acoesDoCliente(c, false)[0].codigo).toBe('SEM_ASSINATURA');
  });

  it('N. tolerância de ±45 min, e só o mesmo formato ocupa', () => {
    expect(cobrir([pronto('p', `${AMANHA} 10:45`)]).amanha.estado).toBe(
      'coberto'
    );
    expect(cobrir([pronto('p', `${AMANHA} 09:15`)]).amanha.estado).toBe(
      'coberto'
    );
    expect(cobrir([pronto('p', `${AMANHA} 10:46`)]).amanha.estado).toBe(
      'falta'
    );
    expect(
      cobrir([pronto('p', `${AMANHA} 10:00`, 'DRAFT', { postType: 'POST' })])
        .amanha.estado
    ).toBe('falta');
  });

  it('O. amanhã e depois completos: diasAdiantados = 2', () => {
    const c = cobrir([
      pronto('a', `${AMANHA} 10:00`),
      pronto('b', `${DEPOIS} 10:00`, 'SCHEDULED'),
    ]);
    expect(c.diasAdiantados).toBe(TARGET_DAYS_AHEAD);
    expect(acoesDoCliente(c, true)).toEqual([
      { codigo: 'NENHUMA', motivo: 'coberto por 2 dia(s) a partir de amanhã' },
    ]);
  });

  it('P. amanhã completo, depois incompleto: 1', () => {
    expect(cobrir([pronto('a', `${AMANHA} 10:00`)]).diasAdiantados).toBe(1);
  });

  it('Q. amanhã incompleto: 0, mesmo com depois coberto', () => {
    expect(cobrir([pronto('b', `${DEPOIS} 10:00`)]).diasAdiantados).toBe(0);
  });

  it('pendente também não completa o dia', () => {
    expect(
      cobrir([
        post('a', `${AMANHA} 10:00`, 'DRAFT'),
        pronto('b', `${DEPOIS} 10:00`),
      ]).diasAdiantados
    ).toBe(0);
  });

  it('R. falha hoje: urgência, sem mexer em diasAdiantados', () => {
    const posts = [
      post('f', `${HOJE} 08:00`, 'FAILED', {
        errorMessage: 'Post travado em POSTING por mais de 30 minutos',
      }),
      pronto('h', `${HOJE} 10:00`),
      pronto('a', `${AMANHA} 10:00`),
      pronto('b', `${DEPOIS} 10:00`),
    ];
    const c = cobrir(posts);
    expect(c.diasAdiantados).toBe(2);
    expect(c.hoje.estado).toBe('coberto');
    expect(c.falhas).toMatchObject([
      {
        postId: 'f',
        data: HOJE,
        tipo: 'publicacao',
        motivo: 'envio ao publicador não confirmado',
      },
    ]);
    const carteira = auditarCarteira({
      projetos: [
        { id: 1, name: 'Saudável' },
        { id: 2, name: 'Falhou hoje' },
      ],
      historico: [],
      posts: [
        ...[
          pronto('a1', `${HOJE} 10:00`),
          pronto('a2', `${AMANHA} 10:00`),
          pronto('a3', `${DEPOIS} 10:00`),
        ].map((p) => ({ ...p, projectId: 1 })),
        ...posts.map((p) => ({ ...p, projectId: 2 })),
      ],
      entradasDaGrade: [
        { projectId: 1, ...GRADE_10H },
        { projectId: 2, ...GRADE_10H },
      ],
      campanhas: [],
      comAssinatura: new Set([1, 2]),
      agora: AGORA,
    });
    expect(carteira.clientes.map((c) => c.projectId)).toEqual([2, 1]);
    expect(carteira.resumo).toMatchObject({
      total: 2,
      ok: 1,
      urgentesHoje: 1,
      comFalhas: 1,
      abaixoDoAlvo: 0,
    });
  });

  it('hoje só conta o que ainda não passou', () => {
    const tarde = new Date('2026-10-13T15:00:00Z'); // 12:00 em Brasília, o slot das 10h já passou
    const c = cobrir([], { agora: tarde });
    expect(c.hoje).toMatchObject({
      data: HOJE,
      estado: 'coberto',
      esperados: 0,
      faltam: [],
    });
    const cedo = cobrir([]);
    expect(cedo.hoje).toMatchObject({ estado: 'falta', esperados: 1 });
    expect(cedo.hoje.faltam).toEqual([
      { data: HOJE, hora: '10:00', formato: 'story', estado: 'vazio' },
    ]);
    // Hoje vazio não vira buraco do alvo.
    expect(cedo.buracos.every((b) => b.data !== HOJE)).toBe(true);
  });

  describe('V. borda de meia-noite em Brasília', () => {
    const tzOriginal = process.env.TZ;
    afterEach(() => {
      process.env.TZ = tzOriginal;
    });

    it('23h30 de terça em Brasília (já quarta em UTC) ainda é terça; o fuso da máquina não importa', () => {
      for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        const agora = new Date('2026-10-14T02:30:00Z');
        const c = cobrir(
          [pronto('a', `${AMANHA} 10:00`), pronto('b', `${DEPOIS} 10:00`)],
          { agora }
        );
        expect([c.hoje.data, c.amanha.data, c.depoisDeAmanha.data]).toEqual([
          HOJE,
          AMANHA,
          DEPOIS,
        ]);
        expect(c.diasAdiantados).toBe(2);
      }
    });

    it('o story de 23h45 ocupa o slot de 0h do dia seguinte', () => {
      const expectativa = expectativaDoProjeto({
        historico: semanal(AMANHA, '00:00'),
        encerradas: new Set(),
        entradasDaGrade: [],
        agora: AGORA,
      });
      expect(
        slotsEsperadosNaData(expectativa, AMANHA).map((s) => s.hora)
      ).toEqual(['00:00']);
      const c = coberturaDoProjeto({
        expectativa,
        posts: [pronto('p', `${HOJE} 23:45`)],
        campanhasExpiram: new Map(),
        agora: AGORA,
      });
      expect(c.amanha.estado).toBe('coberto');
    });
  });
});

describe('W. motivo de falha saneado', () => {
  it('nunca devolve o texto bruto', () => {
    const brutos = [
      'Error: connect ECONNREFUSED postgresql://user:s3nh4@ep-x.neon.tech/db\n    at TCPConnectWrap.afterConnect',
      'Request failed: https://blob.example/arte.png?token=abc123&sig=xyz',
      'Bearer sk-live-123 rejected',
      'x'.repeat(5000),
    ];
    for (const b of brutos) {
      expect(motivoSaneado('publicacao', b)).toBe(SEM_DIAGNOSTICO);
      expect(motivoSaneado('render', b)).toBe('render da arte falhou');
    }
  });

  it('causas conhecidas viram frase fixa', () => {
    expect(
      motivoSaneado(
        'render',
        '{"codigo":"RENDER_SEMANTICO_INVALIDO","motivo":"texto pedido aqui","erros":[]}'
      )
    ).toBe('render semântico não corresponde à página');
    expect(
      motivoSaneado(
        'publicacao',
        'Formato de imagem incompatível (aspect ratio 2:1)'
      )
    ).toBe('formato da imagem incompatível com o Instagram');
    expect(motivoSaneado('publicacao', null)).toBe(SEM_DIAGNOSTICO);
    expect(motivoSaneado('verificacao', 'qualquer coisa')).toBe(
      'story não confirmado no Instagram'
    );
  });
});

describe('H6 — conflitos de horário: dois ou mais posts no mesmo horário esperado (só informa)', () => {
  const conflitos = (posts: PostDaJanela[]) => cobrir(posts).conflitosDeHorario

  it('1. um post → sem conflito', () => {
    expect(conflitos([pronto('a', `${AMANHA} 10:00`)])).toEqual([])
  })

  it('2. dois DRAFT → conflito, com a quantidade e os postIds', () => {
    expect(conflitos([pronto('b', `${AMANHA} 10:00`), pronto('a', `${AMANHA} 10:20`)])).toEqual([
      { data: AMANHA, hora: '10:00', formato: 'story', quantidade: 2, postIds: ['a', 'b'] },
    ])
  })

  it('3. DRAFT + SCHEDULED → conflito; 4. dois SCHEDULED → conflito', () => {
    expect(conflitos([pronto('a', `${AMANHA} 10:00`), pronto('b', `${AMANHA} 10:00`, 'SCHEDULED')])).toHaveLength(1)
    expect(conflitos([pronto('a', `${DEPOIS} 10:00`, 'SCHEDULED'), pronto('b', `${DEPOIS} 09:30`, 'SCHEDULED')])).toEqual([
      expect.objectContaining({ data: DEPOIS, quantidade: 2 }),
    ])
  })

  it('5. formatos diferentes → sem conflito (feed não ocupa o story)', () => {
    expect(conflitos([pronto('a', `${AMANHA} 10:00`), pronto('b', `${AMANHA} 10:00`, 'DRAFT', { postType: 'POST' })])).toEqual([])
  })

  it('6. fora da tolerância de 45 min → sem conflito', () => {
    expect(conflitos([pronto('a', `${AMANHA} 10:00`), pronto('b', `${AMANHA} 10:46`)])).toEqual([])
  })

  it('7. conflito nunca gera COMPOR para aquele horário; a ação é relatar', () => {
    const c = cobrir([post('a', `${AMANHA} 10:00`, 'FAILED'), post('b', `${AMANHA} 10:10`, 'DRAFT')])
    expect(c.conflitosDeHorario).toHaveLength(1)
    expect(c.buracos.filter((b) => b.data === AMANHA && b.estado === 'vazio')).toEqual([])
    const acoes = acoesDoCliente(c, true).map((a) => a.codigo)
    expect(acoes).toContain('CONFLITO_DE_HORARIO')
    // O COMPOR que existir é do outro dia (depois de amanhã está vazio), nunca do horário em conflito.
    expect(c.buracos.filter((b) => b.estado === 'vazio').every((b) => b.data !== AMANHA)).toBe(true)
    // Cliente coberto com conflito não aparece como saudável.
    const coberto = cobrir([pronto('a', `${AMANHA} 10:00`), pronto('b', `${AMANHA} 10:05`), pronto('c', `${DEPOIS} 10:00`)])
    expect(coberto.diasAdiantados).toBe(2)
    expect(acoesDoCliente(coberto, true)[0].codigo).toBe('CONFLITO_DE_HORARIO')
  })

  it('8. a auditoria continua só leitura: a lista de posts entra e sai intacta', () => {
    const posts = [pronto('a', `${AMANHA} 10:00`), pronto('b', `${AMANHA} 10:00`)]
    const antes = structuredClone(posts)
    cobrir(posts)
    expect(posts).toEqual(antes)
  })

  it('grade com horários vizinhos (10h e 10h30): um post em cada NÃO é conflito; um terceiro é, e aparece uma vez', () => {
    const grade = { title: 'Padrões de Postagem — Teste', content: 'SLOT 1 — 10h, todos os dias\nSLOT 2 — 10h30, todos os dias' }
    const expectativa = expectativaDoProjeto({ historico: [], encerradas: new Set(), entradasDaGrade: [grade], agora: AGORA })
    expect(slotsEsperadosNaData(expectativa, AMANHA).map((s) => s.hora)).toEqual(['10:00', '10:30'])
    const rodar = (posts: PostDaJanela[]) => coberturaDoProjeto({ expectativa, posts, campanhasExpiram: new Map(), agora: AGORA })
    const certos = [pronto('a', `${AMANHA} 10:00`), pronto('b', `${AMANHA} 10:30`)]
    expect(rodar(certos).conflitosDeHorario).toEqual([])
    // Um terceiro, empatado entre os dois, vai para o mais cedo: conflito às 10h.
    expect(rodar([...certos, pronto('c', `${AMANHA} 10:15`)]).conflitosDeHorario).toEqual([
      { data: AMANHA, hora: '10:00', formato: 'story', quantidade: 2, postIds: ['a', 'c'] },
    ])
    // Dois posts às 10h (duplicata) numa grade 10h + 10h30: conflito, mesmo com o 10h30 "ocupado" pela tolerância.
    expect(rodar([pronto('a', `${AMANHA} 10:00`), pronto('d', `${AMANHA} 10:00`)]).conflitosDeHorario).toEqual([
      { data: AMANHA, hora: '10:00', formato: 'story', quantidade: 2, postIds: ['a', 'd'] },
    ])
  })
})
