"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"

const CONSENT_COOKIE = "cookie_consent"

function hasConsent() {
  if (typeof document === "undefined") return false
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${CONSENT_COOKIE}=1`))
}

function setConsentCookie() {
  if (typeof document === "undefined") return
  const oneYear = 60 * 60 * 24 * 365
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=1; Max-Age=${oneYear}; Path=/; SameSite=Lax${secure}`
}

export function CookieConsent() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    setVisible(!hasConsent())
  }, [])

  const onAccept = React.useCallback(() => {
    setConsentCookie()
    setVisible(false)
    // dispatch an event so listeners (e.g., analytics) can react
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cookie-consent-accepted'))
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-[900px] rounded-t-xl border bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Nós usamos cookies para melhorar sua experiência, analisar o uso e entregar conteúdo relevante. Ao clicar em Aceitar, você concorda com nosso uso de cookies.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onAccept}>
              Aceitar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

