/** Promoções existentes, sem JSON livre. Puro: não importa banco nem serviços. */
import type {
  Divergencia,
  LinhaDaBase,
  ProblemaDeCampo,
} from './dados-da-entrada';

export const NOMES_DE_PROMOCAO = ['Happy Wine', 'Happy Hour'] as const;
export const DIAS_DE_PROMOCAO = [
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
  'sab',
  'dom',
] as const;
export const GRUPOS_DE_PROMOCAO = [
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
  'sab',
  'dom',
  'seg_sex',
  'ter_sex',
] as const;
type Dia = (typeof DIAS_DE_PROMOCAO)[number];
export interface AlteracaoDePromocao {
  nome: (typeof NOMES_DE_PROMOCAO)[number];
  dias: Dia[];
  horario: Partial<Record<(typeof GRUPOS_DE_PROMOCAO)[number], string>>;
}
const normal = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const objeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const diasDoGrupo = (grupo: string): string[] =>
  grupo === 'seg_sex'
    ? DIAS_DE_PROMOCAO.slice(0, 5)
    : grupo === 'ter_sex'
      ? DIAS_DE_PROMOCAO.slice(1, 5)
      : DIAS_DE_PROMOCAO.includes(grupo as Dia)
        ? [grupo]
        : [];
const campoDe = (nome: string) => `promoções[${nome}]`;

function faixaValida(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(v);
  if (!m) return false;
  const [h, min, f, fm] = m.slice(1).map(Number);
  return (
    h < 24 &&
    min < 60 &&
    f <= 24 &&
    fm < 60 &&
    (f !== 24 || fm === 0) &&
    h * 60 + min !== (f * 60 + fm) % 1440
  );
}
/** Lê apenas o legado observado (16h–20h) e a faixa canônica. Não converte fatos. */
function faixaDoLegado(v: unknown): string | null {
  if (faixaValida(v)) return v.replace(/-00:00$/, '-24:00');
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2})h(\d{2})?\s*[–-]\s*(\d{1,2})h(\d{2})?$/.exec(v);
  const f = m
    ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}-${m[3].padStart(2, '0')}:${m[4] ?? '00'}`
    : '';
  return faixaValida(f) ? f.replace(/-00:00$/, '-24:00') : null;
}
function mapaDe(
  dias: unknown,
  horario: unknown,
  legado = false
): Map<string, string> | null {
  if (
    !Array.isArray(dias) ||
    dias.length === 0 ||
    dias.length > 7 ||
    new Set(dias).size !== dias.length ||
    dias.some((d) => !DIAS_DE_PROMOCAO.includes(d))
  )
    return null;
  if (!objeto(horario) || Object.keys(horario).length === 0) return null;
  const mapa = new Map<string, string>();
  for (const [grupo, valor] of Object.entries(horario)) {
    const membros = diasDoGrupo(grupo);
    const faixa = legado
      ? faixaDoLegado(valor)
      : faixaValida(valor)
        ? valor.replace(/-00:00$/, '-24:00')
        : null;
    if (!membros.length || !faixa) return null;
    for (const dia of membros) {
      if (!dias.includes(dia) || mapa.has(dia)) return null;
      mapa.set(dia, faixa);
    }
  }
  return mapa.size === dias.length ? mapa : null;
}
export function problemasDasPromocoes(
  dados: Record<string, unknown>,
  pedidos: AlteracaoDePromocao[]
): ProblemaDeCampo[] {
  const problemas: ProblemaDeCampo[] = [];
  const vistos = new Set<string>();
  for (const p of pedidos) {
    const campo = campoDe(p?.nome ?? '?');
    const erro = (motivo: string) => problemas.push({ campo, motivo });
    if (
      !objeto(p) ||
      Object.keys(p).some((k) => !['nome', 'dias', 'horario'].includes(k)) ||
      !NOMES_DE_PROMOCAO.includes(p.nome)
    ) {
      erro('pedido fora do schema fechado');
      continue;
    }
    if (vistos.has(p.nome)) erro('promoção repetida no pedido');
    vistos.add(p.nome);
    const candidatos = Array.isArray(dados.promoções)
      ? dados.promoções.filter(
          (v) =>
            objeto(v) &&
            typeof v.nome === 'string' &&
            normal(v.nome.trim()) === normal(p.nome)
        )
      : [];
    const atual = candidatos[0];
    if (candidatos.length !== 1 || atual.nome !== p.nome) {
      erro('promoção exata ausente ou ambígua');
      continue;
    }
    if (!mapaDe(atual.dias, atual.horário, true))
      erro(
        'dias/horário existentes fora do formato coberto; revisão necessária, nada substituído'
      );
    if (!mapaDe(p.dias, p.horario))
      erro(
        'dias e horário devem ter cobertura exata, sem lacunas, sobreposição ou valores inválidos'
      );
  }
  return problemas;
}
export function aplicarPromocoes(
  dados: Record<string, unknown>,
  pedidos: AlteracaoDePromocao[]
): Record<string, unknown> {
  const problemas = problemasDasPromocoes(dados, pedidos);
  if (problemas.length)
    throw new Error(problemas.map((p) => `${p.campo}: ${p.motivo}`).join('; '));
  const novo = structuredClone(dados);
  for (const p of pedidos) {
    const alvo = (novo.promoções as Record<string, unknown>[]).find(
      (v) => objeto(v) && v.nome === p.nome
    )!;
    alvo.dias = structuredClone(p.dias);
    alvo.horário = structuredClone(p.horario);
  }
  return novo;
}

const DIA =
  '(?:segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\\b';
const HORA = '(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))';
const FAIXA = new RegExp(
  `(${DIA})(?:\\s*(?:a|–|-)\\s*(${DIA}))?\\s*[:,]?\\s*(?:das?\\s+)?${HORA}\\s*(?:as?|ate|–|-)\\s*${HORA}`,
  'g'
);
const OUTRO =
  /\b(?:executivo|funcionamento|delivery|cozinha|brunch|almoco|jantar|horario da casa)\b/;
const EXCECAO =
  /feriado|vespera|natal|reveillon|carnaval|pascoa|excepcional|\b\d{1,2}\/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} de \w+/;
const PUBLICACAO =
  /\b(?:publicacao|publicar|postar|postagem|agendar|agendamento|horario do post|horario de postagem)\b/;
const NEGACAO = /\b(?:nao|exceto|somente|apenas|menos)\b/;
const nomesNo = (s: string) =>
  NOMES_DE_PROMOCAO.filter((n) => s.includes(normal(n)));

export function conferirPromocoes(
  dados: Record<string, unknown>,
  linhas: LinhaDaBase[]
) {
  const divergencias: Divergencia[] = [];
  const naoAnalisados: {
    entradaId?: string;
    trecho: string;
    motivo: string;
  }[] = [];
  let comparacoes = 0;
  const mapas = new Map<string, Map<string, string>>();
  const array = Array.isArray(dados.promoções) ? dados.promoções : [];
  for (const nome of NOMES_DE_PROMOCAO) {
    const candidatos = array.filter(
      (v) =>
        objeto(v) &&
        typeof v.nome === 'string' &&
        normal(v.nome.trim()) === normal(nome)
    );
    if (!candidatos.length) continue;
    const mapa =
      candidatos.length === 1 && candidatos[0].nome === nome
        ? mapaDe(candidatos[0].dias, candidatos[0].horário, true)
        : null;
    if (mapa) mapas.set(nome, mapa);
    else
      naoAnalisados.push({
        trecho: campoDe(nome),
        motivo: 'cadastro ambíguo ou formato não coberto',
      });
  }
  for (const linha of linhas) {
    if (linha.expiresAt) continue;
    let secao: readonly string[] = [];
    let secaoNaoInterpretada = false;
    for (const original of linha.content.split(/\n+/)) {
      const texto = normal(original.trim());
      if (!texto) continue;
      const cabecalho = texto
        .replace(/^#+\s*/, '')
        .replace(/[:*]+$/g, '')
        .replace(/^\*+/, '');
      const nomeExato = NOMES_DE_PROMOCAO.find((n) => normal(n) === cabecalho);
      if (nomeExato) {
        secao = [nomeExato];
        secaoNaoInterpretada = false;
        continue;
      }
      if (OUTRO.test(texto) || /^#+\s|^[^\d]+:$/.test(texto)) secao = [];
      let sujeito = secao;
      let contextoNaoInterpretado = secaoNaoInterpretada;
      for (const trecho of original.split(/\s*·\s*|;\s*|(?<=[.!?])\s+/)) {
        const t = normal(trecho);
        const explicitos = nomesNo(t);
        if (explicitos.length) sujeito = explicitos;
        if (!sujeito.length || ![...sujeito].some((n) => mapas.has(n)))
          continue;
        const pular = (motivo: string) =>
          naoAnalisados.push({ entradaId: linha.id, trecho, motivo });
        if (OUTRO.test(t)) {
          sujeito = [];
          pular('outro serviço ou cláusula mista');
          continue;
        }
        contextoNaoInterpretado ||=
          EXCECAO.test(t) || NEGACAO.test(t) || PUBLICACAO.test(t);
        if (secao.length && contextoNaoInterpretado)
          secaoNaoInterpretada = true;
        if (contextoNaoInterpretado) {
          pular('publicação, exceção ou condição não interpretada');
          continue;
        }
        const faixas = [...t.matchAll(FAIXA)];
        if (sujeito.length > 1 && faixas.length > 1) {
          pular('múltiplos serviços e faixas sem atribuição inequívoca');
          continue;
        }
        if (!faixas.length) {
          pular('sem dia e faixa reconhecíveis');
          continue;
        }
        for (const m of faixas) {
          const a = DIAS_DE_PROMOCAO.indexOf(m[1].slice(0, 3) as Dia);
          const b = m[2]
            ? DIAS_DE_PROMOCAO.indexOf(m[2].slice(0, 3) as Dia)
            : a;
          if (b < a) {
            pular('intervalo de dias não coberto');
            continue;
          }
          const faixa = `${m[3].padStart(2, '0')}:${m[4] ?? m[5] ?? '00'}-${m[6].padStart(2, '0')}:${m[7] ?? m[8] ?? '00'}`;
          if (!faixaValida(faixa)) {
            pular('faixa inválida');
            continue;
          }
          for (const nome of sujeito) {
            const mapa = mapas.get(nome);
            if (!mapa) continue;
            for (const dia of DIAS_DE_PROMOCAO.slice(a, b + 1)) {
              comparacoes++;
              const valor = mapa.get(dia);
              if (valor === faixa.replace(/-00:00$/, '-24:00')) continue;
              divergencias.push({
                campo: `${campoDe(nome)}.${valor ? 'horário' : 'dias'}`,
                valorNosDados: valor ? `${dia}: ${valor}` : `${dia}: ausente`,
                valorNoTexto: `${dia}: ${faixa}`,
                trecho,
                origem: {
                  entradaId: linha.id,
                  titulo: linha.title,
                  atualizadaEm: linha.updatedAt.toISOString(),
                },
              });
            }
          }
        }
      }
    }
  }
  return {
    divergencias,
    cobertura: {
      parcial: true,
      comparacoes,
      servicosComCadastroLegivel: [...mapas.keys()],
      naoAnalisados,
      aviso:
        'Ausência de divergências não certifica toda a Base. A conferência cobre somente afirmações positivas com serviço, dia e faixa reconhecidos; preços, itens, condições, dias omitidos e exceções exigem revisão humana.',
    },
  };
}
