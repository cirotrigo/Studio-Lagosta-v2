import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// CP5b § 3.1 — a BARREIRA por import do gate de autonomia (docs/PLANO-2026-10-16-CP5B-CONTRATO.md). A decisão
// autônoma só pode nascer em `decidirEMontarRegistro` (gate-registro.ts), e o registro só pode ser lido/validado
// pelos consumidores nomeados. Declarada em `paths` (alias) E em `patterns` (caminho relativo, inclusive `./gate` de
// dentro de `revisao/`): o ESLint vê a FONTE do import, então `import { x as y }` não escapa. O que o lint não vê
// (import() dinâmico, require, reexportação) é o inventário por regex em
// src/lib/creatives/revisao/__tests__/inventario-gate-da-arte.test.ts. Arquivo novo entra na lista por PR que diga por quê.
const NOMES_DO_GATE = ["gateDaMedida"];
const NOMES_DO_REGISTRO = ["lerGateDaArte", "validadeDoGate", "decidirEMontarRegistro"];
const MSG_GATE = "CP5b: gateDaMedida só pode ser chamada por src/lib/creatives/revisao/gate-registro.ts (decidirEMontarRegistro) e por testes — a decisão autônoma nasce da mesma chamada que grava o registro.";
const MSG_REGISTRO = "CP5b/CP5e: lerGateDaArte/validadeDoGate só podem ser importadas pelos LEITORES do registro (gate-persistido.ts, ver-geracao-retorno.ts, arte-ia.ts, gate-resumo.ts) e decidirEMontarRegistro só pelos PRODUTORES (agendar-itens.ts, arte-rapida.ts, revisar-arte.ts) — exceções por NOME em eslint.config.mjs; arquivo novo entra por PR que diga por quê.";
// `**/gate` cobre `../gate`, `../../gate` e `x/revisao/gate` (gitignore: `..` é um segmento); `./gate` é o mesmo diretório.
// Outro módulo chamado `gate` em outra pasta só é barrado se exportar os mesmos nomes — aceitável.
const PADROES_DO_GATE = ["**/gate", "**/gate.ts", "./gate", "./gate.ts"];
const PADROES_DO_REGISTRO = ["**/gate-registro", "**/gate-registro.ts", "./gate-registro", "./gate-registro.ts"];
// `nomesDoRegistro`: quais dos NOMES_DO_REGISTRO continuam PROIBIDOS no arquivo (CP5e, Codex R2 do contrato: leitor e produtor
// são exceções DIFERENTES — o leitor nunca decide, o produtor nunca lê/valida o registro).
const restricao = (gate, nomesDoRegistro) => ({
  paths: [
    ...(gate ? [{ name: "@/lib/creatives/revisao/gate", importNames: NOMES_DO_GATE, message: MSG_GATE }] : []),
    ...(nomesDoRegistro.length ? [{ name: "@/lib/creatives/revisao/gate-registro", importNames: nomesDoRegistro, message: MSG_REGISTRO }] : []),
  ],
  patterns: [
    ...(gate ? [{ group: PADROES_DO_GATE, importNames: NOMES_DO_GATE, message: MSG_GATE }] : []),
    ...(nomesDoRegistro.length ? [{ group: PADROES_DO_REGISTRO, importNames: nomesDoRegistro, message: MSG_REGISTRO }] : []),
  ],
});
const SO_LEITORES = ["decidirEMontarRegistro"]; // leitor do registro: lê/valida, nunca decide
const SO_PRODUTORES = ["lerGateDaArte", "validadeDoGate"]; // produtor: decide (e grava pela mesma chamada), nunca lê/valida o registro

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...compat.extends("prettier"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: { "no-restricted-imports": ["error", restricao(true, NOMES_DO_REGISTRO)] },
  },
  // Quem decide: pode chamar gateDaMedida (e define o registro).
  { files: ["src/lib/creatives/revisao/gate-registro.ts"], rules: { "no-restricted-imports": "off" } },
  // Os LEITORES nomeados do registro: podem ler/validar, nunca decidir nem chamar gateDaMedida.
  {
    files: ["src/lib/creatives/revisao/gate-persistido.ts", "src/lib/creatives/revisao/gate-resumo.ts", "src/lib/mcp/catalogo/ver-geracao-retorno.ts", "src/lib/mcp/catalogo/arte-ia.ts"],
    rules: { "no-restricted-imports": ["error", restricao(true, SO_LEITORES)] },
  },
  // Os PRODUTORES (CP5c agendar-leva, CP5d ajustar-arte, CP5e revisar-arte como informação): podem decidir, nunca ler/validar o registro nem chamar gateDaMedida.
  {
    files: ["src/lib/lotes/agendar-itens.ts", "src/lib/creatives/arte-rapida.ts", "src/lib/creatives/revisao/revisar-arte.ts"],
    rules: { "no-restricted-imports": ["error", restricao(true, SO_PRODUTORES)] },
  },
];

export default eslintConfig;
