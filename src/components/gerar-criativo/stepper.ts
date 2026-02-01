import { defineStepper } from '@stepperize/react'

export const {
  Scoped: StepperProvider,
  useStepper,
  steps,
} = defineStepper(
  { id: 'modelo', label: 'Modelo', description: 'Escolha a pagina modelo' },
  { id: 'imagem', label: 'Imagem', description: 'Escolha ou gere imagens' },
  { id: 'ajustes', label: 'Ajustes', description: 'Edite textos e camadas' },
  { id: 'agendar', label: 'Agendar', description: 'Agende a publicacao' },
)
