type PriceDisplayProps = {
  priceLabel: string
  billingSuffix?: string | null
  hasPrice: boolean
  description?: string
}

export function PriceDisplay({ priceLabel, billingSuffix, hasPrice, description }: PriceDisplayProps) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
          {priceLabel}
        </span>
        {hasPrice && billingSuffix && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">/{billingSuffix}</span>
        )}
      </div>
      {description && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      )}
    </div>
  )
}
