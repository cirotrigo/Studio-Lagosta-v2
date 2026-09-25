#!/usr/bin/env python3
# Masterização do render do Resolve: limita o TRUE PEAK do áudio e deixa o vídeo intacto.
#
#   python3 masterizar.py <RAIZ> <arquivo.mp4> [--limite -1.5]
#   python3 masterizar.py --checar            → autoconferência (mp4 sintético numa pasta temporária)
#
# <arquivo.mp4> é o render em <RAIZ>/08_EXPORTACOES/01_PREVIAS (nome, ou caminho absoluto).
#
# Por quê: o render do Resolve do V1 do Costela do Edd (24/09/2026) saiu com true peak de +4,5 dBFS —
# a mixagem é em ponto flutuante e o AAC guarda acima de 0 dBFS; o celular corta, e o Instagram
# re-codifica com clipe. Com o limitador em −1,5 dB o pico caiu para −1,5 e a loudness ficou em
# −16,6 LUFS (antes −16,4): o limitador só segura os picos, não levanta nada.
#
# O que faz:
# - vídeo copiado (-c:v copy: mesmos quadros, sem re-codificar); só a 1ª de vídeo e a 1ª de áudio
#   (a trilha de dados/timecode do Resolve fica de fora);
# - áudio: alimiter com limit = 10^(dB/20), attack 5 ms, release 50 ms, level=false (sem ganho de
#   compensação) e latency=true — sem ele o lookahead ATRASA o áudio em 5 ms (medido: 240 amostras
#   a 48 kHz); re-codificado em AAC 320k, 48 kHz; +faststart;
# - grava primeiro num temporário ao lado; só com ele pronto e medido DENTRO do limite (até FOLGA
#   acima: o AAC passa uns décimos) move o render do Resolve para <RAIZ>/07_TEMPORARIOS/render-bruto/
#   <nome> (render do Resolve).mp4 (sem sobrescrever: " 2", " 3"…) e põe a versão masterizada no lugar
#   original. Se o ffmpeg falhar ou o pico não descer, nada é movido.
# - mede antes e depois com ebur128=peak=true e imprime JSON (loudness integrada e true peak).
# - arquivo que JÁ está dentro do limite não é tocado ("feito": false): rodar de novo não re-codifica
#   o AAC nem guarda o masterizado como se fosse o render. Com um limite MAIS baixo, re-limita — e aí o
#   "render do Resolve" guardado da 2ª vez já não é o bruto (o bruto é o sem número).
# - a RAIZ tem de ser a pasta do projeto (com 08_EXPORTACOES): errada ou relativa ao lugar errado,
#   o render iria parar fora do HD.
import array, json, os, re, shutil, subprocess, sys, tempfile

FOLGA = 0.5  # dB acima do limite que ainda contam como "dentro": o AAC passa uns décimos do limitador


def medir(arq):
    """{"lufs", "true_peak_db"} do 1º áudio (ebur128, true peak com sobreamostragem)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", arq, "-map", "0:a:0",
                        "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True)
    i, tp = re.findall(r"I:\s+(\S+) LUFS", r.stderr), re.findall(r"Peak:\s+(\S+) dBFS", r.stderr)
    if r.returncode or not i or not tp:
        raise SystemExit(f"não consegui medir {arq}:\n{r.stderr[-600:]}")
    return {"lufs": float(i[-1]), "true_peak_db": float(tp[-1])}


def livre(caminho):
    """caminho, ou o mesmo com " 2", " 3"… antes da extensão, o primeiro que não existe."""
    base, ext = os.path.splitext(caminho)
    k = 1
    while os.path.exists(caminho):
        k += 1
        caminho = f"{base} {k}{ext}"
    return caminho


def masterizar(raiz, arq, limite=-1.5):
    if not -24 <= limite <= 0:
        raise SystemExit(f"--limite {limite}: use entre -24 e 0 dB")
    if not os.path.isdir(os.path.join(raiz, "08_EXPORTACOES")):
        raise SystemExit(f"{raiz} não é a pasta de um projeto (falta 08_EXPORTACOES): passe a RAIZ certa")
    orig = arq if os.path.isabs(arq) else os.path.join(raiz, "08_EXPORTACOES", "01_PREVIAS", arq)
    if not os.path.isfile(orig):
        raise SystemExit(f"não existe: {orig}")
    nome, ext = os.path.splitext(os.path.basename(orig))
    antes = medir(orig)
    if antes["true_peak_db"] <= limite + FOLGA:
        return {"arquivo": orig, "feito": False, "motivo": "já dentro do limite", "limite_db": limite, "antes": antes}
    tmp = os.path.join(os.path.dirname(orig), f".{nome}.masterizando{ext}")
    af = f"alimiter=limit={10 ** (limite / 20):.6f}:attack=5:release=50:level=false:latency=true"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", orig,
                        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", af,
                        "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-movflags", "+faststart", tmp],
                       capture_output=True, text=True)
    if r.returncode:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise SystemExit(f"ffmpeg falhou (nada foi movido):\n{r.stderr[-600:]}")
    depois = medir(tmp)
    if depois["true_peak_db"] > limite + FOLGA:
        os.remove(tmp)
        raise SystemExit(f"o masterizado ficou com true peak {depois['true_peak_db']} dB, acima de {limite}: "
                         "nada foi movido")
    bruto = livre(os.path.join(raiz, "07_TEMPORARIOS", "render-bruto", f"{nome} (render do Resolve){ext}"))
    os.makedirs(os.path.dirname(bruto), exist_ok=True)
    shutil.move(orig, bruto)
    os.replace(tmp, orig)
    return {"arquivo": orig, "feito": True, "render_do_resolve": bruto, "limite_db": limite, "antes": antes,
            "depois": depois}


def _video(arq):
    """(codec, quadros, md5 dos pacotes): o mesmo md5 prova que o vídeo foi copiado, não re-codificado."""
    s = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries",
                        "stream=codec_name,nb_read_packets", "-of", "json", arq], capture_output=True, text=True)
    v = json.loads(s.stdout)["streams"][0]
    h = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", arq, "-map", "0:v:0", "-c", "copy",
                        "-f", "streamhash", "-hash", "md5", "-"], capture_output=True, text=True).stdout.strip()
    return v["codec_name"], int(v["nb_read_packets"]), h


def _rajadas(arq):
    """Início (ms) de cada rajada do sintético: janela de 1 ms com energia > 1,5 × a mediana."""
    b = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", arq, "-map", "0:a:0", "-ac", "1",
                        "-ar", "48000", "-f", "f32le", "-"], capture_output=True).stdout
    x = array.array("f", b)
    e = [sum(v * v for v in x[i:i + 48]) for i in range(0, len(x) - 48, 48)]
    lim = 1.5 * sorted(e)[len(e) // 2]
    return [i for i in range(250, len(e)) if e[i] > lim >= e[i - 1]]


def _checar():
    """mp4 sintético de 2 s (testsrc + seno com rajadas; volume=6dB põe as rajadas em +6 dBFS e o resto
    em −6), masterizado e conferido: vídeo idêntico, pico no limite e loudness que não sobe."""
    raiz = tempfile.mkdtemp()
    prev = os.path.join(raiz, "08_EXPORTACOES", "01_PREVIAS")
    os.makedirs(prev)
    arq = os.path.join(prev, "teste (V1).mp4")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "testsrc=size=320x568:rate=30000/1001:duration=2",
                    "-f", "lavfi", "-i", "aevalsrc=0.25*sin(2*PI*997*t)+if(lt(mod(t\\,0.5)\\,0.005)\\,0.75*sin(2*PI*997*t)\\,0):s=48000:d=2",
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-af", "volume=6dB,pan=stereo|c0=c0|c1=c0", "-c:a", "aac", "-b:a", "320k", arq], check=True)
    v0, antes, t0 = _video(arq), medir(arq), _rajadas(arq)
    assert t0 == [500, 1000, 1500], t0
    assert antes["true_peak_db"] > 0, antes  # o sintético tem de passar de 0 dBFS, senão não prova nada
    rs = []
    for limite, feito in ((-1.5, True), (-1.5, False), (-3.0, True)):  # a 2ª já está no limite; a 3ª re-limita
        bytes_antes = open(arq, "rb").read()
        r = masterizar(raiz, "teste (V1).mp4", limite)
        assert r["feito"] == feito, r
        if not feito:  # nada re-codificado, nada guardado como se fosse o render
            assert open(arq, "rb").read() == bytes_antes and r["motivo"] == "já dentro do limite", r
            continue
        rs.append({"limite": limite, **r["depois"]})
        assert _video(arq) == v0, (_video(arq), v0)  # vídeo copiado: mesmo codec, quadros e bytes
        assert limite - 0.5 <= r["depois"]["true_peak_db"] <= limite + 0.3, r  # o AAC passa uns décimos
        assert r["depois"]["lufs"] <= r["antes"]["lufs"], r  # level=false: nada de ganho de compensação
        assert _rajadas(arq) == t0, _rajadas(arq)  # latency=true: o áudio não atrasou em relação ao vídeo
        assert os.path.isfile(r["render_do_resolve"]) and not os.path.exists(os.path.join(prev, ".teste (V1).masterizando.mp4"))
    # a 3ª rodada não sobrescreveu o render guardado da 1ª
    guardados = sorted(os.listdir(os.path.join(raiz, "07_TEMPORARIOS", "render-bruto")))
    assert guardados == ["teste (V1) (render do Resolve) 2.mp4", "teste (V1) (render do Resolve).mp4"], guardados
    assert medir(os.path.join(raiz, "07_TEMPORARIOS", "render-bruto", guardados[1]))["true_peak_db"] > 0
    # ffmpeg que falha (arquivo sem vídeo: mede, mas o -map 0:v:0 não acha nada) não move nada
    ruim = os.path.join(prev, "so-audio.mp4")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "sine=frequency=440:sample_rate=48000:duration=1", "-af", "volume=20dB", "-c:a", "aac", ruim], check=True)
    try:
        masterizar(raiz, "so-audio.mp4")
        raise AssertionError("devia falhar")
    except SystemExit as e:
        assert "nada foi movido" in str(e), e
        assert sorted(os.listdir(prev)) == ["so-audio.mp4", "teste (V1).mp4"], os.listdir(prev)
        assert len(os.listdir(os.path.join(raiz, "07_TEMPORARIOS", "render-bruto"))) == 2
    # o pico que não desce até o limite (aqui medir mente: tudo +3 dB) não move nada nem deixa temporário
    real, globals()["medir"] = medir, lambda a: {"lufs": -16.0, "true_peak_db": 3.0}
    try:
        masterizar(raiz, "teste (V1).mp4")
        raise AssertionError("devia recusar")
    except SystemExit as e:
        assert "acima de -1.5" in str(e) and "nada foi movido" in str(e), e
    finally:
        globals()["medir"] = real
    assert sorted(os.listdir(prev)) == ["so-audio.mp4", "teste (V1).mp4"], os.listdir(prev)
    assert len(os.listdir(os.path.join(raiz, "07_TEMPORARIOS", "render-bruto"))) == 2
    # RAIZ que não é projeto: recusa antes de mexer (o render não sai do HD para outro lugar)
    try:
        masterizar(os.path.join(raiz, "nao-e-projeto"), arq)
        raise AssertionError("devia recusar")
    except SystemExit as e:
        assert "08_EXPORTACOES" in str(e) and os.path.isfile(arq) and not os.path.exists(os.path.join(raiz, "nao-e-projeto")), e
    shutil.rmtree(raiz)
    print(json.dumps({"antes": antes, "depois": rs}), "\nok")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["--checar"]:
        _checar()
    elif len(a) in (2, 4) and (len(a) == 2 or a[2] == "--limite"):
        print(json.dumps(masterizar(a[0], a[1], float(a[3]) if len(a) == 4 else -1.5), ensure_ascii=False, indent=1))
    else:
        sys.exit("uso: python3 masterizar.py <RAIZ> <arquivo.mp4> [--limite -1.5] | --checar")
