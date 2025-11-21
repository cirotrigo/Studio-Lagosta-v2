"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CopyInviteLinkButtonProps {
  inviteUrl: string | null
}

export function CopyInviteLinkButton({ inviteUrl }: CopyInviteLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy invite link:", error)
    }
  }

  return (
    <Button
      variant={copied ? "default" : "outline"}
      size="sm"
      onClick={handleCopy}
      disabled={!inviteUrl}
      className="whitespace-nowrap"
    >
      {copied ? (
        <>
          <Check className="mr-2 h-4 w-4" />
          Copiado!
        </>
      ) : (
        <>
          <Copy className="mr-2 h-4 w-4" />
          Copiar Link
        </>
      )}
    </Button>
  )
}
