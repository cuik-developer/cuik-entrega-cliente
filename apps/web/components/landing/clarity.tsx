"use client"

import { useEffect } from "react"
import { type Consent, hasAnalyticsConsent } from "@/lib/consent"
import { LEGAL } from "@/lib/legal"

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] }
declare global {
  interface Window {
    clarity?: ClarityFn
  }
}

const GRANTED = { ad_Storage: "denied", analytics_Storage: "granted" }
const DENIED = { ad_Storage: "denied", analytics_Storage: "denied" }

/** Microsoft's loader: queue calls until the tag script arrives. */
function load(projectId: string) {
  if (window.clarity) return
  const queue: ClarityFn = (...args: unknown[]) => {
    queue.q = queue.q ?? []
    queue.q.push(args)
  }
  window.clarity = queue
  const script = document.createElement("script")
  script.async = true
  script.src = `https://www.clarity.ms/tag/${projectId}`
  document.head.appendChild(script)
}

/**
 * Microsoft Clarity for the public site. Mounted from SiteFooter, so it never
 * runs on the panel, the cashier or super-admin. Nothing loads until the
 * visitor accepts measurement cookies; rejecting later revokes the consent
 * and Clarity erases its cookies.
 */
export function Clarity() {
  useEffect(() => {
    const projectId = LEGAL.clarityProjectId
    if (!projectId) return
    if (hasAnalyticsConsent()) {
      load(projectId)
      window.clarity?.("consentv2", GRANTED)
    }
    const onConsent = (e: Event) => {
      const value = (e as CustomEvent<Consent>).detail
      if (value === "accepted") {
        load(projectId)
        window.clarity?.("consentv2", GRANTED)
      } else if (window.clarity) {
        window.clarity("consentv2", DENIED)
        window.clarity("consent", false)
      }
    }
    window.addEventListener("cuik:consent", onConsent)
    return () => window.removeEventListener("cuik:consent", onConsent)
  }, [])
  return null
}
