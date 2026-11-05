/**
 * Host de teste SEM DOM pelo `react-reconciler` já instalado (o mesmo do react-konva): monta providers e componentes
 * REAIS que não desenham elemento de host (contextos, sondas que devolvem `null`). Elemento de host vira um objeto
 * simples; nada de canvas, layout ou evento. `act` do React 19 drena as atualizações.
 */
import * as React from 'react'
import Reconciler from 'react-reconciler'
import { ConcurrentRoot, DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type No = { type: string; props: unknown; filhos: unknown[] }
const nada = () => undefined
let prioridade: number = NoEventPriority
const tirar = (pai: No, filho: unknown) => {
  const i = pai.filhos.indexOf(filho)
  if (i >= 0) pai.filhos.splice(i, 1)
}

const config = {
  rendererPackageName: 'host-sem-dom',
  rendererVersion: '0.0.0',
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  isPrimaryRenderer: true,
  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  getRootHostContext: () => ({}),
  getChildHostContext: (pai: unknown) => pai,
  getPublicInstance: (i: unknown) => i,
  prepareForCommit: () => null,
  resetAfterCommit: nada,
  shouldSetTextContent: () => false,
  createInstance: (type: string, props: unknown): No => ({ type, props, filhos: [] }),
  createTextInstance: (texto: string) => ({ texto }),
  appendInitialChild: (pai: No, filho: unknown) => void pai.filhos.push(filho),
  appendChild: (pai: No, filho: unknown) => void pai.filhos.push(filho),
  appendChildToContainer: (pai: No, filho: unknown) => void pai.filhos.push(filho),
  insertBefore: (pai: No, filho: unknown, antes: unknown) => void pai.filhos.splice(pai.filhos.indexOf(antes), 0, filho),
  insertInContainerBefore: (pai: No, filho: unknown, antes: unknown) => void pai.filhos.splice(pai.filhos.indexOf(antes), 0, filho),
  removeChild: tirar,
  removeChildFromContainer: tirar,
  finalizeInitialChildren: () => false,
  commitUpdate: (no: No, _t: string, _velhas: unknown, novas: unknown) => {
    no.props = novas
  },
  commitTextUpdate: (no: { texto: string }, _velho: string, novo: string) => {
    no.texto = novo
  },
  resetTextContent: nada,
  clearContainer: (c: No) => {
    c.filhos.length = 0
  },
  hideInstance: nada,
  unhideInstance: nada,
  hideTextInstance: nada,
  unhideTextInstance: nada,
  detachDeletedInstance: nada,
  preparePortalMount: nada,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: nada,
  afterActiveInstanceBlur: nada,
  prepareScopeUpdate: nada,
  getInstanceFromScope: () => null,
  getCurrentUpdatePriority: () => prioridade,
  setCurrentUpdatePriority: (p: number) => {
    prioridade = p
  },
  resolveUpdatePriority: () => (prioridade !== NoEventPriority ? prioridade : DefaultEventPriority),
  maySuspendCommit: () => false,
  maySuspendCommitOnUpdate: () => false,
  maySuspendCommitInSyncRender: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: nada,
  suspendInstance: nada,
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: React.createContext(null),
  resetFormInstance: nada,
  requestPostPaintCallback: nada,
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: nada,
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  bindToConsole: undefined,
}

// os tipos instalados (0.32) não batem com o pacote (0.33): o host é conferido pelos testes, não pelo tipo
const reconciler = (Reconciler as any)(config)

export async function emAct(fn: () => unknown | Promise<unknown>): Promise<void> {
  await React.act(async () => {
    await fn()
  })
}

/** Monta a árvore; `atualizar` troca o elemento raiz (props novas no mesmo provider), `desmontar` limpa. */
export async function montar(elemento: React.ReactElement) {
  const container: No = { type: 'raiz', props: null, filhos: [] }
  const erro = (e: unknown) => {
    throw e
  }
  const raiz = reconciler.createContainer(container, ConcurrentRoot, null, false, null, '', erro, erro, erro, nada, null)
  await emAct(() => reconciler.updateContainer(elemento, raiz, null, null))
  return {
    atualizar: (novo: React.ReactElement) => emAct(() => reconciler.updateContainer(novo, raiz, null, null)),
    desmontar: () => emAct(() => reconciler.updateContainer(null, raiz, null, null)),
  }
}
