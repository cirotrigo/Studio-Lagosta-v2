# Etapa de montagem — lê <RAIZ>/04_DAVINCI/montagem.json e remonta a timeline de cada peça.
#
# Roda DENTRO do Resolve, pelo MCP (run_script_unsafe, teto de 60 s por chamada):
#   RAIZ = "/Volumes/.../PROJETO"; IDS = ["V2"]          # IDS opcional: sem ele, todas as peças
#   exec(open("<repo>/.claude/skills/editar-video/montar.py").read())
# Opcionais: APAGAR = True (apaga a timeline antiga sem guardar cópia).
#
# Fora do Resolve (`python3 montar.py`) roda só a autoconferência da conta de quadros.
#
# O que é medido e por que o script é assim (memória reference_davinci_resolve_mcp, 18–20/09/2026):
# - Remontar = apagar a timeline e criar outra. DeleteClips esvazia mas não encurta a trilha,
#   e recordFrame é ignorado em trilha que já tem clipe: não há outro caminho determinístico.
#   Por padrão a timeline antiga NÃO some: vira "<nome> · anterior" (a anterior da anterior é
#   apagada). É o que preserva o que o Ciro tiver mexido à mão no Resolve.
# - AppendToTimeline: endFrame EXCLUSIVO; a 100% a duração é floor(n * fps_timeline/fps_fonte)
#   com o fps REAL da timeline (30000/1001). SetSpeed com ripple divide ESSA duração pela
#   velocidade (±1–2 quadros). Por isso cada plano mira o CORTE ACUMULADO: o erro de um plano
#   é absorvido pelo seguinte e os cortes não derivam da grade.
# - mediaType 1 no vídeo (senão o som da câmera vai para a A1); a trilha entra na A1 vazia,
#   com recordFrame (só é respeitado em trilha vazia). A logo entra na V2, também vazia.
# - Durante um render o projeto trava SetProperties (devolve None): o script se recusa a rodar.
# - hasattr sempre devolve True nos objetos da API: sucesso se confere pelo RETORNO da chamada.
import json, math, os, time, unicodedata
from fractions import Fraction


def fps_real(x):
    """29.97 → 30000/1001, 119.88 → 120000/1001; 25 → 25. O Resolve devolve o fps arredondado."""
    x = float(x)
    k = round(x * 1.001)
    if abs(x - k / 1.001) < 0.005 and abs(x - k) > 0.005:
        return Fraction(k * 1000, 1001)
    return Fraction(x).limit_denominator(1001)


def quadros_fonte(d, r):
    """Menor n de quadros da fonte cujo append dá d quadros de timeline (floor(n*r) == d).
    r = fps_timeline/fps_fonte. Com r > 1 há durações inalcançáveis: devolve a mais próxima."""
    base = math.ceil(Fraction(d) / r)
    n = min(range(max(1, base - 2), base + 3), key=lambda n: (abs(math.floor(n * r) - d), n))
    return n, math.floor(n * r)


def _checar():
    r24 = Fraction(30000, 1001) / 24
    # os 5 pontos medidos no Resolve em 20/09/2026 (fonte 24 qps, timeline 29,97)
    for n, d in ((54, 67), (48, 59), (47, 58), (49, 61), (24, 29)):
        assert math.floor(n * r24) == d, (n, d)
    assert quadros_fonte(59, r24) == (48, 59)
    assert quadros_fonte(60, r24) == (48, 59)  # 60 é inalcançável: fica o vizinho menor
    assert fps_real("119.88") == Fraction(120000, 1001) and fps_real(29.97) == Fraction(30000, 1001)
    assert fps_real(30) == 30 and fps_real(25) == 25 and fps_real("23.976") == Fraction(24000, 1001)
    r120 = Fraction(30000, 1001) / fps_real(119.88)
    assert r120 == Fraction(1, 4) and quadros_fonte(15, r120) == (60, 15)
    print("ok")


if "resolve" not in globals():
    _checar()
else:
    T0 = time.time()
    N = lambda s: unicodedata.normalize("NFC", s)
    ARQ = os.path.join(RAIZ, "04_DAVINCI", "montagem.json")
    M = json.load(open(ARQ))
    IDS = globals().get("IDS") or [pc["id"] for pc in M["pecas"]]
    caminho = lambda a: N(a if os.path.isabs(a) else os.path.join(RAIZ, a))

    pm = resolve.GetProjectManager()
    p = pm.GetCurrentProject()
    # O Resolve é compartilhado: este script NUNCA troca de projeto.
    if not p or p.GetName() != M["projeto"]:
        raise RuntimeError(f"projeto aberto é '{p.GetName() if p else None}', montagem.json pede "
                           f"'{M['projeto']}'. Confira o mcp.log antes de trocar (Resolve compartilhado).")
    if p.IsRenderingInProgress():
        raise RuntimeError("render em andamento: SetProperties/SetSpeed falham calados até a fila acabar.")

    mp = p.GetMediaPool()
    raiz_bin = mp.GetRootFolder()

    def bin_de(rel):
        atual = raiz_bin
        for parte in rel.split("/"):
            if parte in ("", "."):
                continue
            filhos = {f.GetName(): f for f in (atual.GetSubFolderList() or [])}
            atual = filhos.get(parte) or mp.AddSubFolder(atual, parte)
        return atual

    def indexar():
        idx = {}

        def walk(f):
            for c in f.GetClipList() or []:
                fp = c.GetClipProperty("File Path")
                if fp:
                    idx[N(fp)] = c
            for s in f.GetSubFolderList() or []:
                walk(s)
        walk(raiz_bin)
        return idx

    def ajuste(obj, k):
        try:
            v = (obj.GetSettings() or {}).get(k)
        except Exception:
            v = None
        return v if v not in (None, "") else obj.GetSetting(k)

    def props(it, d):
        """SetProperty chave a chave (medido em 20/09); devolve as chaves que falharam."""
        return [k for k, v in d.items() if not it.SetProperty(k, v)]

    pecas = [pc for pc in M["pecas"] if pc["id"] in IDS and "planos" in pc]  # com "segmentos": montar_fala.py
    idx = indexar()

    # Importa o que falta, no bin espelhado da pasta (mesma regra do resolve_projeto.py).
    precisa = set()
    for pc in pecas:
        precisa |= {caminho(pl["arquivo"]) for pl in pc["planos"]}
        for k in ("musica", "logo"):
            if pc.get(k):
                precisa.add(caminho(pc[k]["arquivo"]))
    falta_disco = sorted(a for a in precisa if a not in idx and not os.path.exists(a))
    por_pasta = {}
    for a in sorted(precisa - set(idx) - set(falta_disco)):
        por_pasta.setdefault(os.path.dirname(a), []).append(a)
    for pasta, arqs in por_pasta.items():
        rel = os.path.relpath(pasta, RAIZ) if pasta.startswith(N(RAIZ)) else "Externos"
        mp.SetCurrentFolder(bin_de(rel))
        mp.ImportMedia(arqs)  # caminho como TEXTO: com {"FilePath": …} o 21.1 importa zero, calado
    if por_pasta:
        idx = indexar()

    tls = {}
    for i in range(p.GetTimelineCount()):
        t = p.GetTimelineByIndex(i + 1)
        tls.setdefault(t.GetName(), []).append(t)

    rel_pecas = []
    for pc in pecas:
        r = {"id": pc["id"], "timeline": pc["timeline"], "avisos": [], "erros": []}
        rel_pecas.append(r)
        # Confere tudo ANTES de mexer na timeline antiga: peça que não dá para montar não apaga nada.
        sem = [a for a in [caminho(pl["arquivo"]) for pl in pc["planos"]]
               + ([caminho(pc["musica"]["arquivo"])] if pc.get("musica") else []) if a not in idx]
        if sem:
            r["erros"].append("fora do Media Pool (não existe no disco ou não importou): "
                              + ", ".join(os.path.relpath(a, RAIZ) for a in sem))
            continue

        antigas = tls.get(pc["timeline"], [])
        if antigas and not globals().get("APAGAR"):
            reserva = pc["timeline"] + " · anterior"
            if tls.get(reserva):
                mp.DeleteTimelines(tls.pop(reserva))
            if not antigas[0].SetName(reserva):
                r["erros"].append(f"não consegui renomear a timeline antiga para '{reserva}'. "
                                  "Rode com APAGAR = True para apagar sem cópia.")
                continue
            tls[reserva] = [antigas.pop(0)]
            r["avisos"].append(f"timeline antiga guardada como '{reserva}'")
        if antigas:
            mp.DeleteTimelines(antigas)

        mp.SetCurrentFolder(bin_de("Timelines"))
        tl = mp.CreateEmptyTimeline(pc["timeline"])
        if not tl:
            r["erros"].append("CreateEmptyTimeline falhou (nome repetido?)")
            continue
        tls[pc["timeline"]] = [tl]
        p.SetCurrentTimeline(tl)
        s0 = tl.GetStartFrame()
        fps = fps_real(ajuste(tl, "timelineFrameRate"))
        larg, alt = ajuste(tl, "timelineResolutionWidth"), ajuste(tl, "timelineResolutionHeight")
        r["formato"] = f"{larg}x{alt} @ {float(fps):.3f}"
        if (str(larg), str(alt)) != ("1080", "1920"):
            r["avisos"].append(f"timeline em {larg}x{alt}, não 1080x1920: rode o resolve_projeto.py")
        if tl.GetTrackCount("video") < 2 and not tl.AddTrack("video"):
            r["avisos"].append("não consegui criar a V2: a logo não vai entrar")
        tl.SetTrackName("video", 1, "MONTAGEM")
        tl.SetTrackName("video", 2, "LOGO")

        # --- V1: planos, cada um mirando o corte acumulado ---
        acum, fim, linhas = 0.0, 0, []
        for i, pl in enumerate(pc["planos"]):
            c = idx[caminho(pl["arquivo"])]
            fps_src = fps_real(c.GetClipProperty("FPS"))
            n_arq = int(float(c.GetClipProperty("Frames") or 0))
            ini = int(pl["inicio_q"]) if "inicio_q" in pl else round(pl["inicio_s"] * fps_src)
            v = float(pl.get("velocidade", pc.get("velocidade", 100)))
            acum += pl["dur_s"]
            corte = round(acum * fps)
            alvo = corte - fim
            d100 = max(1, round(alvo * v / 100))
            n, d_real = quadros_fonte(d100, fps / fps_src)
            if n_arq and ini + n > n_arq:
                r["avisos"].append(f"plano {i+1}: pede os quadros {ini}–{ini+n} de um arquivo com {n_arq}")
            its = mp.AppendToTimeline([{"mediaPoolItem": c, "startFrame": ini, "endFrame": ini + n,
                                        "mediaType": 1, "trackIndex": 1}])
            if not its:
                r["erros"].append(f"plano {i+1} não entrou; montagem parada aqui")
                break
            it = its[0]
            st, d_append = it.GetStart(), int(it.GetDuration())
            if v != 100:
                if not it.SetSpeed({"Percentage": v, "RippleTimeline": True}):
                    r["avisos"].append(f"plano {i+1}: SetSpeed devolveu falso")
                v1 = tl.GetItemListInTrack("video", 1) or []
                it = next((x for x in v1 if x.GetStart() == st), v1[-1])
            obtido, fim = int(it.GetDuration()), int(it.GetEnd()) - s0
            z = pl.get("zoom")
            if z:
                ruins = props(it, {"ZoomX": float(z), "ZoomY": float(z)})
                if ruins:
                    r["avisos"].append(f"plano {i+1}: falhou {ruins}")
            cdl = pl["cdl"] if "cdl" in pl else pc.get("cdl")
            if cdl and not it.SetCDL({"NodeIndex": "1", **cdl}):
                r["avisos"].append(f"plano {i+1}: SetCDL falhou")
            linhas.append({"plano": i + 1, "arquivo": os.path.basename(pl["arquivo"]), "fonte_q": [ini, ini + n],
                           "velocidade": v, "append_q": d_append, "previsto_q": round(d_real * 100 / v, 2),
                           "pedido_q": alvo, "obtido_q": obtido, "dif_q": obtido - alvo,
                           "corte_pedido_q": corte, "corte_obtido_q": fim})
        r["planos"] = linhas
        total = fim
        r["total_pedido_q"] = round(sum(pl["dur_s"] for pl in pc["planos"]) * fps)
        r["total_obtido_q"] = total
        r["total_s"] = round(total / float(fps), 3)
        if r["erros"] or not total:
            continue

        # --- A1: trilha a partir do ponto de entrada (quadros contados na taxa da timeline) ---
        mus = pc.get("musica")
        if mus:
            ini_s = mus["fim_s"] - total / fps if "fim_s" in mus else mus.get("inicio_s", 0.0)
            ms = round(ini_s * fps)
            if ms < 0:
                r["avisos"].append(f"trilha começaria em {ms} q: a peça é mais longa que o fim pedido; entrou do 0")
                ms = 0
            a = mp.AppendToTimeline([{"mediaPoolItem": idx[caminho(mus["arquivo"])], "startFrame": ms,
                                      "endFrame": ms + total, "mediaType": 2, "trackIndex": 1, "recordFrame": s0}])
            if not a:
                r["erros"].append("trilha não entrou")
            else:
                tl.SetTrackName("audio", 1, "TRILHA")
                fi = round(mus.get("fade_in_s", 0) * fps)
                fo = round(mus.get("fade_out_s", 0 if "fim_s" in mus else 1.4) * fps)
                fades_ok = a[0].SetFades({"FadeIn": fi, "FadeOut": fo}) if (fi or fo) else True
                r["musica"] = {"inicio_q": ms, "inicio_s": round(ms / float(fps), 3), "dur_q": int(a[0].GetDuration()),
                               "dif_q": int(a[0].GetDuration()) - total, "fade_q": [fi, fo], "fades_ok": bool(fades_ok)}

        # --- V2: logo animada ---
        lg = pc.get("logo")
        if lg:
            arq = caminho(lg["arquivo"])
            c = idx.get(arq)
            if not c:
                r["avisos"].append(f"logo {os.path.relpath(arq, RAIZ)} não está no disco/Media Pool: peça sem logo")
            else:
                n_logo = int(float(c.GetClipProperty("Frames") or 0))
                e = float(lg.get("entrada_s", -3.0))
                ini = max(0, min(total - 1, round((e if e >= 0 else r["total_s"] + e) * fps)))
                n, d = quadros_fonte(total - ini, fps / fps_real(c.GetClipProperty("FPS")))
                if n_logo <= 1:
                    r["avisos"].append("logo é imagem parada (1 quadro): use a logo animada .mov")
                elif n > n_logo:
                    r["avisos"].append(f"logo tem {n_logo} q e a janela pede {n}: termina antes do fim")
                    n = n_logo
                L = mp.AppendToTimeline([{"mediaPoolItem": c, "startFrame": 0, "endFrame": n,
                                          "mediaType": 1, "trackIndex": 2, "recordFrame": s0 + ini}])
                if not L:
                    r["erros"].append("logo não entrou")
                else:
                    ajustes = {"ZoomX": float(lg.get("escala", 1.0)), "ZoomY": float(lg.get("escala", 1.0))}
                    fit = getattr(resolve, "SCALE_FIT", None)  # a logo não pode herdar o scaleToCrop do projeto
                    if fit is not None:
                        ajustes = {"Scaling": fit, **ajustes}
                    ruins = props(L[0], ajustes)
                    if ruins:
                        r["avisos"].append(f"logo: falhou {ruins}")
                    r["logo"] = {"entrada_q": ini, "entrada_s": round(ini / float(fps), 3),
                                 "dur_q": int(L[0].GetDuration()), "fim_q": int(L[0].GetEnd()) - s0}
        r["itens_v1"] = len(tl.GetItemListInTrack("video", 1) or [])

    pm.SaveProject()
    result = {"pecas": rel_pecas, "segundos": round(time.time() - T0, 1),
              "faltam_no_disco": [os.path.relpath(a, RAIZ) for a in falta_disco]}
