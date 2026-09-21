import { ArrowRight, Clock, Instagram, MapPin, MessageCircle, Sparkles } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { INSTAGRAM_URL, SiteFooter, WHATSAPP_URL } from "@/components/landing/site-footer"
import { SiteNav } from "@/components/landing/site-nav"
import { ContactForm } from "./_components/contact-form"

export const metadata: Metadata = {
  title: "Contáctanos — Cuik",
  description:
    "Escríbenos por WhatsApp o déjanos un mensaje. Te respondemos en menos de un día hábil.",
}

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
      <SiteNav solid />

      {/* Hero */}
      <section className="relative overflow-hidden pt-14 pb-10 sm:pt-20 sm:pb-14">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-30%] left-[5%] w-[520px] h-[520px] rounded-full bg-[#0e70db]/[0.05] blur-3xl" />
          <div className="absolute bottom-[-40%] right-[0%] w-[420px] h-[420px] rounded-full bg-[#ff4810]/[0.04] blur-3xl" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <p className="text-xs font-bold uppercase tracking-wider text-[#0e70db] mb-3">
            Contáctanos
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.08] max-w-2xl text-balance">
            Hablemos de tus clientes
          </h1>
          <p className="mt-5 text-lg text-gray-500 max-w-xl">
            Cuéntanos qué necesita tu negocio. Te respondemos en menos de un día hábil, y si
            prefieres hablar ahora, estamos en WhatsApp.
          </p>
        </div>
      </section>

      {/* Channels + form */}
      <section className="pb-20 sm:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
          <div className="space-y-4">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-2xl bg-emerald-600 text-white p-6 shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-colors"
            >
              <div className="flex items-start gap-4">
                <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-100">
                    Lo más rápido
                  </div>
                  <div className="text-xl font-extrabold mt-0.5">WhatsApp</div>
                  <div className="text-emerald-50/90 text-sm mt-1">+51 972 213 023</div>
                </div>
                <ArrowRight className="w-5 h-5 mt-1 opacity-70 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </a>

            <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all flex items-start gap-4"
              >
                <span className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                  <Instagram className="w-4.5 h-4.5" />
                </span>
                <div>
                  <div className="font-bold text-gray-900">Instagram</div>
                  <div className="text-sm text-gray-500">@cuik.ia · novedades y casos reales</div>
                </div>
              </a>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex items-start gap-4">
                <span className="w-10 h-10 rounded-xl bg-blue-50 text-[#0e70db] flex items-center justify-center shrink-0">
                  <Clock className="w-4.5 h-4.5" />
                </span>
                <div>
                  <div className="font-bold text-gray-900">Horario de atención</div>
                  <div className="text-sm text-gray-500">
                    Lunes a viernes, 9:00 a 18:00 (hora de Lima)
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex items-start gap-4 sm:col-span-2 lg:col-span-1">
                <span className="w-10 h-10 rounded-xl bg-orange-50 text-[#ff4810] flex items-center justify-center shrink-0">
                  <MapPin className="w-4.5 h-4.5" />
                </span>
                <div>
                  <div className="font-bold text-gray-900">Lima, Perú</div>
                  <div className="text-sm text-gray-500">
                    Atendemos comercios en todo el Perú y LATAM, 100 % en línea.
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/login?view=demo"
              className="group block rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start gap-4">
                <span className="w-10 h-10 rounded-xl bg-[#0e70db] text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-200/60">
                  <Sparkles className="w-4.5 h-4.5" />
                </span>
                <div className="flex-1">
                  <div className="font-bold text-gray-900">¿Buscas una demo?</div>
                  <div className="text-sm text-gray-500">
                    Pídela directo y la activamos en 24 horas, gratis por 7 días.
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 mt-1 text-[#0e70db] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          </div>

          <div className="relative rounded-3xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/40">
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Déjanos un mensaje
            </h2>
            <p className="text-sm text-gray-500 mt-1 mb-6">Los campos con * son obligatorios.</p>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-8">
            Lo que más nos preguntan
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl bg-white border border-gray-100 p-6">
                <div className="font-bold text-gray-900 mb-2">{f.q}</div>
                <p className="text-sm text-gray-600 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
