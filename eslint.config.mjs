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
const MSG_REGISTRO = "CP5b: lerGateDaArte/validadeDoGate/decidirEMontarRegistro só podem ser importadas por gate-persistido.ts, ver-geracao-retorno.ts, arte-ia.ts, o produtor nomeado pelo CP5c e testes.";
// `**/gate` cobre `../gate`, `../../gate` e `x/revisao/gate` (gitignore: `..` é um segmento); `./gate` é o mesmo diretório.
// Outro módulo chamado `gate` em outra pasta só é barrado se exportar os mesmos nomes — aceitável.
const PADROES_DO_GATE = ["**/gate", "**/gate.ts", "./gate", "./gate.ts"];
const PADROES_DO_REGISTRO = ["**/gate-registro", "**/gate-registro.ts", "./gate-registro", "./gate-registro.ts"];
const restricao = (gate, registro) => ({
  paths: [
    ...(gate ? [{ name: "@/lib/creatives/revisao/gate", importNames: NOMES_DO_GATE, message: MSG_GATE }] : []),
    ...(registro ? [{ name: "@/lib/creatives/revisao/gate-registro", importNames: NOMES_DO_REGISTRO, message: MSG_REGISTRO }] : []),
  ],
  patterns: [
    ...(gate ? [{ group: PADROES_DO_GATE, importNames: NOMES_DO_GATE, message: MSG_GATE }] : []),
    ...(registro ? [{ group: PADROES_DO_REGISTRO, importNames: NOMES_DO_REGISTRO, message: MSG_REGISTRO }] : []),
  ],
});

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
    rules: { "no-restricted-imports": ["error", restricao(true, true)] },
  },
  // Quem decide: pode chamar gateDaMedida (e define o registro).
  { files: ["src/lib/creatives/revisao/gate-registro.ts"], rules: { "no-restricted-imports": "off" } },
  // Os consumidores nomeados do registro: podem ler/validar, nunca chamar gateDaMedida.
  {
    files: ["src/lib/creatives/revisao/gate-persistido.ts", "src/lib/mcp/catalogo/ver-geracao-retorno.ts", "src/lib/mcp/catalogo/arte-ia.ts"],
    rules: { "no-restricted-imports": ["error", restricao(true, false)] },
  },
];

export default eslintConfig;
