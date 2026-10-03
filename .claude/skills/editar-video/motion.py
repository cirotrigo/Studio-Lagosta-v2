# -*- coding: utf-8 -*-
"""Grafismos em motion (HyperFrames) → .mov ProRes 4444 com alfa DIRETO, 1080x1920 a 29,97, para a trilha GRAFISMOS.
Uso:
  python3 motion.py                              → autoconferência (renderiza o motion-modelo.html com fonte do sistema)
  python3 motion.py --peca <RAIZ> <ID> [--quadros 28.2,29.5]
pc.grafismos (peça <ID> de <RAIZ>/04_DAVINCI/montagem.json) = {
  "composicao": "04_DAVINCI/motion/<ID>",                 pasta com o index.html (modelo: motion-modelo.html)
  "arquivo": "06_ELEMENTOS/Motion/<peça>-grafismos.mov",  nunca sobrescrito: sai -v2, -v3… (o JSON de saída diz)
  "alfa": "Straight"                                      opcional, lido pelo sobrepor.py (padrão Straight)
}
Sempre passa antes pelo `hyperframes check`. Com --quadros não há vídeo: só PNGs sobre cinza médio, nos segundos
da TIMELINE pedidos, numa pasta nova de <RAIZ>/07_TEMPORARIOS. Sem --quadros: PNGs do HyperFrames em
07_TEMPORARIOS → ProRes pelo ffmpeg → o nome final só no fim (o resolve_projeto.py nunca vê arquivo pela
metade) → os PNGs vão para a lixeira.
Por que não o `--format mov` do HyperFrames (medido em 03/10/2026, v0.8.114): ele converte RGB→YUV com a matriz
BT.601 e não marca o arquivo; lido como Rec.709 (o padrão do HD), a cor saturada desvia (vermelho puro → ~255,25,0).
Aqui a matriz é BT.709, com a marcação BT.709 completa (igual à logo do Quintal): não depende de como o Resolve
trata arquivo sem marcação, o que não foi conferido nele. O alfa do Chrome é DIRETO
(branco a 50% sai RGB 255, A 128): Alpha mode "Straight" no Resolve — o legenda.py grava premultiplicado.
A versão do HyperFrames é fixa (npm global): HYPERFRAMES_NO_AUTO_INSTALL=1 em toda chamada, senão ele se
atualiza sozinho em segundo plano.
"""
import json, os, re, shutil, subprocess, sys, tempfile, time
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from legenda import saida_livre  # noqa: E402  (-v2, -v3: a mesma regra da legenda)

FPS = '30000/1001'
ENV = {**os.environ, 'HYPERFRAMES_NO_AUTO_INSTALL': '1', 'HYPERFRAMES_SKIP_SKILLS': '1', 'HYPERFRAMES_NO_TELEMETRY': '1'}
LIXEIRA = shutil.which('trash')
USO = 'uso: python3 motion.py [--peca <RAIZ> <ID> [--quadros 28.2,29.5]]'


def hf(*args):
    try:
        r = subprocess.run(['hyperframes', *args], env=ENV, capture_output=True, text=True)
    except FileNotFoundError:
        raise ValueError('HyperFrames não instalado neste Mac: veja "Instalar" no passo 10 do SKILL.md')
    if r.returncode != 0:
        log = re.sub(r'\x1b\[[0-9;]*m', '', (r.stdout or '') + (r.stderr or '')).strip().splitlines()
        raise ValueError(f'hyperframes {args[0]} falhou:\n' + '\n'.join(log[-25:]))


def conferir(pasta):
    """O que o HyperFrames deixa passar e estraga o .mov: canvas que não é 1080x1920 e arquivo local (fonte,
    imagem) fora da pasta da composição — sem ele o render sai com a fonte de reserva, calado."""
    html = os.path.join(pasta, 'index.html')
    if not os.path.isfile(html):
        raise ValueError(f'{html} não existe (modelo: motion-modelo.html da skill)')
    s = open(html, encoding='utf-8').read()
    tag = re.search(r'<div[^>]*data-composition-id[^>]*>', s)
    if not tag or not all(re.search(rf'data-{k}=["\']{v}["\']', tag.group(0)) for k, v in (('width', 1080), ('height', 1920))):
        raise ValueError('a raiz da composição tem de ser data-width="1080" data-height="1920"')
    fora = sorted({u for u in re.findall(r'''(?:src=["']|url\(\s*["']?)([^"')\s]+)''', s)
                   if not re.match(r'(https?:|data:|#)', u)
                   and (u.startswith('/') or '..' in u.split('/') or not os.path.isfile(os.path.join(pasta, u)))})
    if fora:
        raise ValueError(f'arquivo local fora da pasta da composição: {fora} (copie de 06_ELEMENTOS para {pasta})')


def quadros(pasta, ts, destino):
    hf('snapshot', pasta, '--at', ','.join(f'{t:g}' for t in ts), '--no-end', '--describe', 'false', '-o', destino)
    feitos = []
    for f in sorted(os.listdir(destino)):
        m = re.match(r'frame-\d+-at-([\d.]+)s\.png$', f)
        if m:
            im = Image.open(os.path.join(destino, f)).convert('RGBA')
            feitos.append(os.path.join(destino, f'cinza-{m.group(1)}s.png'))
            Image.alpha_composite(Image.new('RGBA', im.size, (128, 128, 128, 255)), im).convert('RGB').save(feitos[-1])
    if len(feitos) != len(ts):
        raise ValueError(f'o snapshot devolveu {len(feitos)} de {len(ts)} quadros em {destino}')
    return feitos


def alfa_min(png):
    """Composição opaca sai do HyperFrames em PNG RGB, sem canal de alfa (medido em 03/10/2026, fundo no #root;
    o de html e body ele mesmo limpa)."""
    im = Image.open(png)
    return im.getchannel('A').getextrema()[0] if 'A' in im.getbands() else 255


def conferir_mov(mov, n):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames,'
                        'color_space,color_primaries,color_transfer', '-of', 'json', mov], capture_output=True, text=True)
    s = (json.loads(r.stdout or '{}').get('streams') or [{}])[0]
    esperado = {'codec_name': 'prores', 'profile': '4444', 'width': 1080, 'height': 1920, 'r_frame_rate': FPS,
                'nb_frames': str(n), 'color_space': 'bt709', 'color_primaries': 'bt709', 'color_transfer': 'bt709'}
    ruins = {k: s.get(k) for k, v in esperado.items() if s.get(k) != v}
    if ruins or not str(s.get('pix_fmt', '')).startswith('yuva'):
        raise ValueError(f'o .mov não saiu como esperado: {ruins or s.get("pix_fmt")}')


def renderizar(pasta, pedido, tmp):
    """(caminho final, quadros, segundos de render, avisos)."""
    t0, avisos = time.time(), []
    trab = tempfile.mkdtemp(prefix='motion-', dir=tmp)
    pngs = os.path.join(trab, 'png')
    hf('render', pasta, '--format', 'png-sequence', '--fps', FPS, '-o', pngs, '--quiet')
    fr = sorted(f for f in os.listdir(pngs) if re.match(r'frame_\d{6}\.png$', f))
    n = len(fr)
    if not n or fr[-1] != f'frame_{n:06d}.png':
        raise ValueError(f'sequência de PNG incompleta em {pngs}')
    if all(alfa_min(os.path.join(pngs, fr[i])) == 255 for i in {0, n // 2, n - 1}):
        raise ValueError(f'fundo pintado: nenhum quadro tem transparência (fundo no #root ou bloco de tela cheia opaco '
                         f'o tempo todo); PNGs em {pngs}')
    mov = os.path.join(trab, 'saida.mov')
    ff = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', FPS, '-start_number', '1',
                         '-i', os.path.join(pngs, 'frame_%06d.png'),
                         '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le',
                         '-c:v', 'prores_ks', '-profile:v', '4444', '-vendor', 'apl0',
                         '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                         '-bsf:v', 'prores_metadata=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
                         '-f', 'mov', mov], capture_output=True, text=True)
    if ff.returncode != 0:
        raise ValueError(f'o ffmpeg falhou: {ff.stderr.strip()[-500:]}')
    conferir_mov(mov, n)
    saida = saida_livre(pedido)
    os.makedirs(os.path.dirname(saida), exist_ok=True)
    os.rename(mov, saida)  # mesmo HD: o arquivo aparece inteiro
    if not (LIXEIRA and subprocess.run([LIXEIRA, trab], capture_output=True).returncode == 0):
        avisos.append(f'os PNGs ficaram em {trab}: mande para a lixeira')
    return saida, n, time.time() - t0, avisos


def peca(raiz, pid, ts=None):
    m = json.load(open(os.path.join(raiz, '04_DAVINCI', 'montagem.json'), encoding='utf-8'))
    pc = next((p for p in m['pecas'] if p['id'] == pid), None)
    if not pc or 'grafismos' not in pc:
        raise ValueError(f'a peça {pid} não tem "grafismos" no montagem.json (formato no montagem.md)')
    g = pc['grafismos']
    pasta = os.path.join(raiz, g['composicao'])
    conferir(pasta)
    hf('check', pasta)
    tmp = os.path.join(raiz, '07_TEMPORARIOS')
    os.makedirs(tmp, exist_ok=True)
    if ts:
        return {'quadros': quadros(pasta, ts, tempfile.mkdtemp(prefix=f'motion-{pid}-quadros-', dir=tmp))}
    pedido = os.path.join(raiz, g['arquivo'])
    saida, n, seg, avisos = renderizar(pasta, pedido, tmp)
    r = {'arquivo': os.path.relpath(saida, raiz), 'quadros': n, 'segundos': round(n * 1001 / 30000, 3),
         'alfa': g.get('alfa', 'Straight'), 'render_s': round(seg, 1)}
    if saida != pedido:
        avisos.append(f'{g["arquivo"]} já existia: saiu {r["arquivo"]}. Na timeline, troque com o trocar_midia.py '
                      f'e atualize pc.grafismos.arquivo')
    return {**r, 'avisos': avisos} if avisos else r


def _checar():
    global LIXEIRA
    import numpy as np
    LIXEIRA = None  # a autoconferência não manda nada para a lixeira do Ciro
    fonte = next((f for f in ('/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf',
                              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') if os.path.isfile(f)), None)
    assert fonte, 'nenhuma fonte do sistema para a autoconferência'
    modelo = open(os.path.join(AQUI, 'motion-modelo.html'), encoding='utf-8').read()
    for trecho in ('--texto: #ffffff', '#root { position: relative;', 'data-width="1080" data-height="1920"', 'data-duration="4"'):
        assert trecho in modelo, f'o modelo mudou: a autoconferência procura {trecho!r}'

    def yuva(mov, n):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mov, '-vf', f'select=eq(n\\,{n})', '-frames:v', '1',
                              '-f', 'rawvideo', '-pix_fmt', 'yuva444p12le', '-'], capture_output=True, check=True).stdout
        return np.frombuffer(raw, dtype='<u2').reshape(4, 1920, 1080)

    with tempfile.TemporaryDirectory() as raiz:
        comp = os.path.join(raiz, '04_DAVINCI', 'motion', 'T')
        os.makedirs(os.path.join(comp, 'fontes'))
        for nome in ('titulo.ttf', 'apoio.ttf'):
            shutil.copy(fonte, os.path.join(comp, 'fontes', nome))
        html = os.path.join(comp, 'index.html')
        escrever = lambda txt: open(html, 'w', encoding='utf-8').write(txt)
        escrever(modelo.replace('--texto: #ffffff', '--texto: #ff0000'))  # vermelho puro mede a matriz
        g = {'composicao': '04_DAVINCI/motion/T', 'arquivo': '06_ELEMENTOS/Motion/T-grafismos.mov'}
        with open(os.path.join(raiz, '04_DAVINCI', 'montagem.json'), 'w') as f:
            json.dump({'projeto': 'P', 'pecas': [{'id': 'T', 'grafismos': g}]}, f)

        def recusa(trecho):
            try:
                peca(raiz, 'T')
            except ValueError as e:
                assert trecho in str(e), e
            else:
                raise AssertionError(f'devia recusar ({trecho})')

        r = peca(raiz, 'T')
        assert r['arquivo'] == g['arquivo'] and abs(r['quadros'] - 4 * 30000 / 1001) < 1 and r['alfa'] == 'Straight', r
        mov = os.path.join(raiz, r['arquivo'])
        p0, p1 = yuva(mov, 0), yuva(mov, 105)  # 0 s: antes de ENTRA; 3,5 s: cartão inteiro
        assert p0[3].max() == 0, 'o quadro 0 devia ser transparente'
        vermelho = (p1[3] == 4095) & (p1[2] > 3500)  # opaco e Cr alto: o miolo do título
        assert vermelho.sum() > 1000, vermelho.sum()
        y8 = p1[0][vermelho].mean() / 16
        assert abs(y8 - 62.6) < 3, f'vermelho com Y {y8:.1f}: a BT.709 dá 62,6 (a BT.601, 81,5)'
        assert peca(raiz, 'T')['arquivo'] == '06_ELEMENTOS/Motion/T-grafismos-v2.mov'  # não sobrescreve
        q = peca(raiz, 'T', [0.5, 3.5])['quadros']
        assert len(q) == 2 and Image.open(q[0]).getpixel((5, 5)) == (128, 128, 128), q
        assert Image.open(q[1]).getpixel((540, 960)) != (128, 128, 128), 'o cartão devia aparecer aos 3,5 s'
        os.remove(os.path.join(comp, 'fontes', 'apoio.ttf'))
        recusa('fontes/apoio.ttf')
        shutil.copy(fonte, os.path.join(comp, 'fontes', 'apoio.ttf'))
        escrever(modelo.replace('#root { position: relative;', '#root { background: #000; position: relative;'))
        recusa('fundo pintado')
        escrever(modelo.replace('data-width="1080" data-height="1920"', 'data-width="1920" data-height="1080"'))
        recusa('data-width="1080"')
    print('ok')


if __name__ == '__main__':
    if len(sys.argv) == 1:
        _checar(); sys.exit(0)
    if '--peca' not in sys.argv:
        sys.exit(USO)
    i = sys.argv.index('--peca')
    try:
        raiz, pid = sys.argv[i + 1], sys.argv[i + 2]
        ts = [float(x) for x in sys.argv[sys.argv.index('--quadros') + 1].split(',')] if '--quadros' in sys.argv else None
    except (IndexError, ValueError):
        sys.exit(USO)
    try:
        print(json.dumps(peca(raiz, pid, ts), ensure_ascii=False, indent=1))
    except (ValueError, OSError) as e:  # OSError: montagem ou composição fora do disco
        sys.exit(f'motion.py: {e}')
