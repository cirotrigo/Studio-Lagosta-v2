#!/usr/bin/env python3
"""Grade de batidas de uma música: BPM, 1ª batida, compasso e onde o som acaba.

Fluxo espectral (log-magnitude) -> autocorrelação para o andamento ->
busca fina de BPM e fase maximizando a força dos ataques nas batidas.
O compasso (qual batida é o "1") sai do fluxo das frequências graves.

uso: batidas.py <audio> [...]   -> uma linha JSON por arquivo
"""
import json
import subprocess
import sys

import numpy as np

SR, NFFT, HOP = 22050, 2048, 256


def carregar(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def fluxo(x, faixa=None):
    n = 1 + (len(x) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    mag = np.abs(np.fft.rfft(x[idx] * np.hanning(NFFT), axis=1))
    if faixa:
        mag = mag[:, :int(faixa * NFFT / SR)]
    lm = np.log1p(100 * mag)
    f = np.maximum(0, np.diff(lm, axis=0)).sum(1)
    f = np.concatenate([[0], f])
    k = int(0.4 * SR / HOP)
    f = np.maximum(0, f - np.convolve(f, np.ones(k) / k, "same"))
    return f / (f.max() or 1)


def forca(env, bpm, fase):
    fr = SR / HOP
    t = np.arange(fase, len(env) / fr, 60 / bpm)
    i = np.clip(np.round(t * fr).astype(int), 1, len(env) - 2)
    return np.maximum(np.maximum(env[i - 1], env[i]), env[i + 1]).mean(), i


def analisar(p):
    x = carregar(p)
    env = fluxo(x)
    fr = SR / HOP
    ac = np.correlate(env, env, "full")[len(env) - 1:]
    lags = np.arange(len(ac))
    ok = (lags >= fr * 60 / 180) & (lags <= fr * 60 / 60)
    bpms = 60 * fr / np.maximum(lags, 1)
    peso = ac * np.exp(-0.5 * (np.log2(bpms / 110) / 0.9) ** 2)
    bpm0 = bpms[ok][np.argmax(peso[ok])]
    melhor = (0, bpm0, 0)
    for bpm in np.arange(bpm0 - 2.5, bpm0 + 2.5, 0.02):
        for fase in np.arange(0, 60 / bpm, 0.005):
            s, _ = forca(env, bpm, fase)
            if s > melhor[0]:
                melhor = (s, bpm, fase)
    s, bpm, fase = melhor
    grave = fluxo(x, faixa=180)
    _, idx = forca(grave, bpm, fase)
    um = int(np.argmax([grave[idx[k::4]].mean() for k in range(4)]))
    rms = np.sqrt(np.convolve(x ** 2, np.ones(1102) / 1102, "same"))[::1102]
    fim = (np.nonzero(rms > rms.max() * 0.06)[0][-1] + 1) * 1102 / SR
    return {"arquivo": p, "dur": round(len(x) / SR, 3), "bpm": round(float(bpm), 2), "fase": round(float(fase), 3),
            "batida": round(60 / float(bpm), 4), "compasso_offset": um, "confianca": round(float(s), 3),
            "fim_som": round(float(fim), 2)}


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps(analisar(p), ensure_ascii=False), flush=True)
