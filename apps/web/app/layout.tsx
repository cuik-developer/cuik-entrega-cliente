import type { Metadata } from "next"
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Cuik — Fidelización Digital para Comercios",
  description:
    "Tarjetas de lealtad digitales en Apple y Google Wallet. Sin apps. Sin cartón. Listo en minutos.",
  keywords: ["fidelización", "loyalty", "Apple Wallet", "Google Wallet", "comercios", "LATAM"],
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
  openGraph: {
    title: "Cuik — Fidelización Digital para Comercios",
    description: "Tarjetas de lealtad digitales en Apple y Google Wallet.",
    type: "website",
  },
}

export const viewport = {
  themeColor: "#0e70db",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body
        className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
