import {
  ArrowRight,
  BarChart3,
  Gift,
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
import { AboutHero } from "./_components/about-hero"
import { ProblemFlip } from "./_components/problem-flip"

export const metadata: Metadata = {
  title: "Sobre Cuik — Fidelización digital hecha en Lima",
  description:
    "Cuik nace en Lima para que el comercio de barrio tenga clientes que vuelven: pases en Apple y Google Wallet, sin apps, sin cartón y con la data en tus manos.",
}

const PROBLEMS = [
  "La tarjeta de cartón se moja, se pierde o se queda en otro pantalón.",
  "Cualquiera puede falsificar un sello de tinta.",
  "Nunca sabes quién volvió, cuántas veces ni cuándo dejó de venir.",
  "Las apps de fidelización nadie las descarga para un café.",
  "Los descuentos se regalan a ciegas, sin saber si funcionaron.",
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
    title: "La data es del comercio",
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
    <div className="min-h-screen bg-white font-sans antialiased">
      <FxStyles />
      <SiteNav solid />
      <AboutHero />

      {/* ── El problema (be!'s long two-column block, told with the object) ── */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-14 lg:gap-20 items-center">
          <div>
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e70db] mb-4">
                El problema
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-[-0.02em] leading-[1.06] text-balance">
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
                  Un comercio pequeño no tiene un equipo de tecnología ni el presupuesto de una
                  cadena, así que se queda con lo que hay: sellos de tinta, descuentos a ciegas y
                  una app que nadie instala. Mientras tanto, no sabe quién volvió ni a quién perdió.
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

      {/* ── Manifiesto (be!'s brand-colour quote band), honest version ── */}
      <section className="relative bg-[#0e70db] text-white py-20 sm:py-24 overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(800px 400px at 80% 0%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(600px 400px at 10% 100%, rgba(255,72,16,0.5), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100 mb-6">
              Lo que creemos
            </p>
            <blockquote className="text-2xl sm:text-3xl lg:text-[2.6rem] font-extrabold tracking-[-0.02em] leading-[1.15] text-balance">
              “La solución ya estaba en el bolsillo de cada cliente: su Wallet. Solo faltaba que un
              negocio de barrio pudiera usarla sin un equipo de tecnología. Eso es Cuik.”
            </blockquote>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-8 text-blue-100/90 text-lg max-w-2xl mx-auto leading-relaxed">
              Construimos Cuik junto a los comercios que lo usan: cada semana hablamos con dueños y
              cajeros, y lo que nos cuentan se convierte en producto. Por eso, cuando nos escribes,
              te responde alguien que conoce tu pase, tu premio y tu negocio.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Lo que hacemos hoy: 4 mechanics as tilting 3D cards ── */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="max-w-2xl mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e70db] mb-4">
              Lo que hacemos hoy
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-[-0.02em] leading-[1.08] text-balance">
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
                  <div className="relative h-full rounded-3xl bg-white border border-gray-100 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.35)] overflow-hidden">
                    <div className={`relative h-52 bg-gradient-to-br ${m.tint} overflow-hidden`}>
                      <div
                        className={`absolute inset-x-0 mx-auto ${m.wide ? "w-[43%] -bottom-28" : "w-[60%] -bottom-16"}`}
                      >
                        <Image
                          src={m.img}
                          alt=""
                          width={564}
                          height={1002}
                          className="w-full h-auto drop-shadow-2xl"
                          sizes="220px"
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

      {/* ── Principios ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="max-w-2xl mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e70db] mb-4">
              Cómo lo construimos
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-[-0.02em] leading-[1.08] text-balance">
              Cuatro reglas que no negociamos
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-5">
            {BELIEFS.map((b, i) => (
              <Reveal key={b.title} delay={i * 80}>
                <div className="h-full rounded-3xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-[0_30px_60px_-30px_rgba(15,23,42,0.3)] hover:-translate-y-0.5 transition-[box-shadow,transform] duration-300">
                  <span className="w-11 h-11 rounded-2xl bg-blue-50 text-[#0e70db] flex items-center justify-center mb-5">
                    {b.icon}
                  </span>
                  <div className="font-bold text-gray-900 text-xl tracking-tight">{b.title}</div>
                  <p className="mt-2 text-gray-600 leading-relaxed">{b.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo trabajamos contigo ── */}
      <section className="py-20 sm:py-28 bg-[#0b1220] text-white overflow-hidden relative">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 500px at 50% 0%, rgba(14,112,219,0.35), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal className="max-w-2xl mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300 mb-4">
              Cómo trabajamos contigo
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] leading-[1.08] text-balance">
              De la primera charla a tu primer cliente fiel, en una semana
            </h2>
          </Reveal>
          <ol className="grid md:grid-cols-3 gap-5">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 110}>
                <div className="h-full rounded-3xl bg-white/[0.05] border border-white/10 p-7 backdrop-blur">
                  <div className="text-sm font-mono font-bold text-blue-300">{s.n}</div>
                  <div className="mt-3 text-xl font-bold tracking-tight">{s.title}</div>
                  <p className="mt-2 text-blue-100/75 leading-relaxed">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Quiénes somos, sin adornos ── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-12 items-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e70db] mb-4">
              Quiénes somos
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-[-0.02em] leading-[1.08] text-balance">
              Un equipo que atiende personalmente a cada comercio
            </h2>
            <p className="mt-5 text-gray-600 text-lg leading-relaxed">
              Cuik nace en Lima, hecho por gente que conoce el mostrador. Cada comercio que se suma
              tiene un contacto directo con el equipo: configuramos tu pase contigo, revisamos tus
              números y ajustamos la mecánica cuando hace falta. Crecemos con negocios que nos
              recomiendan, y eso solo pasa si tu programa funciona.
            </p>
          </Reveal>
          <div className="grid gap-4">
            <Reveal delay={100}>
              <TiltCard max={6}>
                <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.3)] flex items-center gap-5">
                  <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0e70db] to-[#3b8ee8] text-white flex items-center justify-center text-2xl font-extrabold shrink-0">
                    FL
                  </span>
                  <div>
                    <div className="font-bold text-gray-900 text-lg">Francesco Leon</div>
                    <div className="text-sm text-gray-500">Fundador · Lima, Perú</div>
                  </div>
                </div>
              </TiltCard>
            </Reveal>
            <Reveal delay={200}>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-3xl border border-dashed border-gray-200 p-6 flex items-center gap-5 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
              >
                <span className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-7 h-7" />
                </span>
                <div className="flex-1">
                  <div className="font-bold text-gray-900 text-lg">Escríbenos directo</div>
                  <div className="text-sm text-gray-500">WhatsApp, lunes a viernes</div>
                </div>
                <ArrowRight className="w-5 h-5 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="rounded-[2rem] bg-gradient-to-br from-[#0e70db] to-[#0a4fa8] text-white p-8 sm:p-12 flex flex-col md:flex-row md:items-center gap-6 shadow-[0_40px_80px_-30px_rgba(14,112,219,0.6)]">
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-balance">
                  ¿Quieres ver tu negocio en la Wallet de tus clientes?
                </h2>
                <p className="mt-2 text-blue-100">
                  Demo gratis en 24 horas. Sin tarjeta, sin compromiso.
                </p>
              </div>
              <Link href="/login?view=demo">
                <Button
                  size="lg"
                  className="w-full md:w-auto bg-[#ff4810] hover:bg-[#e03f0d] text-white font-bold h-12 rounded-full px-6 shadow-lg shadow-orange-500/20 group"
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
