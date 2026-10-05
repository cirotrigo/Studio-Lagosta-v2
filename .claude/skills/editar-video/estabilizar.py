# Estabiliza os planos da V1 das peças em fila RETOMÁVEL: rode de novo até "pendentes": 0.
#
# Roda DENTRO do Resolve, pelo MCP (run_script_unsafe):
#   RAIZ = "/Volumes/.../PROJETO"; IDS = ["V2"]          # IDS opcional
#   exec(open("<repo>/.claude/skills/editar-video/estabilizar.py").read())
# Opcional: ORCAMENTO_S (padrão 8): só COMEÇA um plano novo antes disso.
#
# Medido (memória reference_davinci_resolve_mcp): TimelineItem.Stabilize() leva de 0,4 s a ~50 s
# por plano (noturno 4K é o lento) e a chamada do MCP morre em 60 s cravados — o timeout maior é
# ignorado. O que estourou costuma terminar em segundo plano, e a repetição volta instantânea.
# Por isso: o plano é marcado como TENTADO antes da chamada e como feito depois; o que ficou só
# tentado é repetido primeiro na rodada seguinte (até 3 vezes). 8 s + 50 s do pior plano < 60 s.
#
# A chave é o id ÚNICO da timeline + início do item: remontar (montar.py) cria outra timeline,
# e a fila recomeça sozinha para ela. Plano com "estabilizar": false no montagem.json é pulado.
import json, os, time

T0 = time.time()
ORC = float(globals().get("ORCAMENTO_S", 8.0))
MAX_TENT = 3
M = json.load(open(os.path.join(RAIZ, "04_DAVINCI", "montagem.json")))
IDS = globals().get("IDS") or [pc["id"] for pc in M["pecas"]]
ARQ = os.path.join(RAIZ, "04_DAVINCI", "estabilizados.json")
estado = json.load(open(ARQ)) if os.path.exists(ARQ) else {}


def gravar():
    with open(ARQ, "w") as f:
        json.dump(estado, f, indent=1, ensure_ascii=False)


pm = resolve.GetProjectManager()
p = pm.GetCurrentProject()
if not p or p.GetName() != M["projeto"]:
    raise RuntimeError(f"projeto aberto é '{p.GetName() if p else None}', montagem.json pede '{M['projeto']}'")
if p.IsRenderingInProgress():
    raise RuntimeError("render em andamento: espere a fila acabar")

tls = {}
for i in range(p.GetTimelineCount()):
    t = p.GetTimelineByIndex(i + 1)
    tls.setdefault(t.GetName(), t)  # a primeira com o nome; a cópia "· anterior" tem outro nome

fila, avisos, vivas = [], [], set()
for pc in M["pecas"]:
    if pc["id"] not in IDS:
        continue
    tl = tls.get(pc["timeline"])
    if not tl:
        avisos.append(f"{pc['id']}: timeline '{pc['timeline']}' não existe — rode o montar.py")
        continue
    uid = tl.GetUniqueId()
    itens = sorted(tl.GetItemListInTrack("video", 1) or [], key=lambda x: x.GetStart())
    for i, it in enumerate(itens):
        planos = pc.get("planos") or pc.get("segmentos") or []  # peça com fala: 1 segmento = 1 item da V1
        pl = planos[i] if i < len(planos) else {}
        if pl.get("estabilizar", pc.get("estabilizar", True)) is False:
            continue
        k = f"{uid}|{int(it.GetStart())}"
        vivas.add(k)
        e = estado.get(k, {})
        if e.get("ok") or e.get("tent", 0) >= MAX_TENT:
            continue
        fila.append((-e.get("tent", 0), pc["id"], i + 1, k, tl, it))  # tentados primeiro

fila.sort(key=lambda x: x[:3])
feitos_agora = []
atual = p.GetCurrentTimeline()
for _, pid, n, k, tl, it in fila:
    if time.time() - T0 > ORC:
        break
    estado[k] = {"peca": pid, "plano": n, "tent": estado.get(k, {}).get("tent", 0) + 1, "ok": False}
    gravar()  # se o MCP cortar a chamada aqui dentro, a próxima rodada sabe que este foi tentado
    if atual is None or atual.GetUniqueId() != tl.GetUniqueId():
        p.SetCurrentTimeline(tl)
        atual = tl
    t = time.time()
    estado[k]["ok"] = bool(it.Stabilize())
    estado[k]["s"] = round(time.time() - t, 1)
    gravar()
    feitos_agora.append(f"{pid} plano {n}: {'ok' if estado[k]['ok'] else 'FALHOU'} em {estado[k]['s']} s")

pm.SaveProject()
restantes = [x for x in fila if not estado.get(x[3], {}).get("ok") and estado.get(x[3], {}).get("tent", 0) < MAX_TENT]
result = {
    "agora": feitos_agora,
    "pendentes": len(restantes),
    "desistidos": sorted(f"{v['peca']} plano {v['plano']}" for k, v in estado.items()
                         if k in vivas and not v.get("ok") and v.get("tent", 0) >= MAX_TENT),
    "avisos": avisos,
    "segundos": round(time.time() - T0, 1),
}
