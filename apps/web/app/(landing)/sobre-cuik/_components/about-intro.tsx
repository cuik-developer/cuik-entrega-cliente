"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { HeroCarousel } from "@/components/landing/hero-carousel"
import { Button } from "@/components/ui/button"

/**
 * Sobre Cuik opener: the light two-column hero the home used to have, with
 * the three-phone turntable (each pass plays its visit → push scene) next
 * to the "about" copy. Plays while in view.
 */
export function AboutIntro() {
  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.1 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-[#0e70db]/[0.04] blur-3xl" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] rounded-full bg-[#ff4810]/[0.03] blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className={`space-y-6 ${inView ? "anim-stagger is-visible" : "anim-stagger"}`}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e70db]">
              Sobre Cuik
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-[-0.02em] leading-[1.08] text-balance">
              La fidelización que usan las grandes cadenas, ahora en la Wallet de tus clientes
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 leading-relaxed max-w-lg">
              Nacimos en Lima con una obsesión: que los negocios locales tengan clientes que
              vuelven, sin apps, sin cartón y con la data en sus manos.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Link href="/login?view=demo">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-bold h-12 rounded-full px-6 shadow-md shadow-blue-200/50 group"
                >
                  Agenda una demo
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
              <Link href="/contacto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 rounded-full px-6 font-semibold border-gray-200 text-gray-700 hover:text-[#0e70db] hover:border-blue-200 hover:bg-blue-50/50"
                >
                  Contáctanos
                </Button>
              </Link>
            </div>
            <p className="text-xs text-gray-400">Toca un teléfono para traerlo al frente.</p>
          </div>

          <div
            className="relative flex items-center justify-center h-[440px] lg:h-[520px]"
            style={{ perspective: "1200px" }}
          >
            <HeroCarousel active={inView} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes about-fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .anim-stagger > * { opacity: 0; }
        .anim-stagger.is-visible > * { animation: about-fade-up 0.6s cubic-bezier(0.23, 1, 0.32, 1) both; }
        .anim-stagger.is-visible > :nth-child(2) { animation-delay: 0.08s; }
        .anim-stagger.is-visible > :nth-child(3) { animation-delay: 0.16s; }
        .anim-stagger.is-visible > :nth-child(4) { animation-delay: 0.24s; }
        .anim-stagger.is-visible > :nth-child(5) { animation-delay: 0.32s; }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @media (prefers-reduced-motion: reduce) { .anim-stagger > * { opacity: 1; animation: none !important; } }
      `}</style>
    </section>
  )
}
