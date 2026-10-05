# Render das peças para <RAIZ>/08_EXPORTACOES/01_PREVIAS (MP4 H.264 + AAC, tamanho e fps da timeline).
#
# Roda DENTRO do Resolve, pelo MCP (run_script_unsafe):
#   RAIZ = "/Volumes/.../PROJETO"; IDS = ["V2"]          # IDS opcional
#   exec(open("<repo>/.claude/skills/editar-video/render.py").read())
# Opcionais: SUF = " v02" (sufixo do arquivo); MODO = "status" (só lê a fila destas peças).
#
# Medido (memória reference_davinci_resolve_mcp): render de Reel ~40 s, story 4K pesado até 3 min —
# passa do teto de 60 s do MCP, por isso o script só ENFILEIRA e dispara; acompanhe com MODO="status".
# Durante o render o projeto trava SetProperties (montar/estabilizar se recusam a rodar).
# Mesmo nome de arquivo SOBRESCREVE: use SUF para guardar uma versão anterior.
# O Resolve é compartilhado: só os jobs DESTAS timelines são apagados e disparados, e nada começa
# se já houver render em andamento (pode ser de outra sessão).
import json, os

M = json.load(open(os.path.join(RAIZ, "04_DAVINCI", "montagem.json")))
IDS = globals().get("IDS") or [pc["id"] for pc in M["pecas"]]
SUF = globals().get("SUF", "")
DEST = os.path.join(RAIZ, "08_EXPORTACOES", "01_PREVIAS")
pecas = [pc for pc in M["pecas"] if pc["id"] in IDS]
nomes = {pc["timeline"] for pc in pecas}

pm = resolve.GetProjectManager()
p = pm.GetCurrentProject()
if not p or p.GetName() != M["projeto"]:
    raise RuntimeError(f"projeto aberto é '{p.GetName() if p else None}', montagem.json pede '{M['projeto']}'")


def jobs_destas():
    return [j for j in (p.GetRenderJobList() or []) if j.get("TimelineName") in nomes]


if globals().get("MODO") == "status":
    result = {"rendering": p.IsRenderingInProgress(), "jobs": [
        {"timeline": j["TimelineName"], "arquivo": j.get("OutputFilename"), **p.GetRenderJobStatus(j["JobId"])}
        for j in jobs_destas()]}
else:
    if p.IsRenderingInProgress():
        raise RuntimeError("já há render em andamento (talvez de outra sessão): espere e rode de novo")
    for j in jobs_destas():
        p.DeleteRenderJob(j["JobId"])
    os.makedirs(DEST, exist_ok=True)
    tls = {p.GetTimelineByIndex(i + 1).GetName(): p.GetTimelineByIndex(i + 1) for i in range(p.GetTimelineCount())}
    jobs, avisos = [], []
    for pc in pecas:
        tl = tls.get(pc["timeline"])
        if not tl:
            avisos.append(f"{pc['id']}: timeline '{pc['timeline']}' não existe")
            continue
        p.SetCurrentTimeline(tl)
        cfg = tl.GetSettings() or {}
        # Parte de um preset limpo: um render só de áudio anterior deixa o "Export Video" desligado no
        # projeto, e o ExportVideo=True abaixo não religa (21.1, medido 24/09: o job diz vídeo e sai só áudio).
        p.LoadRenderPreset("H.264 Master")
        p.SetCurrentRenderFormatAndCodec("mp4", "H264")
        ok = p.SetRenderSettings({
            "SelectAllFrames": True, "TargetDir": DEST, "CustomName": pc.get("saida", pc["timeline"]) + SUF,
            "FormatWidth": int(cfg.get("timelineResolutionWidth") or 1080),
            "FormatHeight": int(cfg.get("timelineResolutionHeight") or 1920),
            "FrameRate": float(cfg.get("timelineFrameRate") or 29.97),
            "ExportVideo": True, "ExportAudio": True, "VideoQuality": 16000,
            "AudioCodec": "aac", "AudioBitDepth": 16})
        if not ok:
            avisos.append(f"{pc['id']}: SetRenderSettings devolveu falso (confira o arquivo gerado)")
        jid = p.AddRenderJob()
        if jid:
            jobs.append(jid)
        else:
            avisos.append(f"{pc['id']}: AddRenderJob falhou")
    result = {"jobs": jobs, "disparado": bool(jobs) and p.StartRendering(jobs), "destino": DEST,
              "avisos": avisos, "acompanhe": 'rode de novo com MODO = "status"'}
