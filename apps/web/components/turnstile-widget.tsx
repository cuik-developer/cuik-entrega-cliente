"use client"

import { type Ref, useEffect, useImperativeHandle, useRef } from "react"
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile"

/**
 * Cloudflare Turnstile, rendered explicitly. With appearance
 * "interaction-only" most people never see it: it only shows a box when
 * Cloudflare wants a click. The token arrives through `onToken`; it is
 * single-use, so call `ref.current.reset()` after every submit (success or
 * not) to get a fresh one. Expired or failed challenges report `null`.
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type RenderOptions = {
  sitekey: string
  appearance?: "always" | "execute" | "interaction-only"
  language?: string
  callback?: (token: string) => void
  "expired-callback"?: () => void
  "error-callback"?: () => void
  "timeout-callback"?: () => void
}

type TurnstileApi = {
  render: (el: HTMLElement, options: RenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

/** Injects the Turnstile script once per page; later calls share the promise. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => {
        if (window.turnstile) resolve(window.turnstile)
        else reject(new Error("Turnstile script loaded without the API"))
      }
      script.onerror = () => {
        // Let a later mount try again (flaky network, blocker turned off…).
        scriptPromise = null
        script.remove()
        reject(new Error("Could not load the Turnstile script"))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

export type TurnstileHandle = {
  /** Discards the current token (reports null) and asks for a new one. */
  reset: () => void
}

export function TurnstileWidget({
  onToken,
  ref,
  className,
}: {
  onToken: (token: string | null) => void
  ref?: Ref<TurnstileHandle>
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)

  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        onTokenRef.current(null)
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
      },
    }),
    [],
  )

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current || widgetId.current) return
        widgetId.current = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          language: "es",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
          "timeout-callback": () => onTokenRef.current(null),
        })
      })
      .catch((err) => console.warn("[turnstile]", err))
    return () => {
      cancelled = true
      if (widgetId.current) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  return <div ref={container} className={className} />
}
