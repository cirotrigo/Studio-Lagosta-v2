import { defineStepper } from '@stepperize/react'

export const {
  Scoped: StepperProvider,
  useStepper,
  steps,
} = defineStepper(
  { id: 'projeto', label: 'Projeto', description: 'Selecione o projeto' },
  { id: 'template', label: 'Template', description: 'Escolha o template' },
  { id: 'pagina', label: 'Pagina', description: 'Selecione a pagina modelo' },
  { id: 'imagem', label: 'Imagem', description: 'Escolha ou gere imagens' },
  { id: 'ajustes', label: 'Ajustes', description: 'Edite textos e camadas' },
  { id: 'agendar', label: 'Agendar', description: 'Agende a publicacao' },
)
