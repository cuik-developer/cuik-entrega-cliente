import {
  ArrowRight,
  BarChart3,
  Gift,
  Heart,
  MessageCircle,
  Palette,
  Percent,
  Smartphone,
  Stamp,
  Star,
  Wallet,
  Zap,
} from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { SiteFooter, WHATSAPP_URL } from "@/components/landing/site-footer"
import { SiteNav } from "@/components/landing/site-nav"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Sobre Cuik — Fidelización digital hecha en Lima",
  description:
    "Cuik nació para que el comercio de barrio tenga la misma fidelización que las grandes cadenas: en la Wallet del cliente, sin apps y con la data para ti.",
}

const BELIEFS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <Smartphone className="w-5 h-5" />,
    title: "Sin apps, sin fricción",
    text: "Nadie descarga una app para un café. El pase vive en Apple Wallet y Google Wallet, que ya están en el teléfono.",
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: "La data es del comercio",
    text: "Saber quién volvió, cuándo y qué canjeó es tuyo. Cuik te lo muestra claro, sin hojas de cálculo.",
  },
  {
    icon: <Palette className="w-5 h-5" />,
    title: "Con tu marca, no la nuestra",
    text: "Tu logo, tus colores, tu premio. El cliente ve tu negocio en su Wallet, no un logo ajeno.",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Simple para el cajero",
    text: "Registrar una visita toma un escaneo. Si no es más rápido que un sello de tinta, no sirve.",
  },
]

const MECHANICS: { icon: ReactNode; label: string; color: string }[] = [
  { icon: <Stamp className="w-4 h-4" />, label: "Estampillas", color: "bg-[#0e70db]" },
  { icon: <Star className="w-4 h-4" />, label: "Puntos", color: "bg-amber-500" },
  { icon: <Percent className="w-4 h-4" />, label: "Descuentos", color: "bg-[#ff4810]" },
  { icon: <Gift className="w-4 h-4" />, label: "Cupones de regalo", color: "bg-emerald-600" },
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
      <SiteNav solid />

      {/* Hero */}
      <section className="relative overflow-hidden pt-14 pb-16 sm:pt-20 sm:pb-24">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] right-[5%] w-[560px] h-[560px] rounded-full bg-[#0e70db]/[0.05] blur-3xl" />
          <div className="absolute bottom-[-30%] left-[0%] w-[420px] h-[420px] rounded-full bg-[#ff4810]/[0.04] blur-3xl" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-12 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#0e70db] mb-3">
              Sobre Cuik
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.08] text-balance">
              Fidelización de grandes cadenas, para el negocio de la esquina
            </h1>
            <p className="mt-6 text-lg text-gray-500 max-w-xl leading-relaxed">
              Cuik nació en Lima con una idea simple: la cafetería, la barbería y la veterinaria de
              tu barrio merecen la misma herramienta que las grandes marcas usan para que sus
              clientes vuelvan. Sin apps, sin cartón y con la data en tus manos.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/login?view=demo">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-bold h-12 rounded-xl shadow-md shadow-blue-200/50 group"
                >
                  Agenda una demo
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
              <Link href="/contacto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 rounded-xl font-semibold border-gray-200 text-gray-700 hover:text-[#0e70db] hover:border-blue-200 hover:bg-blue-50/50"
                >
                  Contáctanos
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative mx-auto w-[260px] sm:w-[300px]">
            <div className="absolute -inset-10 rounded-full bg-[#0e70db]/[0.06] blur-3xl pointer-events-none" />
            <Image
              src="/landing/mockup-gradual.png"
              alt="Pase de fidelización Gradual Café en Apple Wallet"
              width={564}
              height={1002}
              className="relative w-full h-auto drop-shadow-2xl"
              priority
            />
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="relative w-full max-w-md mx-auto lg:mx-0 aspect-[1.62] rounded-2xl overflow-hidden shadow-xl rotate-[-2deg]">
            <Image
              src="/landing/old-stamp-card.png"
              alt="Tarjeta de sellos de cartón desgastada"
              fill
              className="object-cover scale-[1.42] origin-[50%_48%]"
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Por qué existe Cuik
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight text-balance">
              Todo empezó con una tarjeta de cartón perdida
            </h2>
            <div className="mt-5 space-y-4 text-gray-600 leading-relaxed">
              <p>
                La tarjeta de sellos funciona: la gente vuelve por el premio. El problema es el
                cartón. Se moja, se pierde, cualquiera falsifica el sello y el dueño nunca sabe
                quién volvió ni cuántas veces.
              </p>
              <p>
                Vimos que la solución ya estaba en el bolsillo de cada cliente: su Wallet. Solo
                faltaba que un comercio pequeño pudiera usarla sin un equipo de tecnología ni un
                presupuesto de cadena. Eso es Cuik.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {MECHANICS.map((m) => (
                <span
                  key={m.label}
                  className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 pl-1.5 pr-3 py-1.5 text-sm font-medium text-gray-700"
                >
                  <span
                    className={`w-6 h-6 rounded-full ${m.color} text-white flex items-center justify-center`}
                  >
                    {m.icon}
                  </span>
                  {m.label}
                </span>
              ))}
            </div>
            <Link
              href="/#demo"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0e70db] hover:underline"
            >
              Ver cómo funciona
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Beliefs */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              En qué creemos
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight text-balance">
              Cuatro reglas que no negociamos
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
            {BELIEFS.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
              >
                <span className="w-10 h-10 rounded-xl bg-blue-50 text-[#0e70db] flex items-center justify-center mb-4">
                  {b.icon}
                </span>
                <div className="font-bold text-gray-900 text-lg">{b.title}</div>
                <p className="mt-1.5 text-gray-600 text-sm leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How we work */}
      <section className="py-16 sm:py-20 bg-[#0c3d7a] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-200 mb-3">
              Cómo trabajamos contigo
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance">
              De la primera charla a tu primer cliente fiel, en una semana
            </h2>
          </div>
          <ol className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-white/[0.06] border border-white/10 p-6">
                <div className="text-sm font-mono font-bold text-blue-200">{s.n}</div>
                <div className="mt-2 text-lg font-bold">{s.title}</div>
                <p className="mt-1.5 text-blue-100/80 text-sm leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-blue-100/80">
            <span className="inline-flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Apple Wallet y Google Wallet
            </span>
            <span className="inline-flex items-center gap-2">
              <Zap className="w-4 h-4" /> Demo en 24 horas
            </span>
            <span className="inline-flex items-center gap-2">
              <Heart className="w-4 h-4" /> Hecho en Lima, Perú
            </span>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Quiénes somos
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight text-balance">
              Un equipo chico que atiende personalmente a cada comercio
            </h2>
            <p className="mt-5 text-gray-600 leading-relaxed">
              Cuando escribes a Cuik te responde una persona que conoce tu pase, tu premio y tu
              negocio. Preferimos crecer con comercios que nos recomienden a llenar un formulario de
              soporte.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm flex items-center gap-4">
              <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0e70db] to-[#3b8ee8] text-white flex items-center justify-center text-xl font-extrabold shrink-0">
                FL
              </span>
              <div>
                <div className="font-bold text-gray-900">Francesco Leon</div>
                <div className="text-sm text-gray-500">Fundador · Lima</div>
              </div>
            </div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-dashed border-gray-200 p-6 flex items-center gap-4 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
            >
              <span className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageCircle className="w-6 h-6" />
              </span>
              <div>
                <div className="font-bold text-gray-900">Escríbenos directo</div>
                <div className="text-sm text-gray-500">WhatsApp, lunes a viernes</div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 sm:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl bg-gradient-to-br from-[#0e70db] to-[#0c5fc0] text-white p-8 sm:p-12 flex flex-col md:flex-row md:items-center gap-6 shadow-xl shadow-blue-200/60">
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
                className="w-full md:w-auto bg-[#ff4810] hover:bg-[#e03f0d] text-white font-bold h-12 rounded-xl shadow-lg shadow-orange-500/20 group"
              >
                Solicitar demo gratis
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
