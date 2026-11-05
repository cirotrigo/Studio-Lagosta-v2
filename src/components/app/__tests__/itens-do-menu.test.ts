import { describe, expect, it } from 'vitest';
import { itensDoMenu } from '../sidebar';

const base = [
  { name: 'Painel', href: '/studio' },
  { name: 'Cobrança', href: '/billing' },
];
const admin = [{ name: 'Gastos & Uso', href: '/admin/spending' }];

describe('itensDoMenu', () => {
  it('modo interno esconde Cobrança e mantém Gastos & Uso para admin', () => {
    expect(
      itensDoMenu(base, admin, { isAdmin: true, creditosAplicados: false }).map(
        (i) => i.name
      )
    ).toEqual(['Painel', 'Gastos & Uso']);
  });

  it('cobrança desconhecida (carregando) conta como desligada', () => {
    expect(
      itensDoMenu(base, admin, {
        isAdmin: false,
        creditosAplicados: undefined,
      }).map((i) => i.name)
    ).toEqual(['Painel']);
  });

  it('cobrança ligada traz Cobrança de volta', () => {
    expect(
      itensDoMenu(base, admin, { isAdmin: false, creditosAplicados: true }).map(
        (i) => i.name
      )
    ).toEqual(['Painel', 'Cobrança']);
  });
});
