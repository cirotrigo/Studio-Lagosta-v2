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
        placeholder="Digite o texto que aparecera na arte"
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
      />
      <p className="text-xs text-text-subtle">
        Sem prompts — apenas o texto final que aparecera na arte
      </p>
    </div>
  )
}
