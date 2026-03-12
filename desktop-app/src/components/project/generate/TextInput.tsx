interface TextInputProps {
  value: string
  onChange: (value: string) => void
}

export default function TextInput({ value, onChange }: TextInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text">Texto da Arte</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: Rodízio de massas todo sábado R$49,90. Das 12h às 22h. Reserve já!"
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
      />
      <p className="text-xs text-text-subtle">
        Digite todo o texto da arte. A IA organiza título, descrição e chamada automaticamente.
      </p>
    </div>
  )
}
