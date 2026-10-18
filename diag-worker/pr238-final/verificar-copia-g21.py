"""Prova MECÂNICA de que a cópia sintética do G21 é o original menos a parte que lê a fixture real.
gate-synthetic.test.ts = gate.test.ts sem a seção "G24" (de `// ─── G24` até o cabeçalho de seção seguinte), com os
imports relativos trocados por `@/lib/creatives/revisao/...` e o corpus trocado por `./synthetic-corpus`.
synthetic-corpus.ts = corpus-do-gate.ts até antes de `// ─── A fixture do piloto (G24)` (o resto lê o peca.json no
import), sem os imports de fs/path e com os imports relativos trocados. A 1ª linha de cada cópia é um cabeçalho.
Uso: python3 diag-worker/pr238-final/verificar-copia-g21.py (da raiz). Sai 1 com o diff se não corresponder."""
import difflib, sys
R = 'src/lib/creatives/revisao/__tests__/'
def ler(p): return open(p, encoding='utf8').read().split('\n')
def sem_secao(linhas, marca):
    i = next(n for n, l in enumerate(linhas) if l.startswith('// ─── ' + marca))
    j = next(n for n in range(i + 1, len(linhas)) if linhas[n].startswith('// ─── '))
    return linhas[:i] + linhas[j:]
g = '\n'.join(sem_secao(ler(R + 'gate.test.ts'), 'G24'))
for de, para in [("'../contrato'", "'@/lib/creatives/revisao/contrato'"), ("'../regras'", "'@/lib/creatives/revisao/regras'"), ("'../versao'", "'@/lib/creatives/revisao/versao'"), ("'../gate'", "'@/lib/creatives/revisao/gate'"), ("'./suporte/corpus-do-gate'", "'./synthetic-corpus'")]:
    g = g.replace(de, para)
c = ler(R + 'suporte/corpus-do-gate.ts')
c = c[: next(n for n, l in enumerate(c) if l.startswith('// ─── A fixture do piloto (G24)'))]
c = '\n'.join(l for l in c if l not in ("import { readFileSync } from 'node:fs'", "import { join } from 'node:path'"))
for x in ['regras', 'versao', 'gate', 'impressao-digital']:
    c = c.replace(f"'../../{x}'", f"'@/lib/creatives/revisao/{x}'")
falhou = False
for esperado, copia in [(g, 'diag-worker/review238/gate-synthetic.test.ts'), (c, 'diag-worker/review238/synthetic-corpus.ts')]:
    real = '\n'.join(ler(copia)[1:])
    if esperado.rstrip('\n') != real.rstrip('\n'):
        falhou = True
        sys.stdout.writelines(difflib.unified_diff(esperado.split('\n'), real.split('\n'), 'transformado', copia, lineterm='\n', n=1))
    else:
        print(f'OK {copia} = original transformado')
sys.exit(1 if falhou else 0)
