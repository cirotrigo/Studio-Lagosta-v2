# -*- coding: utf-8 -*-
"""Transcrição palavra a palavra com tempos precisos (fala em português), para cortar e legendar.

Uso:
  python3 transcrever.py <vídeo ou áudio> <saida.json> [--correcoes corr.json] [--prompt "nomes"]
                         [--inicio s] [--fim s] [--modelo ggml.bin]
  python3 transcrever.py            → autoconferência das partes puras (sem whisper, sem arquivo)

Saída: <saida.json> = [{"palavra", "ini_s", "fim_s", "falante", "confianca", "publico",
"corrigido"?, "nota"?}] com o tempo do ARQUIVO de entrada (o --inicio já somado), e <saida>.txt
ao lado, uma linha por frase. "falante" é A (voz alta: na lapela) ou B (voz baixa: fora do
microfone), só pelo nível. "publico": false = marcação entre colchetes ou parênteses (risos,
música), que o whisper às vezes escreve e que não é fala.

--correcoes corr.json = {"trocas": {"errado": "certo", "Barra em": "Barra e"},
                         "silabas": {"Tennessee": 3}}
  trocas: aplicadas no núcleo da palavra (sem pontuação), depois do whisper; a chave pode ter
  várias palavras (troca de contexto), com o MESMO número de palavras dos dois lados. Cada troca
  fica registrada na palavra ("corrigido": "a→b"). Correção de fala mal ouvida que muda o número
  de palavras (ex.: "E aí" que era "É") é edição manual do JSON, não troca.
  silabas: sílabas faladas de palavras que a contagem por vogais erra (nomes estrangeiros,
  hiatos, números). Pesam na repartição do tempo dentro do trecho.
--prompt: nomes e termos do contexto (vão como prompt inicial do whisper, para a grafia).

Como os tempos saem (medido no C0100 do Costela do Edd, 24/09/2026, contra a transcrição aprovada):
1. whisper-cli large-v3-turbo com DTW (tempo por token, o CENTRO da palavra). O DTW só funciona
   sem flash attention: com o -fa (padrão do whisper.cpp 1.9) todo t_dtw sai -1, sem aviso.
2. Envelope de energia a cada 10 ms e detector de voz (autocorrelação, F0) na voz a 16 kHz.
   Os limiares são RELATIVOS ao nível da voz alta (REF, percentil 90 dos quadros com voz), então
   valem para qualquer ganho de gravação. Voz alta (lapela) e voz baixa (fora do microfone, mas
   com F0 de voz) são ativas; o resto é pausa se durar >= 120 ms.
3. Trechos = o que sobra entre as pausas; cada palavra vai para o trecho do seu centro DTW.
   Dentro do trecho, a fronteira esperada entre duas palavras reparte o espaço entre os centros
   pelas sílabas, e uma programação dinâmica em grade de 10 ms escolhe as fronteiras (perto da
   esperada, duração coerente com as sílabas, preferindo vales de energia).
4. Palavra que começa por oclusiva (p t k b d g): a fronteira vai para o COMEÇO da oclusão, no
   envelope de 5 ms a 48 kHz, a até 120 ms antes da DP.
"""
import json, math, os, re, shutil, subprocess, sys, tempfile
import numpy as np

MODELO = os.path.expanduser('~/.cache/whisper-cpp/ggml-large-v3-turbo.bin')
WHISPER = shutil.which('whisper-cli') or '/opt/homebrew/bin/whisper-cli'
# limiares em dB ABAIXO do REF (nível da voz alta). No C0100 (REF -11,1 dBFS) eles reproduzem os
# absolutos do build.py de 24/09: -30 (lapela), -28 (silêncio), -26 (vizinhança), -16 (ataque), -20.
ALTO_DB, SILENCIO_DB, VIZINHO_DB, ATAQUE_DB, OCLUSIVA_DB = 19, 17, 15, 5, 9
# ...e nunca abaixo do ruído de fundo (PISO, percentil 5) mais esta folga. No C0100 o piso é -42 e não
# muda nada; no C0103 (shopping, piso -31, voz a só ~12 dB acima) o ruído passava por "lapela" e o
# clipe inteiro virava um trecho só, sem pausa nenhuma.
ALTO_PISO, SILENCIO_PISO, VIZINHO_PISO = 6, 8, 10
FALANTE_B_DB = 13            # palavra com nível (p90) mais de 13 dB abaixo do REF = voz baixa (B)
F0_MIN, F0_MAX = 75, 300     # voz fora do microfone: homem e mulher (o build.py usava 85–180, só homem)
PAUSA_Q = 12                 # pausa mínima: 120 ms
VOZ_MIN_Q = 2                # voz baixa: pelo menos 20 ms seguidos (3 já come o "b" fraco de "Buscar")
SIG, CAP, GAM, SPS, LAM = 0.06, 4.0, 0.5, 0.14, 0.08   # DP: desvio da fronteira, teto, duração, s/sílaba, vale
JAN_DP = 200                 # DP: cada fronteira só é procurada a até 2 s da esperada
VOGAIS = re.compile(r"[aeiouyáéíóúâêîôûãõàèü]+")
# travessão de diálogo que o whisper escreve na troca de falante (" -Pro", " -Buscar"): - – —
TRAVESSAO = re.compile(rb'^(?:-|\xe2\x80[\x93\x94])+')
# cabeças de alinhamento do DTW (-dtw do whisper-cli). Preset errado não dá erro: dá tempo errado.
PRESETS_DTW = {'tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en', 'medium', 'medium.en',
               'large.v1', 'large.v2', 'large.v3', 'large.v3.turbo'}


def preset_dtw(modelo):
    """ggml-large-v3-turbo-q5_0.bin → large.v3.turbo. Nome que não dá um preset conhecido é recusado."""
    n = re.sub(r'(-q\d(_\d|_k)?)?\.bin$', '', re.sub(r'^ggml-', '', os.path.basename(modelo))).replace('-', '.')
    if n not in PRESETS_DTW:
        raise SystemExit(f'modelo {os.path.basename(modelo)}: não sei o preset de DTW dele (conheço '
                         f'{", ".join(sorted(PRESETS_DTW))}); renomeie no padrão ggml-<modelo>.bin')
    return n


def nucleo(w):
    """A palavra sem pontuação em volta (é nela que troca e sílaba casam)."""
    return re.sub(r"[^\w'’-]", '', w)


def silabas(w, excecoes=None):
    c = nucleo(w)
    if excecoes and c in excecoes:
        return excecoes[c]
    if c.isdigit():
        return 2 * len(c)      # ponytail: "28" = vinte e oito (4) acerta, "2025" (7) sai 8; exceção corrige
    return max(1, len(VOGAIS.findall(c.lower())))


def palavras_dos_tokens(segmentos):
    """Tokens do whisper (JSON completo) → palavras. Token que começa com espaço abre palavra; o
    resto (sílaba, pontuação) cola na anterior. Tempo = t_dtw do primeiro token com DTW (centro);
    sem DTW, o meio dos offsets. O texto vem em bytes (surrogateescape): o whisper parte letra
    acentuada entre dois tokens, e cada metade sozinha não é UTF-8."""
    W = []
    for s in segmentos:
        novo = True
        for t in s['tokens']:
            b = t['text'].encode('utf-8', 'surrogateescape')
            if b.startswith(b'[_'):
                continue
            if b.startswith(b' ') or novo:
                # travessão de diálogo (" -", ou colado: " -Pro") marca troca de falante, não é texto; o
                # hífen DENTRO da palavra ("demi-glace") vem sem espaço e fica
                sem = TRAVESSAO.sub(b'', b.strip())
                if not sem:
                    novo = True                          # a próxima parte abre a palavra
                    continue
                if sem != b.strip():
                    b = b' ' + sem
            td = t['t_dtw'] / 100 if t.get('t_dtw', -1) >= 0 else None
            de, ate = t['offsets']['from'] / 1000, t['offsets']['to'] / 1000
            if b.startswith(b' ') or not W or (novo and re.search(r'\w', b.decode('utf-8', 'ignore'))):
                W.append({'b': b.strip(), 'dtw': td, 'p': [t['p']], 'de': de, 'ate': ate})
            else:
                w = W[-1]
                w['b'] += b; w['p'].append(t['p']); w['ate'] = ate
                if w['dtw'] is None:
                    w['dtw'] = td
            novo = False
    # marcação entre colchetes/parênteses com espaço dentro ("[fala inaudível]") vira uma palavra só
    M = []
    for w in W:
        if M and M[-1]['b'][:1] in (b'[', b'(') and not re.search(rb'[\])]', M[-1]['b']) and M[-1]['b'].count(b' ') < 4:
            m = M[-1]; m['b'] += b' ' + w['b']; m['p'] += w['p']; m['ate'] = w['ate']
        else:
            M.append(w)
    out = []
    for w in M:
        txt = w['b'].decode('utf-8', 'replace')
        conf = math.exp(sum(math.log(max(p, 1e-6)) for p in w['p']) / len(w['p']))
        publico = txt[:1] not in '[(' and bool(re.search(r'\w', txt))
        o = {'w': txt, 'dtw': w['dtw'] if w['dtw'] is not None else (w['de'] + w['ate']) / 2,
             'conf': round(conf, 2), 'publico': publico, 'de': w['de'], 'ate': w['ate']}
        if w['dtw'] is None and publico:
            o['nota'] = 'whisper sem tempo DTW nesta palavra: centro estimado pelo segmento'
        out.append(o)
    return out


def corrigir(W, trocas):
    """Trocas no núcleo da palavra; chave com várias palavras = troca de contexto (mesmo tamanho)."""
    nuc = [nucleo(w['w']) for w in W]
    for errado, certo in trocas.items():
        a, b = errado.split(), certo.split()
        if len(a) != len(b) or not a:
            raise SystemExit(f'troca "{errado}" → "{certo}": os dois lados precisam do mesmo número '
                             'de palavras (juntar ou separar palavras é edição manual)')
        for i in range(len(W) - len(a) + 1):
            if nuc[i:i + len(a)] != a:
                continue
            for k in range(len(a)):
                if a[k] != b[k]:
                    w = W[i + k]
                    w['w'] = w['w'].replace(a[k], b[k], 1)
                    w['corrigido'] = f'{a[k]}→{b[k]}' + (f' (em "{errado}")' if len(a) > 1 else '')
                    nuc[i + k] = b[k]
    return W


def energia(x, sr=16000):
    """Energia (dBFS) por quadro de 10 ms."""
    hop = sr // 100
    n = len(x) // hop
    return 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)


def suave(E):
    return np.convolve(E, np.ones(3) / 3, 'same')


def niveis(Es):
    """(REF, PISO) do envelope suavizado: REF = nível da voz alta (p90 dos quadros com voz), PISO = ruído
    de fundo (p5). O silêncio digital (quadro zerado, -180 dB: cabeça ou cauda de WAV exportado) fica fora
    do piso: com mais de 5% dele o piso ia a -180 e a proteção pelo ruído sumia (o C0103 com 3 s de cauda
    zerada virava um trecho só, fronteiras até 880 ms fora)."""
    som = Es[Es > -90]
    FLOOR = float(np.percentile(som if len(som) else Es, 5))
    fala = Es[Es > FLOOR + 15]
    return float(np.percentile(fala if len(fala) else Es, 90)), FLOOR


def medidas(x, sr=16000):
    """Energia (dBFS, 10 ms), força da periodicidade (0–1) e F0 (Hz) por quadro de 10 ms."""
    hop, win = sr // 100, int(0.04 * sr)
    E = energia(x, sr)
    n = len(E)
    V, F = np.zeros(n), np.zeros(n)
    lo, hi = int(sr / 400), int(sr / 70)
    jan = np.hanning(win)
    for i in range(n):
        s = i * hop
        fr = x[s:s + win]
        if len(fr) < win:
            fr = np.pad(fr, (0, win - len(fr)))
        fr = fr - fr.mean()
        ac =np.fft.irfft(np.abs(np.fft.rfft(fr * jan, 2048)) ** 2)[:win]
        if ac[0] <= 0:
            continue
        ac /= ac[0]
        k = lo + int(np.argmax(ac[lo:hi]))
        V[i], F[i] = ac[k], sr / k
    return E, V, F


def corridas(mask, minimo):
    """[(i, j)] dos trechos True com pelo menos `minimo` quadros (j exclusivo)."""
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            if j - i >= minimo:
                out.append((i, j))
            i = j
        else:
            i += 1
    return out


def resolver(S, Ef, ws, dep):
    """Fronteiras das palavras de um trecho [S, Ef) (s) por programação dinâmica em grade de 10 ms.
    Custo da fronteira k: distância à esperada ws[k]['e'] (gaussiana com teto) menos o vale de
    energia ali (dep); custo da duração: log da razão contra sílabas × SPS. Cada palavra entre 30 ms
    e 2 s; se não couber, reparte pelas sílabas.
    ponytail: cada fronteira só é procurada a até JAN_DP da esperada (faixa por palavra, não a grade
    inteira). Sem isso o custo era n×G: trecho sem pausa nenhuma (música de fundo com F0 de voz) de
    10 min dava ~2 GB e minutos. No C0100 e no C0103 a faixa não muda nenhuma fronteira."""
    n = len(ws)
    a, b = int(round(S * 100)), int(round(Ef * 100))
    G = b - a
    if n == 1:
        return [S]
    INF = 1e18
    faixa, cost, back = [(0, 0)], [np.zeros(1)], [None]     # por k: (g mínimo, g máximo) e os vetores
    for k in range(1, n + 1):
        ek = ws[k]['e'] if k < n else None
        if k == n:
            g0, g1 = G, G
        else:
            g0, g1 = k * 3, G
            if not np.isnan(ek):
                c = int(round(ek * 100)) - a
                g0, g1 = max(g0, c - JAN_DP), min(g1, c + JAN_DP)
        p0, p1 = faixa[-1]
        ck, bk = np.full(max(0, g1 - g0 + 1), INF), np.zeros(max(0, g1 - g0 + 1), int)
        for g in range(g0, g1 + 1):
            if k < n:
                bc = (0 if np.isnan(ek) else min((((a + g) / 100 - ek) / SIG) ** 2, CAP)) \
                    - LAM * min(dep[a + g] if a + g < len(dep) else 0, 10)
            else:
                bc = 0
            lo, hi = max(p0, g - 200), min(p1, g - 3)
            if hi < lo:
                continue
            D = g - np.arange(lo, hi + 1)
            tot = cost[-1][lo - p0:hi - p0 + 1] + GAM * np.log(D / 100 / (ws[k - 1]['syl'] * SPS)) ** 2
            j = int(np.argmin(tot))
            ck[g - g0] = tot[j] + bc
            bk[g - g0] = lo + j
        faixa.append((g0, g1)); cost.append(ck); back.append(bk)
    if cost[n][0] >= INF:
        acc = np.cumsum([0] + [w['syl'] for w in ws])
        return [S + (Ef - S) * c / acc[-1] for c in acc[:-1]]
    g, st = G, [0] * n
    for k in range(n, 0, -1):
        g = back[k][g - faixa[k][0]]
        st[k - 1] = g
    return [(a + v) / 100 for v in st]


def oclusiva(w):
    return bool(re.match(r'(p|t|k|b|d|g|qu|c[aouáóúâôãõ]|c[lr])', re.sub(r'[^a-zà-ú]', '', w.lower())))


def marca(a0, b0):
    return {'w': '[voz sem palavra]', 'ini': a0, 'fim': b0, 'de': a0, 'ate': b0, 'conf': 0.0, 'publico': False,
            'nota': 'voz (ou ruído com cara de voz) onde o whisper não pôs palavra: tropeço, risada, fala de '
                    'fundo. Ouvir antes de cortar aqui.'}


def alinhar(W, E, V, F, x48, sr48=48000, ref_piso=None):
    """Tempos de cada palavra pública (w['ini'], w['fim'], em s do áudio extraído) e o nível dela.
    É o build.py de 24/09 com os limiares relativos e sem nada do clipe cravado. Devolve (REF, órfãos):
    órfão = trecho com voz em que o whisper não pôs palavra (tropeço, risada, fala de fundo, comando de
    gravação), como marcação fora da fala. No C0100 são os risos e a fala da equipe do fim, e o "Valendo"
    do começo, que sai pela regra da subida (colado na fala, sem pausa antes do "E aí").
    ref_piso = (REF, PISO) medidos fora (o arquivo inteiro, quando só um recorte foi transcrito)."""
    Es = suave(E)
    REF, FLOOR = ref_piso or niveis(Es)
    ALTO = Es > max(REF - ALTO_DB, FLOOR + ALTO_PISO)
    SILENCIO, VIZINHO = max(REF - SILENCIO_DB, FLOOR + SILENCIO_PISO), max(REF - VIZINHO_DB, FLOOR + VIZINHO_PISO)
    PER = (V > 0.45) & (F >= F0_MIN) & (F <= F0_MAX)       # periódico com F0 de voz
    BAIXO = PER & (Es > FLOOR + 2) & ~ALTO
    # voz de verdade dura: quadro periódico solto é ruído de fundo (no C0100, um zumbido de ~140 Hz
    # com a oitava em 280 dava quadros "de voz" isolados dentro das pausas e as apagava)
    so = np.zeros_like(BAIXO)
    for i, j in corridas(BAIXO, VOZ_MIN_Q):
        so[i:j] = True
    BAIXO = so
    ATIVO = ALTO | BAIXO
    P = [w for w in W if w['publico']]
    if not P:
        return REF, []
    Cn = np.array([w['dtw'] for w in P])
    # pausas: sem voz >= 120 ms, exceto respiro curto entre sílabas da voz baixa (baixo dos dois lados,
    # sem voz alta perto); e trecho sem voz alta em que o whisper não ouviu palavra = ruído de fundo
    pausas = []
    for a0, b0 in corridas(~ATIVO, PAUSA_Q):
        viz = BAIXO[max(0, a0 - 5):a0].any() and BAIXO[b0:b0 + 5].any() \
            and not (Es[max(0, a0 - 15):a0] > VIZINHO).any() and not (Es[b0:b0 + 15] > VIZINHO).any()
        if not (viz and b0 - a0 < 20):
            pausas.append([a0, b0])
    for a0, b0 in corridas(~(Es > SILENCIO), PAUSA_Q):
        if not ((Cn > a0 / 100 + 0.02) & (Cn < b0 / 100 - 0.02)).any():
            pausas.append([a0, b0])
    pausas.sort()
    M = []
    for p in pausas:
        if M and p[0] <= M[-1][1] + 1:
            M[-1][1] = max(M[-1][1], p[1])
        else:
            M.append(list(p))
    bordas = [0] + [v for p in M for v in p] + [len(Es)]
    R = [[bordas[k] / 100, bordas[k + 1] / 100] for k in range(0, len(bordas), 2) if bordas[k + 1] - bordas[k] > 3]
    # começo de trecho: voz baixa sem palavra do whisper antes da voz alta é ruído (ou oclusão)
    for r in R:
        f, e = int(round(r[0] * 100)), int(round(r[1] * 100))
        g = f
        while g < e and not ALTO[g]:
            g += 1
        if f < g < e and not ((Cn >= r[0]) & (Cn < g / 100 - 0.02)).any():
            r[0] = g / 100
    # palavra → trecho pelo centro DTW, em ordem
    ri = 0
    for w in P:
        t = w['dtw']
        while ri + 1 < len(R) and t >= R[ri + 1][0] + 0.02:
            ri += 1
        if ri + 1 < len(R) and R[ri][1] <= t < R[ri + 1][0] and (R[ri + 1][0] - t) < (t - R[ri][1]):
            ri += 1
        w['run'] = ri
    usados = sorted(set(w['run'] for w in P))
    for w in P:
        w['run'] = usados.index(w['run'])
    # palavra partida por consoante fraca: em ruído alto o "s"/"x" de "próximo" passa por pausa, e o
    # "pró" fica num trecho sem palavra. Trecho sem palavra colado (< 0,3 s) antes de um trecho cuja
    # primeira palavra tem o centro a menos de uma duração esperada dele = o começo dessa palavra.
    # ponytail: só para a frente. A cauda não se junta à palavra de antes: no C0103 ela era o tropeço
    # ("Salt… Shi… Party Drive"), que o whisper não escreveu e que tem de aparecer como marcação.
    for k in range(len(R) - 1):
        if k in usados or k + 1 not in usados:
            continue
        w0 = next(w for w in P if w['run'] == usados.index(k + 1))
        if R[k + 1][0] - R[k][1] < 0.3 and w0['dtw'] - R[k][1] < w0['syl'] * SPS:
            f, e = int(round(R[k][0] * 100)), int(round(R[k][1] * 100))
            R[k + 1][0] = next((i for i in range(f, e) if ALTO[i:i + 3].all()), f) / 100   # 1º ataque firme
            R[k][1] = R[k][0]                                  # vazio: não vira marcação
    orfaos, ult = [], None
    for k, (a0, b0) in enumerate(R):
        if k in usados or (ATIVO[int(a0 * 100):int(b0 * 100)]).sum() < 8:   # sílaba de verdade >= 80 ms
            continue
        if orfaos and ult == k - 1 and a0 - orfaos[-1]['fim'] < 0.3:   # rajadas seguidas (risada) = uma marca
            orfaos[-1]['fim'] = b0
        else:
            orfaos.append(marca(a0, b0))
        ult = k
    R = [R[k] for k in usados]
    # ruído alto colado no começo da fala (sem pausa e acima do limiar da lapela: no C0100, -25 dB de sala
    # antes do "É, gente"): o trecho começa na subida de >= 10 dB mais cedo antes da primeira palavra.
    # ponytail: só no começo. A mesma regra no FIM cortou o "-glace" de "demi-glace" (fricativa fraca,
    # 280 ms); ruído depois da última palavra ainda estica o fim dela.
    for r, (S, Ef) in enumerate(R):
        w0 = next(w for w in P if w['run'] == r)
        if w0['dtw'] - S > w0['syl'] * SPS + 0.15:
            lo, c = max(int(S * 100) + 15, int((w0['dtw'] - w0['syl'] * SPS - 0.3) * 100)), int(w0['dtw'] * 100)
            sobe = [f for f in range(lo, c) if Es[f] >= Es[f - 15:f].min() + 10]
            if sobe:
                R[r][0] = sobe[0] / 100
                # a voz que fica antes da subida (o "Valendo" do C0100) vira marcação, não some calada
                if sum(j - i for i, j in corridas(PER[int(S * 100):sobe[0]], VOZ_MIN_Q)) >= 8:
                    orfaos.append(marca(S, sobe[0] / 100))
    # fronteira esperada: entre os centros, repartida pelas sílabas
    for i, w in enumerate(P):
        if i and P[i - 1]['run'] == w['run']:
            p = P[i - 1]
            w['e'] = p['dtw'] + (w['dtw'] - p['dtw']) * p['syl'] / (p['syl'] + w['syl'])
        else:
            w['e'] = np.nan
    # ataque forte depois de trecho baixo (troca de falante): se cair a até 0,25 s da esperada, manda
    H = [f for f in range(12, len(Es) - 3) if Es[f - 12:f].max() < VIZINHO
         and Es[f:f + 3].mean() > REF - ATAQUE_DB and Es[f - 1] < Es[f]]
    H = [f for k, f in enumerate(H) if k == 0 or f - H[k - 1] > 3]
    for f in H:
        h = f / 100
        cand = [w for w in P if not np.isnan(w['e']) and abs(w['e'] - h) <= 0.25
                and h >= R[w['run']][0] + 0.10 and not w.get('ataque')]
        if cand:
            w = min(cand, key=lambda w: abs(w['e'] - h))
            w['e'], w['ataque'] = h, True
    dep = np.zeros(len(Es))
    for f in range(5, len(Es) - 6):
        dep[f] = max(0, min(Es[f - 5:f].max(), Es[f + 1:f + 6].max()) - Es[f])
    for r, (S, Ef) in enumerate(R):
        ws = [w for w in P if w['run'] == r]
        st = resolver(S, Ef, ws, dep)
        for k, w in enumerate(ws):
            w['ini'] = round(st[k], 3)
            w['fim'] = round(st[k + 1] if k + 1 < len(ws) else Ef, 3)
    # oclusiva: a fronteira vai para o começo da oclusão (queda sustentada no envelope de 5 ms)
    H5 = sr48 // 200

    def env5(a, b):
        s0 = max(0, int(a * sr48))
        n = max(0, min(int((b - a) * sr48), len(x48) - s0) // H5)
        return 20 * np.log10(np.sqrt((x48[s0:s0 + n * H5].reshape(n, H5) ** 2).mean(1)) + 1e-9), s0 / sr48

    def sonoro(tf):
        f = int(tf * 100)
        return any(V[k] > 0.45 for k in (f, f + 1) if 0 <= k < len(V))

    for i, w in enumerate(P):
        if i == 0 or P[i - 1]['run'] != w['run'] or not oclusiva(w['w']):
            continue
        t = w['ini']
        e, a = env5(t - 0.15, t + 0.06)
        surda = re.match(r'(p|t|k|qu|c)', re.sub(r'[^a-zà-ú]', '', w['w'].lower()))
        cands = []
        for f in range(6, len(e) - 6):
            ref, tf = e[f - 6:f].max(), a + f * 0.005
            if tf < t - 0.12 or tf > t + 0.03 or (surda and sonoro(tf)):   # p/t/k: oclusão sem voz
                continue
            if ref >= REF - OCLUSIVA_DB and e[f] <= ref - 7 and e[f:f + 4].max() <= ref - 4 and e[f - 1] > e[f]:
                cands.append(tf)
        if not cands:
            continue
        tf, p = round(min(cands, key=lambda z: abs(z - t)), 3), P[i - 1]
        if tf > p['ini'] + 0.04:
            w['ini'] = p['fim'] = tf
        elif i >= 2 and P[i - 2]['run'] == w['run']:
            # a oclusão cai antes do início da anterior: reparte o espaço das duas pelas sílabas
            pp = P[i - 2]
            nv = round(pp['ini'] + (tf - pp['ini']) * pp['syl'] / (pp['syl'] + p['syl']), 3)
            if nv - pp['ini'] >= 0.03 and tf - nv >= 0.03:
                w['ini'] = p['fim'] = tf
                p['ini'] = pp['fim'] = nv
    for w in P + orfaos:
        a = int(w['ini'] * 100)
        w['nivel'] = float(np.percentile(Es[a:max(a + 1, int(w['fim'] * 100))], 90))
        w['falante'] = 'A' if w['nivel'] >= REF - FALANTE_B_DB else 'B'
    # palavra solta entre duas do outro nível, sem pausa dos dois lados, é a sílaba fraca da frase
    # ("te" de "pra te contar" cai para -25 dB), não troca de falante
    for a, w, b in zip(P, P[1:], P[2:]):
        if a['falante'] == b['falante'] != w['falante'] and w['ini'] - a['fim'] < 0.12 and b['ini'] - w['fim'] < 0.12:
            w['falante'] = a['falante']
    return REF, orfaos


def saida(W, inicio):
    out = []
    for w in W:
        if w['publico']:
            ini, fim = w['ini'], w['fim']
        else:
            ini, fim = w['de'], max(w['ate'], w['de'] + 0.01)   # marcação: tempo do próprio whisper
        o = {'palavra': w['w'], 'ini_s': round(ini + inicio, 3), 'fim_s': round(fim + inicio, 3),
             'falante': w.get('falante', '?'), 'confianca': w['conf'], 'publico': w['publico']}
        for k in ('corrigido', 'nota'):
            if w.get(k):
                o[k] = w[k]
        out.append(o)
    return out


def texto(out, nome, gerado):
    """Uma linha por frase: quebra em pausa > 0,25 s ou troca de falante."""
    def fmt(t):
        return f"{int(t // 60)}:{t % 60:05.2f}".replace('.', ',')
    L = [f'{nome} — transcrição palavra a palavra (whisper + DTW, tempos refinados pela energia)',
         f'Gerado com: {gerado}',
         'Tempos do arquivo. A = voz alta (lapela), B = voz baixa (fora do microfone). ‖ = pausa > 0,25 s.', '']
    cur, ant = [], None
    for o in sorted(out, key=lambda o: o['ini_s']):
        if not o['publico']:
            continue
        gap = o['ini_s'] - ant['fim_s'] if ant else 0
        if cur and (gap > 0.25 or o['falante'] != ant['falante']):
            L.append(f"[{fmt(cur[0]['ini_s'])}–{fmt(cur[-1]['fim_s'])}] {cur[0]['falante']}: "
                     + ' '.join(x['palavra'] for x in cur))
            if gap > 0.25:
                dentro = [m for m in out if not m['publico'] and m['ini_s'] < o['ini_s'] and m['fim_s'] > ant['fim_s']]
                L.append(f"      ‖ pausa {gap:.2f} s".replace('.', ',')
                         + ''.join(f" · {m['palavra']} {fmt(m['ini_s'])}–{fmt(m['fim_s'])}" for m in dentro))
            cur = []
        cur.append(o)
        ant = o
    if cur:
        L.append(f"[{fmt(cur[0]['ini_s'])}–{fmt(cur[-1]['fim_s'])}] {cur[0]['falante']}: " + ' '.join(x['palavra'] for x in cur))
    marcas = [o for o in out if not o['publico']]
    if marcas:
        L += ['', 'FORA DA FALA TRANSCRITA (marcações do whisper e voz sem palavra)'] + [f"[{fmt(o['ini_s'])}–{fmt(o['fim_s'])}] {o['palavra']}" for o in marcas]
    obs = [o for o in out if o['publico'] and (o.get('corrigido') or o.get('nota'))]
    if obs:
        L += ['', 'OBSERVAÇÕES'] + [f"- {fmt(o['ini_s'])} \"{o['palavra']}\": "
                                     + '; '.join(v for v in (o.get('corrigido'), o.get('nota')) if v) for o in obs]
    return '\n'.join(L) + '\n'


def transcrever(arq, destino, corr=None, prompt=None, inicio=0.0, fim=None, modelo=MODELO):
    corr = corr or {}
    if not destino.lower().endswith('.json'):
        raise SystemExit(f'saída {destino}: tem de ser .json (o texto sai ao lado, com o mesmo nome e .txt)')
    for f in (arq, modelo):
        if not os.path.isfile(f):
            raise SystemExit(f'arquivo não encontrado: {f}')
    if inicio < 0 or (fim is not None and fim <= inicio):
        raise SystemExit(f'recorte inválido (--inicio {inicio}, --fim {fim}): o início não é negativo e o fim vem depois')
    preset = preset_dtw(modelo)
    recorte = inicio > 0 or fim is not None

    def ff(*args):
        r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f'ffmpeg falhou em {arq}: {r.stderr.strip()[-400:]}')

    ref_piso = None
    with tempfile.TemporaryDirectory() as tmp:
        ent = ['-ss', str(inicio)] + (['-t', str(fim - inicio)] if fim is not None else []) + ['-i', arq, '-vn', '-ac', '1']
        ff(*ent, '-ar', '16000', '-c:a', 'pcm_s16le', f'{tmp}/a16.wav')
        ff(*ent, '-ar', '48000', '-f', 'f32le', f'{tmp}/a48.raw')
        if recorte:
            # REF e PISO do arquivo INTEIRO: medidos só no recorte, os limiares mudavam com o lugar do corte
            # (30,05–45 no C0100: REF -10,0 contra -11,1, e o "-glace" de "demi-glace" virava marcação).
            # ponytail: o arquivo inteiro a 16 kHz na memória (~0,5 GB por hora); janela em volta do corte se pesar
            ff('-i', arq, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', f'{tmp}/todo.raw')
            ref_piso = niveis(suave(energia(np.fromfile(f'{tmp}/todo.raw', '<i2').astype(np.float32) / 32768)))
        cmd = [WHISPER, '-m', modelo, '-l', 'pt', '-nfa', '-dtw', preset, '-oj', '-ojf', '-np',
               '-of', f'{tmp}/w', '-f', f'{tmp}/a16.wav'] + (['--prompt', prompt] if prompt else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f'whisper-cli falhou ({r.returncode}): {r.stderr[-800:]}')
        if not os.path.exists(f'{tmp}/w.json'):
            raise SystemExit('o whisper não devolveu nada: trecho vazio ou fora do arquivo')
        with open(f'{tmp}/w.json', 'rb') as fh:
            d = json.loads(fh.read().decode('utf-8', 'surrogateescape'))
        import wave
        with wave.open(f'{tmp}/a16.wav') as wv:
            x16 = np.frombuffer(wv.readframes(wv.getnframes()), '<i2').astype(np.float32) / 32768
        x48 = np.fromfile(f'{tmp}/a48.raw', dtype='<f4')
    W = corrigir(palavras_dos_tokens(d['transcription']), corr.get('trocas', {}))
    if not any(w['publico'] for w in W):
        raise SystemExit('o whisper não ouviu fala nenhuma')
    for w in W:
        w['syl'] = silabas(w['w'], corr.get('silabas'))
    E, V, F = medidas(x16)
    ref, orfaos = alinhar(W, E, V, F, x48, ref_piso=ref_piso)
    out = saida(sorted(W + orfaos, key=lambda w: w.get('ini', w['de'])), inicio)
    # com que parâmetros saiu: sem isso a transcrição não se reproduz (o prompt muda a grafia e os tempos)
    gerado = [f'modelo {os.path.basename(modelo)} (DTW {preset})', f'REF {ref:.1f} dBFS'.replace('.', ',')]
    if recorte:
        gerado.append(f'recorte {inicio:g}–{fim:g} s' if fim is not None else f'recorte {inicio:g} s até o fim')
    if prompt:
        gerado.append(f'prompt "{prompt}"')
    if corr:
        gerado.append('correções ' + json.dumps(corr, ensure_ascii=False))
    with open(destino, 'w') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    with open(os.path.splitext(destino)[0] + '.txt', 'w') as fh:
        fh.write(texto(out, os.path.basename(arq), ' · '.join(gerado)))
    return out, ref


def _checar():
    # tokens → palavras: espaço abre palavra, pontuação e sílaba colam; especial sai; DTW do 1º token
    tk = lambda tx, dtw, p=0.9, a=0, b=0: {'text': tx, 't_dtw': dtw, 'p': p, 'offsets': {'from': a, 'to': b}}
    segs = [{'tokens': [tk('[_BEG_]', -1), tk(' Ed', 150), tk(' Camp', 160), tk('os', 170), tk(',', 175),
                        tk(' che', 190, 0.5), tk('fe', 195), tk(' [', 200, a=2000, b=2100), tk('ris', -1),
                        tk('os', -1), tk(']', -1, b=2400)]},
            {'tokens': [tk('Tô', -1, a=3000, b=3200), tk(' aqui', 330), tk('[_TT_40]', -1)]}]
    # "é" partido em dois tokens (bytes soltos), como o whisper faz
    meio = 'é'.encode()
    segs[1]['tokens'].append(tk(' ' + meio[:1].decode('utf-8', 'surrogateescape'), 350))
    segs[1]['tokens'].append(tk(meio[1:].decode('utf-8', 'surrogateescape'), -1))
    W = palavras_dos_tokens(segs)
    assert [w['w'] for w in W] == ['Ed', 'Campos,', 'chefe', '[risos]', 'Tô', 'aqui', 'é'], [w['w'] for w in W]
    assert [w['dtw'] for w in W[:3]] == [1.5, 1.6, 1.9] and W[3]['publico'] is False and W[3]['ate'] == 2.4
    assert 'nota' in W[4] and W[4]['dtw'] == 3.1           # começo de segmento sem espaço abre palavra
    assert W[2]['conf'] == round(math.sqrt(0.5 * 0.9), 2)
    # trocas: núcleo sem pontuação, contexto de várias palavras, registro na palavra
    W2 = corrigir([{'w': 'chefe,'}, {'w': 'Barra'}, {'w': 'em'}, {'w': 'Botafogo'}, {'w': 'em'}],
                  {'chefe': 'chef', 'Barra em': 'Barra e'})
    assert [w['w'] for w in W2] == ['chef,', 'Barra', 'e', 'Botafogo', 'em'], W2
    assert W2[0]['corrigido'] == 'chefe→chef' and W2[2]['corrigido'].startswith('em→e') and 'corrigido' not in W2[4]
    try:
        corrigir([{'w': 'E'}, {'w': 'aí'}], {'E aí': 'É'})
        assert False, 'troca que muda o número de palavras tem de parar'
    except SystemExit:
        pass
    # sílabas: grupos de vogais, pontuação fora, exceções, números
    assert [silabas(w) for w in ('costela,', 'Quintal', 'importantíssimo', 'é', 'purê', 'The')] == [3, 2, 6, 1, 2, 1]
    assert silabas('Tennessee,', {'Tennessee': 3}) == 3 and silabas('28') == 4
    # DP: 3 palavras num trecho de 1 s, fronteiras esperadas em 0,30 e 0,62 → a DP fica nelas
    ws = [{'syl': 2, 'e': np.nan}, {'syl': 2, 'e': 0.30}, {'syl': 3, 'e': 0.62}]
    st = resolver(0.0, 1.0, ws, np.zeros(200))
    assert st[0] == 0 and abs(st[1] - 0.30) <= 0.02 and abs(st[2] - 0.62) <= 0.02, st
    # vale de energia a 40 ms da esperada puxa a fronteira para ele
    dep = np.zeros(200); dep[34] = 10
    assert resolver(0.0, 1.0, ws, dep)[1] == 0.34
    # trecho curto demais para a regra dos 30 ms: reparte pelas sílabas, sem quebrar
    assert resolver(0.0, 0.05, ws, np.zeros(20)) == [0.0, 0.05 * 2 / 7, 0.05 * 4 / 7]
    # alinhamento sintético: duas palavras em 0,2–0,5 e 0,6–1,0 s de voz, pausa no meio
    E = np.full(160, -60.0); E[20:50] = -12; E[35] = -30   # vale dentro da 1ª "palavra" não é pausa
    E[70:100] = -28                                        # 2ª palavra 16 dB abaixo: voz baixa (B)
    E[120:135] = -12                                       # voz sem palavra do whisper: vira marcação
    E[60], V, F = -40, np.zeros(160), np.zeros(160)        # um quadro periódico solto na pausa (zumbido)
    V[60], F[60] = 0.9, 140                                # não é voz: a pausa 0,50–0,70 continua
    # (o centro DTW de "dia" cai DENTRO da pausa, como o whisper faz com ataque fraco: aí só a regra da
    # voz decide a pausa, a do silêncio sem palavra não)
    W3 = [{'w': 'bom', 'dtw': 0.35, 'syl': 1, 'publico': True}, {'w': 'dia', 'dtw': 0.68, 'syl': 2, 'publico': True}]
    ref, orf = alinhar(W3, E, V, F, np.zeros(76800, np.float32))
    assert [(w['ini'], w['fim'], w['falante']) for w in W3] == [(0.2, 0.5, 'A'), (0.71, 0.99, 'B')], W3   # média de 3 quadros come a borda fraca
    assert ref == -12 and [(o['ini'], o['fim'], o['publico']) for o in orf] == [(1.2, 1.35, False)], orf
    # ruído alto (shopping): piso -28, voz a -15. Sem o limiar pelo piso, o ruído passa por lapela e não há pausa
    E = np.full(160, -28.0) + np.tile([0.0, -3.0], 80); E[20:50] = -15; E[80:110] = -15
    W4 = [{'w': 'bom', 'dtw': 0.35, 'syl': 1, 'publico': True}, {'w': 'dia', 'dtw': 0.95, 'syl': 2, 'publico': True}]
    alinhar(W4, E, np.zeros(160), np.zeros(160), np.zeros(76800, np.float32))
    assert [(w['ini'], w['fim']) for w in W4] == [(0.2, 0.5), (0.8, 1.1)], W4
    # sala barulhenta colada no começo da fala (acima do limiar da lapela): o trecho começa na subida
    E = np.full(160, -60.0); E[0:40] = -25; E[40:70] = -8
    W5 = [{'w': 'bom', 'dtw': 0.55, 'syl': 1, 'publico': True}]
    alinhar(W5, E, np.zeros(160), np.zeros(160), np.zeros(76800, np.float32))
    assert (W5[0]['ini'], W5[0]['fim']) == (0.4, 0.69), W5
    # palavra partida por consoante fraca: "pró" sozinho antes de "ximo" (onde está o centro) volta para
    # a palavra; a sílaba solta DEPOIS da palavra (tropeço) continua marcação
    E = np.full(160, -60.0); E[20:30] = -12; E[45:70] = -12; E[85:97] = -12
    W6 = [{'w': 'próximo', 'dtw': 0.5, 'syl': 3, 'publico': True}]
    _, orf = alinhar(W6, E, np.zeros(160), np.zeros(160), np.zeros(76800, np.float32))
    assert (W6[0]['ini'], W6[0]['fim']) == (0.2, 0.7) and [(o['ini'], o['fim']) for o in orf] == [(0.85, 0.97)], (W6, orf)
    assert oclusiva('Costela') and oclusiva('quero') and oclusiva('Brasil') and not oclusiva('cerveja') and not oclusiva('Ed')
    print('transcrever.py: autoconferência ok')


if __name__ == '__main__':
    if len(sys.argv) == 1:
        _checar()
        sys.exit()
    import argparse
    ap = argparse.ArgumentParser(description='Transcrição palavra a palavra com tempos precisos')
    ap.add_argument('arquivo'); ap.add_argument('saida')
    ap.add_argument('--correcoes'); ap.add_argument('--prompt')
    ap.add_argument('--inicio', type=float, default=0.0); ap.add_argument('--fim', type=float)
    ap.add_argument('--modelo', default=MODELO)
    a = ap.parse_args()
    try:
        corr = json.load(open(a.correcoes)) if a.correcoes else {}
    except (OSError, ValueError) as e:
        raise SystemExit(f'--correcoes {a.correcoes}: {e}')
    out, ref = transcrever(a.arquivo, a.saida, corr, a.prompt, a.inicio, a.fim, a.modelo)
    fala = [o for o in out if o['publico']]
    print(f"{len(fala)} palavras de fala ({sum(o['falante'] == 'B' for o in fala)} em voz baixa), "
          f"{len(out) - len(fala)} marcações; REF {ref:.1f} dBFS → {a.saida}")
