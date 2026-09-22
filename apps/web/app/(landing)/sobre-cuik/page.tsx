import {
  ArrowRight,
  BarChart3,
  Gift,
  Headset,
  MessageCircle,
  Palette,
  Percent,
  Smartphone,
  Stamp,
  Star,
  XCircle,
  Zap,
} from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { FxStyles, Reveal, TiltCard } from "@/components/landing/fx"
import { SiteFooter, WHATSAPP_URL } from "@/components/landing/site-footer"
import { SiteNav } from "@/components/landing/site-nav"
import { Button } from "@/components/ui/button"
import { AboutIntro } from "./_components/about-intro"
import { ProblemFlip } from "./_components/problem-flip"

export const metadata: Metadata = {
  title: "Sobre Cuik — Fidelización digital hecha en Lima",
  description:
    "Cuik nace en Lima para que los negocios locales tengan clientes que vuelven: pases en Apple y Google Wallet, sin apps, sin cartón y con la data en tus manos.",
}

const PROBLEMS = [
  "La tarjeta de cartón se moja, se pierde o se queda en otro pantalón.",
  "Cualquiera puede falsificar un sello de tinta.",
  "Nunca sabes quién volvió, cuántas veces ni cuándo dejó de venir.",
  "Las apps de fidelización nadie las descarga para un café.",
]

const MECHANICS: {
  icon: ReactNode
  title: string
  text: string
  img: string
  tint: string
  wide?: boolean // El Patrón's photo is a tighter crop; scale it so every phone reads the same size
}[] = [
  {
    icon: <Stamp className="w-4 h-4" />,
    title: "Estampillas",
    text: "Compra 8, llévate 1. El clásico, ahora en la Wallet y con push al completar.",
    img: "/landing/mockup-gradual-8.png",
    tint: "from-[#0e70db] to-[#3b8ee8]",
  },
  {
    icon: <Star className="w-4 h-4" />,
    title: "Puntos",
    text: "Cada sol suma. El cliente acumula y canjea del catálogo que tú defines.",
    img: "/landing/mockup-elpatron.png",
    tint: "from-amber-500 to-amber-400",
    wide: true,
  },
  {
    icon: <Percent className="w-4 h-4" />,
    title: "Descuentos",
    text: "Un beneficio fijo o por días y horas, para llenar las horas valle.",
    img: "/landing/mockup-lumi-descuento.png",
    tint: "from-[#ff4810] to-[#ff7a4d]",
  },
  {
    icon: <Gift className="w-4 h-4" />,
    title: "Cupones de regalo",
    text: "Un pase que se compra para otra persona y se canjea una vez.",
    img: "/landing/mockup-aroma-regalo.png",
    tint: "from-emerald-600 to-emerald-500",
  },
]

const BELIEFS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <Smartphone className="w-5 h-5" />,
    title: "Sin apps, sin fricción",
    text: "El pase vive en Apple Wallet y Google Wallet, que ya están en el teléfono. Registrarse toma un escaneo.",
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: "Tu data es tuya",
    text: "Quién volvió, cuándo y qué canjeó es información tuya. Te la mostramos clara, sin hojas de cálculo.",
  },
  {
    icon: <Palette className="w-5 h-5" />,
    title: "Con tu marca, no la nuestra",
    text: "Tu logo, tus colores, tu premio. El cliente ve tu negocio en su Wallet, no un logo ajeno.",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Más rápido que el sello de tinta",
    text: "Si registrar una visita no es más rápido que un sello, no sirve. Diseñamos primero para el cajero.",
  },
]

const STEPS = [
  {
    n: "01",
    title: "Nos cuentas tu negocio",
    text: "Rubro, premio, cuántos locales. Con eso alcanza para arrancar.",
  },
  {
    n: "02",
    title: "Diseñamos tu pase",
    text: "En 24 horas tienes tu pase con tu marca listo en Apple y Google Wallet.",
  },
  {
    n: "03",
    title: "Pruebas 7 días gratis",
    text: "Tus clientes lo usan de verdad. Si funciona, eliges tu plan. Si no, no pagas nada.",
  },
]

export default function SobreCuikPage() {
  return (
    <div className="site-zoom min-h-screen bg-white font-sans antialiased">
      <FxStyles />
      <SiteNav solid />
      <AboutIntro />

      {/* ── El problema (be!'s long two-column block, told with the object) ── */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] gap-14 lg:gap-16 items-center">
          <div>
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
                El problema
              </p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.08] text-balance text-gray-900 max-w-2xl">
                Los clientes que vuelven son los que sostienen un negocio. Y casi nadie sabe quiénes
                son.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-6 space-y-4 text-gray-600 text-lg leading-relaxed max-w-xl">
                <p>
                  La tarjeta de sellos funciona: la gente vuelve por el premio. Lleva décadas
                  funcionando en cafeterías, barberías y veterinarias de todo el mundo. El problema
                  nunca fue la idea. Fue el cartón.
                </p>
                <p>
                  Un negocio local no tiene un equipo de tecnología ni el presupuesto de una cadena,
                  así que se queda con lo que hay: sellos de tinta, descuentos a ciegas y una app
                  que nadie instala. Mientras tanto, no sabe quién volvió ni a quién perdió.
                </p>
              </div>
            </Reveal>
            <ul className="mt-8 space-y-3">
              {PROBLEMS.map((p, i) => (
                <Reveal as="li" key={p} delay={200 + i * 70} y={14}>
                  <span className="flex items-start gap-3 text-gray-700">
                    <XCircle className="w-5 h-5 mt-0.5 text-[#c2380c] shrink-0" />
                    <span>{p}</span>
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>
          <div className="py-8">
            <ProblemFlip />
          </div>
        </div>
      </section>

      {/* ── Lo que creemos + las cuatro reglas, en una sola banda ── */}
      <section className="relative bg-white py-20 sm:py-24 overflow-hidden">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="max-w-4xl mx-auto text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-6">
              Lo que creemos
            </p>
            <blockquote className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-[1.08] text-balance max-w-5xl mx-auto">
              “La solución ya estaba en el bolsillo de cada cliente: su Wallet. Solo faltaba que un
              negocio local pudiera usarla sin un equipo de tecnología. Eso es Cuik.”
            </blockquote>
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BELIEFS.map((b, i) => (
              <Reveal key={b.title} delay={120 + i * 80}>
                <div className="h-full rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
                  <span className="w-9 h-9 rounded-xl bg-blue-50 text-[#0e70db] flex items-center justify-center mb-3">
                    {b.icon}
                  </span>
                  <div className="font-bold tracking-tight text-gray-900">{b.title}</div>
                  <p className="mt-1 text-sm text-gray-500 leading-relaxed">{b.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Lo que hacemos hoy: 4 mechanics as tilting 3D cards ── */}
      <section className="relative py-20 sm:py-28 grain overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="max-w-2xl mb-12">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
              Lo que hacemos hoy
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-[1.08] text-balance">
              Cuatro mecánicas, un solo pase en la Wallet
            </h2>
            <p className="mt-4 text-gray-600 text-lg">
              Elige la que mejor encaja con tu negocio. Todas se instalan en segundos y se
              actualizan solas.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MECHANICS.map((m, i) => (
              <Reveal key={m.title} delay={i * 90}>
                <TiltCard max={10} className="h-full">
                  <div className="relative h-full rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <div className={`relative h-80 bg-gradient-to-br ${m.tint} overflow-hidden`}>
                      {/* Same visual phone size on every card: the El Patrón photo is a tighter crop, so its box is narrower */}
                      <div
                        className={`absolute left-1/2 -translate-x-1/2 ${m.wide ? "w-[81%] -bottom-[63px]" : "w-[115%] -bottom-[60px]"}`}
                      >
                        <Image
                          src={m.img}
                          alt=""
                          width={564}
                          height={1002}
                          className="w-full h-auto drop-shadow-2xl"
                          sizes="360px"
                        />
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
                        <span className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center">
                          {m.icon}
                        </span>
                        {m.title}
                      </div>
                      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{m.text}</p>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200} className="mt-8">
            <Link
              href="/#demo"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0e70db] hover:underline"
            >
              Ver cómo funciona en la home
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Cómo trabajamos contigo + quiénes somos + CTA, en una sola banda ── */}
      <section className="py-20 sm:py-28 bg-[#0c3d7a] text-white overflow-hidden relative">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-10 lg:gap-16 items-start">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-200/70 mb-4">
                Cómo trabajamos contigo
              </p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.08] text-balance">
                Un equipo que atiende personalmente a cada negocio
              </h2>
              <p className="mt-5 text-blue-100 text-lg leading-relaxed">
                Cuik nace en Lima, hecho por gente que conoce a sus clientes. Cada negocio que se
                suma tiene un contacto directo con el equipo: armamos tu pase contigo, revisamos tus
                números juntos y ajustamos la mecánica cuando hace falta. Crecemos porque los
                negocios nos recomiendan, y eso solo pasa si tu programa funciona.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-5 flex items-start gap-4">
                  <span className="w-11 h-11 rounded-xl bg-[#0e70db] text-white flex items-center justify-center shrink-0">
                    <Headset className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block font-bold">Atención directa</span>
                    <span className="block text-sm text-blue-200/80">
                      Te responde quien armó tu pase. Sin call center ni tickets.
                    </span>
                  </span>
                </div>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-2xl bg-white/[0.06] border border-white/10 p-5 flex items-start gap-4 hover:bg-white/[0.1] transition-colors"
                >
                  <span className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block font-bold">Escríbenos directo</span>
                    <span className="block text-sm text-blue-200/80">
                      WhatsApp, lunes a viernes
                    </span>
                  </span>
                </a>
              </div>
            </Reveal>
            <ol className="grid gap-4">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.n} delay={120 + i * 110}>
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-6 backdrop-blur flex gap-5">
                    <div className="text-sm font-mono font-bold text-blue-200 pt-1">{s.n}</div>
                    <div>
                      <div className="text-lg font-bold tracking-tight">{s.title}</div>
                      <p className="mt-1 text-blue-200/80 leading-relaxed">{s.text}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>

          <Reveal delay={200} className="mt-14">
            <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-8 sm:p-10 flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
                  ¿Quieres ver tu negocio en la Wallet de tus clientes?
                </h2>
                <p className="mt-2 text-blue-100">
                  Demo gratis en 24 horas. Sin tarjeta, sin compromiso.
                </p>
              </div>
              <Link href="/login?view=demo">
                <Button
                  size="lg"
                  className="w-full md:w-auto bg-[#ff4810] hover:bg-[#e03f0d] text-white font-bold h-13 rounded-xl px-8 shadow-lg shadow-orange-500/20 group"
                >
                  Solicitar demo gratis
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
