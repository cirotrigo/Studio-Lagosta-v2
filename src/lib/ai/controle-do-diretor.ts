import { createHash } from 'node:crypto';

/** Orçamento compartilhado entre as tentativas; registro sobrevive ao fallback. */
export const VERSAO_DO_CONTROLE_DO_DIRETOR = '2026-09-08.1';
export const RESERVA_PARA_GERAR_MS = 120_000;
const MINIMO_POR_RODADA_MS = 5_000;

type Desfecho = 'aprovado' | 'recusado' | 'erro' | 'timeout';

export interface RegistroDoDiretor {
  versao: string;
  estado: 'nao-executado' | 'executando' | 'aprovado' | 'fallback';
  motivoFallback: 'prazo' | 'tentativas-esgotadas' | null;
  contexto?: {
    modelo: string;
    systemHash: string;
    contextoHash: string;
    imagensHash: string[];
  };
  tentativas: Array<{
    rodada: number;
    limiteMs: number;
    duracaoMs: number;
    desfecho: Desfecho;
    motivos: string[];
  }>;
}

/** Fingerprints detectam mudanças sem duplicar fotos ou o contexto da marca no registro. */
export function registrarContextoDoDiretor(
  controle: ControleDoDiretor,
  modelo: string,
  system: string,
  contexto: string,
  imagens: Buffer[]
): void {
  const hash = (valor: string | Buffer) =>
    createHash('sha256').update(valor).digest('hex');
  controle.registro.contexto = {
    modelo,
    systemHash: hash(system),
    contextoHash: hash(contexto),
    imagensHash: imagens.map(hash),
  };
}

export interface ControleDoDiretor {
  deadlineAt?: number;
  registro: RegistroDoDiretor;
}

export function criarControleDoDiretor(deadlineAt?: number): ControleDoDiretor {
  return {
    deadlineAt,
    registro: {
      versao: VERSAO_DO_CONTROLE_DO_DIRETOR,
      estado: 'nao-executado',
      motivoFallback: null,
      tentativas: [],
    },
  };
}

/** Retorna zero antes de iniciar uma chamada que já não tem orçamento. */
export function limiteDaRodada(
  controle: ControleDoDiretor,
  tetoMs: number,
  agora = Date.now()
): number {
  const restante =
    controle.deadlineAt === undefined ? tetoMs : controle.deadlineAt - agora;
  const limite = Math.floor(Math.min(tetoMs, restante));
  if (!Number.isFinite(limite) || limite < MINIMO_POR_RODADA_MS) {
    controle.registro.estado = 'fallback';
    controle.registro.motivoFallback = 'prazo';
    return 0;
  }
  controle.registro.estado = 'executando';
  return limite;
}

export function registrarRodada(
  controle: ControleDoDiretor,
  limiteMs: number,
  inicio: number,
  desfecho: Desfecho,
  motivos: string[] = []
): void {
  controle.registro.tentativas.push({
    rodada: controle.registro.tentativas.length + 1,
    limiteMs,
    duracaoMs: Math.max(0, Date.now() - inicio),
    desfecho,
    motivos: motivos.slice(0, 10).map((m) => m.slice(0, 400)),
  });
  if (desfecho === 'aprovado') controle.registro.estado = 'aprovado';
}

export function concluirFallback(controle: ControleDoDiretor): void {
  controle.registro.estado = 'fallback';
  controle.registro.motivoFallback ??=
    controle.deadlineAt !== undefined && Date.now() >= controle.deadlineAt
      ? 'prazo'
      : 'tentativas-esgotadas';
}

/** Recalculado antes de CADA chamada de imagem, inclusive retentativas. */
export function tempoParaGerar(deadlineAt: number, agora = Date.now()): number {
  const restante = Math.floor(deadlineAt - agora);
  if (!Number.isFinite(restante) || restante < 30_000) {
    throw new Error(
      'Tempo insuficiente para gerar e finalizar a arte. Tente novamente.'
    );
  }
  return restante;
}
