"use client"

import { Check, Copy, Download, ExternalLink, MessageCircle, QrCode, Share2 } from "lucide-react"
import QRCode from "qrcode"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

function QrImage({ src }: { src: string }) {
  // biome-ignore lint/performance/noImgElement: QR is a data URL generated at runtime, next/image does not support data URIs
  return <img src={src} alt="QR de registro" className="h-36 w-36" />
}

interface CompartirPaseProps {
  registroUrl: string
  tenantName: string
}

export function CompartirPase({ registroUrl, tenantName }: CompartirPaseProps) {
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const _canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    QRCode.toDataURL(registroUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then(setQrDataUrl)
      .catch(console.error)
  }, [registroUrl])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(registroUrl)
      setCopied(true)
      toast.success("Link copiado")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("No se pudo copiar")
    }
  }, [registroUrl])

  const handleWhatsApp = useCallback(() => {
    const text = `¡Hola! Registrate en ${tenantName} y acumula beneficios con cada visita. 🎁\n\n${registroUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
  }, [registroUrl, tenantName])

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${tenantName} — Programa de fidelización`,
          text: `Registrate en ${tenantName} y acumula beneficios con cada visita.`,
          url: registroUrl,
        })
      } catch {
        // User cancelled share dialog
      }
    } else {
      handleCopy()
    }
  }, [registroUrl, tenantName, handleCopy])

  const handleDownloadQR = useCallback(() => {
    if (!qrDataUrl) return
    const a = document.createElement("a")
    a.href = qrDataUrl
    a.download = `qr-${tenantName.toLowerCase().replace(/\s+/g, "-")}.png`
    a.click()
  }, [qrDataUrl, tenantName])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Share2 className="h-4 w-4 text-slate-500" />
          Compartir con clientes
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Comparte este link para que tus clientes se registren y reciban su pase digital.
        </p>
      </div>

      {/* Link + copy */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <span className="flex-1 truncate text-xs font-mono text-slate-600">{registroUrl}</span>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopy}>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-white p-6">
        {qrDataUrl ? (
          <QrImage src={qrDataUrl} />
        ) : (
          <div className="flex h-36 w-36 items-center justify-center rounded bg-slate-100">
            <QrCode className="h-8 w-8 text-slate-300" />
          </div>
        )}
        <p className="text-xs text-slate-400">Imprime este QR y colócalo en tu mostrador</p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={handleDownloadQR}
          disabled={!qrDataUrl}
        >
          <Download className="h-3.5 w-3.5" />
          Descargar QR
        </Button>
      </div>

      {/* Share buttons */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleWhatsApp}>
          <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
          WhatsApp
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleShare}>
          <Share2 className="h-3.5 w-3.5 text-blue-600" />
          Compartir
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
          <a href={registroUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            Ver página
          </a>
        </Button>
      </div>
    </div>
  )
}
