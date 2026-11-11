import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  problemasDasPromocoes as validar,
  aplicarPromocoes,
  conferirPromocoes,
  type AlteracaoDePromocao,
} from '../promocoes-da-entrada';
const problemasDasPromocoes = (dados: unknown, pedidos: unknown) =>
  validar(dados as Record<string, unknown>, pedidos as AlteracaoDePromocao[]);
const antigo = {
  promoções: [
    {
      nome: 'Happy Wine',
      dias: ['ter', 'qua', 'qui', 'sex', 'sab'],
      preço: 79,
      horário: { ter_sex: '16h–20h', sab: '12h–16h' },
    },
    {
      nome: 'Happy Hour',
      dias: ['ter', 'qua', 'qui', 'sex', 'sab'],
      itens: ['chopp', 'drinks selecionados'],
      horário: { ter_sex: '16h–20h', sab: '12h–16h' },
    },
  ],
  outro: { segredoDoNegocio: 'preservar' },
};
const mudancas = ['Happy Wine', 'Happy Hour'].map((nome) => ({
  nome,
  dias: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'],
  horario: { seg_sex: '16:00-20:00', sab: '12:00-16:00' },
})) as AlteracaoDePromocao[];
const linha = (content) => ({
  id: 'e',
  title: 'Happy Wine e Happy Hour — TERO',
  content,
  updatedAt: new Date('2026-11-11'),
  expiresAt: null,
  metadata: {},
});
const texto =
  'Happy Wine\nVinhos selecionados à vontade por R$ 79,00 por pessoa.\nSegunda a sexta das 16h às 20h · Sábado das 12h às 16h.\n\nHappy Hour\nChopp e drinks selecionados em dobro.\nSegunda a sexta das 16h às 20h · Sábado das 12h às 16h.';
test('TERO: dias e mapa juntos, preservando arrays e os demais valores', () => {
  assert.deepEqual(problemasDasPromocoes(antigo, mudancas), []);
  const novo = aplicarPromocoes(antigo, mudancas);
  assert.deepEqual(novo.promoções[0], {
    ...antigo.promoções[0],
    dias: mudancas[0].dias,
    horário: mudancas[0].horario,
  });
  assert.deepEqual(novo.promoções[1].itens, antigo.promoções[1].itens);
  assert.deepEqual(novo.outro, antigo.outro);
  assert.equal(antigo.promoções[0].horário.ter_sex, '16h–20h');
});
test('rejeita alvo ausente, duplicado, pedidos duplicados e JSON livre', () => {
  for (const [dados, pedidos] of [
    [antigo, [{ ...mudancas[0], nome: 'Executivo' }]],
    [{ promoções: [antigo.promoções[0], antigo.promoções[0]] }, [mudancas[0]]],
    [antigo, [mudancas[0], mudancas[0]]],
    [antigo, [{ ...mudancas[0], preço: 1 }]],
  ])
    assert.ok(problemasDasPromocoes(dados, pedidos).length);
});
test('rejeita lacunas, sobreposição, dia inválido e faixa inválida', () => {
  for (const patch of [
    { horario: { ter_sex: '16:00-20:00', sab: '12:00-16:00' } },
    {
      horario: {
        seg_sex: '16:00-20:00',
        seg: '16:00-20:00',
        sab: '12:00-16:00',
      },
    },
    { dias: ['segunda'] },
    { dias: ['seg', 'seg'] },
    { horario: { seg_sex: '25:00-26:00', sab: '12:00-16:00' } },
    { horario: { feriados: '12:00-16:00' } },
    { horario: { seg_sex: '16:00-16:00', sab: '12:00-16:00' } },
  ])
    assert.ok(
      problemasDasPromocoes(antigo, [{ ...mudancas[0], ...patch }]).length
    );
});
test('detecta a segunda ausente no cadastro antigo via cabeçalhos, sem inferir dados', () => {
  const r = conferirPromocoes(antigo, [linha(texto)]);
  assert.ok(
    r.divergencias.some((d) => d.campo === 'promoções[Happy Wine].dias')
  );
  assert.ok(
    r.divergencias.some((d) => d.campo === 'promoções[Happy Hour].dias')
  );
  assert.deepEqual(
    conferirPromocoes(aplicarPromocoes(antigo, mudancas), [linha(texto)])
      .divergencias,
    []
  );
});
test('separa Wine, Hour, funcionamento e executivo; não herda título misto', () => {
  const dados = aplicarPromocoes(antigo, mudancas);
  const r = conferirPromocoes(dados, [
    linha(
      'Happy Wine: segunda das 15h às 20h.\nHappy Hour: segunda das 16h às 20h.\nFuncionamento: segunda das 11h30 às 23h30.\nExecutivo: segunda das 11h30 às 15h.\nDomingo das 10h às 11h.'
    ),
  ]);
  assert.equal(r.divergencias.length, 1);
  assert.equal(r.divergencias[0].campo, 'promoções[Happy Wine].horário');
  assert.deepEqual(
    conferirPromocoes(dados, [linha('Segunda das 15h às 20h.')]).divergencias,
    []
  );
});
test('suporta cláusula conjunta da grade e escopo explícito parcial', () => {
  const r = conferirPromocoes(aplicarPromocoes(antigo, mudancas), [
    linha('Happy Wine e Happy Hour: seg–sex 16h–20h · sáb 12h–16h'),
  ]);
  assert.deepEqual(r.divergencias, []);
  assert.equal(r.cobertura.parcial, true);
  assert.ok(r.cobertura.comparacoes >= 12);
  assert.match(r.cobertura.aviso, /não certifica/);
});
test('feriados, negação, horário sem dia e títulos não viram fatos', () => {
  const r = conferirPromocoes(antigo, [
    linha(
      'Happy Wine: feriado segunda das 10h às 11h.\nHappy Hour não vale segunda das 10h às 11h.\nHappy Wine das 10h às 11h.'
    ),
  ]);
  assert.deepEqual(r.divergencias, []);
  assert.ok(r.cobertura.naoAnalisados.length >= 2);
});
test('grade real separa orações com executivo e rolha free', () => {
  const grade =
    'Almoço executivo: seg–sex, 11h30–16h. Happy hour (chopp e drinks selecionados em dobro) e Happy Wine (vinhos à vontade): seg–sex 15h–20h · sáb 12h–16h. Rolha free: seg–qui, no jantar.';
  const r = conferirPromocoes(aplicarPromocoes(antigo, mudancas), [
    linha(grade),
  ]);
  assert.equal(r.divergencias.length, 10);
  assert.ok(
    r.divergencias.every((d) => d.valorNoTexto.endsWith('15:00-20:00'))
  );
});
test('horário de publicação não vira horário do serviço', () => {
  for (const t of [
    'Publicação do Happy Wine: segunda a sexta 13h–14h',
    'Postar Happy Hour de segunda a sexta das 13h às 14h',
    'Happy Wine: feriado segunda das 10h às 11h · sábado das 10h às 11h',
  ]) {
    const r = conferirPromocoes(aplicarPromocoes(antigo, mudancas), [linha(t)]);
    assert.deepEqual(r.divergencias, []);
    assert.ok(r.cobertura.naoAnalisados.length);
  }
});

test('duas promoções com faixas separadas na mesma cláusula não cruzam fatos', () => {
  const r = conferirPromocoes(aplicarPromocoes(antigo, mudancas), [
    linha(
      'Happy Wine segunda das 16h às 20h e Happy Hour segunda das 17h às 21h.'
    ),
  ]);
  assert.deepEqual(r.divergencias, []);
  assert.ok(r.cobertura.naoAnalisados.length);
});
test('exceção e publicação em seção persistem entre linhas até novo cabeçalho', () => {
  for (const contexto of ['Feriado 15/11', 'Publicação']) {
    const r = conferirPromocoes(aplicarPromocoes(antigo, mudancas), [
      linha(
        `Happy Wine\n${contexto}\nSegunda das 10h às 11h.\nHappy Hour\nSegunda das 15h às 20h.`
      ),
    ]);
    assert.equal(r.divergencias.length, 1);
    assert.equal(r.divergencias[0].campo, 'promoções[Happy Hour].horário');
    assert.ok(r.cobertura.naoAnalisados.length);
  }
});

test('itens alheios nulos no array são preservados sem quebrar a seleção', () => {
  const dados = { promoções: [null, ...antigo.promoções] };
  assert.deepEqual(problemasDasPromocoes(dados, mudancas), []);
  const novo = aplicarPromocoes(dados, mudancas);
  assert.equal(novo.promoções[0], null);
  assert.equal(novo.promoções[1].nome, 'Happy Wine');
});
