"""Desvio mediano (ms) entre os ataques reais (envelope de 5 ms, resolução de 1 ms) e a grade de batidas.

Corrigido em 24/09/2026 (cópia de BKP Segate/REAL GELATERIA/.../_pipeline/desvio.py, original em desvio_original.py):
o original amostrava o envelope com env[::sr//1000] = passo de 44 amostras (0,9977 ms) e lia o índice como ms.
O erro cresce 2,27 ms por segundo de música; o "+23,5 ms" do autoteste era esse erro no meio de 20 s de cliques,
não viés do detector. Passado ~53 s, o ataque real sai da janela de ±120 ms e a mediana vira ruído.
Aqui o envelope é amostrado na posição exata de cada ms. Uso extra: desvio.py grade.jsonl audio [inicio fim].
"""
import subprocess, sys, json, numpy as np
def onsets(a, sr=44100):
    a=np.abs(a); w=int(0.005*sr); env=np.sqrt(np.convolve(a**2,np.ones(w)/w,"same"))
    env=env[np.round(np.arange(int(len(a)/sr*1000))*sr/1000).astype(int)]
    d=np.maximum(np.diff(np.log(env+1e-4),prepend=0),0); return np.convolve(d,np.ones(5),"same")
def desvio(d, fase, batida, fim, inicio=1.5):
    ts=np.arange(fase,fim,batida); ts=ts[ts>inicio]; dev=[]; lim=np.percentile(d,97)
    for x in ts:
        i0,i1=int(round((x-0.12)*1000)),int(round((x+0.12)*1000)); seg=d[i0:i1]
        if len(seg) and seg.max()>lim: dev.append((i0+seg.argmax())/1000-x)
    return float(np.median(dev))*1000 if dev else float("nan"), len(dev)
if __name__=="__main__":
    sr=44100
    for dur in (20,180):  # autoteste: cliques em 0,5 s + k·0,5 s sobre ruído
        t=np.zeros(sr*dur,np.float32); rng=np.random.default_rng(1); t+=rng.normal(0,0.01,len(t)).astype(np.float32)
        for k in np.arange(0.5,dur-1,0.5): i=int(k*sr); t[i:i+400]+=np.hanning(800)[400:]*0.8
        m,n=desvio(onsets(t),0.5,0.5,dur-1); print(f"autoteste (cliques na grade, {dur} s): {m:+.1f} ms ({n})")
    grade={json.loads(l)["arquivo"]:json.loads(l) for l in open(sys.argv[1])}
    p=sys.argv[2]; ini,fim=(float(sys.argv[3]),float(sys.argv[4])) if len(sys.argv)>4 else (1.5,None)
    g=grade[p]; a=np.frombuffer(subprocess.run(["ffmpeg","-v","quiet","-i",p,"-ac","1","-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout,np.float32)
    m,n=desvio(onsets(a),g["fase"],g["batida"],fim or g["fim_som"]-3,ini)
    print(json.dumps({"arquivo":p,"fase":g["fase"],"batida":g["batida"],"janela":[ini,fim],"desvio_ms":round(m),"ataques":n}, ensure_ascii=False))
