import { ArrowRight, Instagram, Mail, MessageCircle, Sparkles } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { FxStyles, Reveal, TiltCard } from "@/components/landing/fx"
import {
  CONTACT_EMAIL,
  INSTAGRAM_URL,
  SiteFooter,
  WHATSAPP_URL,
} from "@/components/landing/site-footer"
import { SiteNav } from "@/components/landing/site-nav"
import { ContactForm } from "./_components/contact-form"
import { SignupScene } from "./_components/signup-scene"

export const metadata: Metadata = {
  title: "Contáctanos — Cuik",
  description:
    "Escríbenos por WhatsApp, correo o desde el formulario. Te responde una persona del equipo en menos de un día hábil.",
}

const CHANNELS = [
  {
    label: "WhatsApp",
    value: "+51 972 213 023",
    note: "Lo más rápido. Lunes a viernes, 9:00 a 18:00 (Lima).",
    href: WHATSAPP_URL,
    icon: <MessageCircle className="w-7 h-7" />,
    tint: "bg-emerald-500 shadow-emerald-500/30",
  },
  {
    label: "Correo",
    value: CONTACT_EMAIL,
    note: "Para propuestas, prensa o cualquier cosa con adjuntos.",
    href: `mailto:${CONTACT_EMAIL}`,
    icon: <Mail className="w-7 h-7" />,
    tint: "bg-[#0e70db] shadow-blue-500/30",
  },
  {
    label: "Instagram",
    value: "@cuik.ia",
    note: "Novedades, pases reales y los negocios que ya usan Cuik.",
    href: INSTAGRAM_URL,
    icon: <Instagram className="w-7 h-7" />,
    tint: "bg-gradient-to-br from-pink-500 to-orange-400 shadow-pink-500/30",
  },
]

const FAQ = [
  {
    q: "¿Cuánto tarda en estar lista mi demo?",
    a: "24 horas. Pides la demo, configuramos tu pase con tu marca y te enviamos el acceso.",
  },
  {
    q: "¿Mis clientes tienen que descargar una app?",
    a: "No. El pase se guarda en Apple Wallet o Google Wallet, que ya vienen en el teléfono.",
  },
  {
    q: "¿Tiene costo probarlo?",
    a: "No. Todos los planes incluyen 7 días de prueba gratis, sin tarjeta de crédito.",
  },
]

export default function ContactoPage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      <FxStyles />
      <SiteNav solid />

      {/* ── "Hola, soy:" band (be!'s tinted full-bleed opener) ── */}
      <section className="relative overflow-hidden bg-[#eaf2fd]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(700px 500px at 85% 20%, rgba(14,112,219,0.18), transparent 60%), radial-gradient(500px 400px at 0% 100%, rgba(255,72,16,0.10), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-12 lg:gap-16 items-start">
          <div>
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e70db] mb-4">
                Contáctanos
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-[-0.02em] leading-[1.04] text-balance">
                Hablemos de tus clientes
              </h1>
              <p className="mt-5 text-lg text-gray-600 max-w-xl leading-relaxed">
                Cuéntanos qué necesita tu negocio. Te responde una persona del equipo en menos de un
                día hábil. Si prefieres hablar ahora, estamos en WhatsApp.
              </p>
            </Reveal>
            <Reveal delay={140} className="mt-10">
              <div className="relative rounded-[2rem] border border-white/70 bg-white/80 backdrop-blur-xl p-6 sm:p-8 shadow-[0_40px_80px_-40px_rgba(14,112,219,0.45)]">
                <ContactForm />
              </div>
            </Reveal>
          </div>

          {/* Live pass: what a reply feels like */}
          <div className="hidden lg:block lg:sticky lg:top-28">
            <Reveal delay={260}>
              <TiltCard max={10} glare={false} className="w-[340px] mx-auto">
                <div className="relative">
                  <div className="absolute -inset-12 rounded-full bg-[#0e70db]/[0.12] blur-3xl pointer-events-none" />
                  <SignupScene />
                </div>
              </TiltCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Canales (be!'s three big icons) ── */}
      <section className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="text-center max-w-xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-[-0.02em] leading-[1.08]">
              Elige cómo hablar con nosotros
            </h2>
            <p className="mt-3 text-gray-500">
              Quien te responde es quien va a configurar tu pase. Sin call center ni tickets.
            </p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {CHANNELS.map((c, i) => (
              <Reveal key={c.label} delay={i * 110}>
                <TiltCard max={8} className="h-full">
                  <a
                    href={c.href}
                    target={c.href.startsWith("http") ? "_blank" : undefined}
                    rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="group block h-full rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-[0_30px_60px_-30px_rgba(15,23,42,0.3)] hover:border-gray-200 transition-colors"
                  >
                    <span
                      className={`mx-auto w-16 h-16 rounded-2xl text-white flex items-center justify-center shadow-lg ${c.tint} group-hover:scale-105 transition-transform duration-300`}
                    >
                      {c.icon}
                    </span>
                    <div className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                      {c.label}
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-gray-900 tracking-tight break-all">
                      {c.value}
                    </div>
                    <p className="mt-2 text-sm text-gray-500 leading-relaxed">{c.note}</p>
                  </a>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Atajo a la demo + FAQ ── */}
      <section className="bg-gray-50 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal>
            <Link
              href="/login?view=demo"
              className="group flex flex-col sm:flex-row sm:items-center gap-5 rounded-[2rem] bg-[#0b1220] text-white p-7 sm:p-9 shadow-[0_40px_80px_-40px_rgba(11,18,32,0.7)] hover:-translate-y-0.5 transition-transform duration-300"
            >
              <span className="w-14 h-14 rounded-2xl bg-[#0e70db] flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
                <Sparkles className="w-6 h-6" />
              </span>
              <div className="flex-1">
                <div className="text-xl font-extrabold tracking-tight">¿Solo quieres probarlo?</div>
                <div className="text-blue-100/80 mt-1">
                  Pide tu demo directo y la activamos en 24 horas. Gratis por 7 días, sin tarjeta.
                </div>
              </div>
              <span className="inline-flex items-center gap-2 font-semibold text-blue-200">
                Solicitar demo
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          </Reveal>

          <Reveal className="mt-16 mb-8" delay={80}>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-[-0.02em]">
              Lo que más nos preguntan
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-4">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={120 + i * 90}>
                <div className="h-full rounded-3xl bg-white border border-gray-100 p-6">
                  <div className="font-bold text-gray-900 mb-2">{f.q}</div>
                  <p className="text-sm text-gray-600 leading-relaxed">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
