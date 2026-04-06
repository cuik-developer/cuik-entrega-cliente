"use client"

import {
  AlertTriangle,
  ArrowRight,
  Cake,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Dumbbell,
  Gift,
  Menu,
  MessageCircle,
  PawPrint,
  QrCode,
  Scissors,
  Shirt,
  Sparkles,
  Stamp,
  Star,
  Trophy,
  UtensilsCrossed,
  X,
  Zap,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/* ─── Data ─────────────────────────────────────────────── */

const VERTICALS: { icon: ReactNode; label: string }[] = [
  { icon: <Coffee className="w-4 h-4" />, label: "Cafeterías" },
  { icon: <Scissors className="w-4 h-4" />, label: "Barberías" },
  { icon: <PawPrint className="w-4 h-4" />, label: "Veterinarias" },
  { icon: <UtensilsCrossed className="w-4 h-4" />, label: "Restaurantes" },
  { icon: <Sparkles className="w-4 h-4" />, label: "Nail Bars" },
  { icon: <Dumbbell className="w-4 h-4" />, label: "Gimnasios" },
  { icon: <Cake className="w-4 h-4" />, label: "Pastelerías" },
  { icon: <Car className="w-4 h-4" />, label: "Autolavados" },
  { icon: <Shirt className="w-4 h-4" />, label: "Boutiques" },
  { icon: <Sparkles className="w-4 h-4" />, label: "Spas" },
  { icon: <Sparkles className="w-4 h-4" />, label: "Yoga Studios" },
  { icon: <Trophy className="w-4 h-4" />, label: "Canchas" },
]

const MECHANICS = [
  {
    icon: <Stamp className="w-8 h-8" />,
    title: "Estampillas",
    desc: "Compra 8, llévate 1 gratis. El clásico, ahora digital.",
    color: "from-blue-50 to-blue-100/50",
    iconBg: "bg-[#0e70db]",
  },
  {
    icon: <span className="text-3xl font-black">%</span>,
    title: "Descuentos",
    desc: "Martes de descuentos exclusivos para clientes frecuentes.",
    color: "from-orange-50 to-orange-100/50",
    iconBg: "bg-[#ff4810]",
  },
  {
    icon: <Gift className="w-8 h-8" />,
    title: "Cupones de regalo",
    desc: "Regálale una experiencia a alguien especial.",
    color: "from-emerald-50 to-emerald-100/50",
    iconBg: "bg-emerald-600",
  },
  {
    icon: <Star className="w-8 h-8" />,
    title: "Puntos",
    desc: "Cada compra suma. Cada punto cuenta.",
    color: "from-amber-50 to-amber-100/50",
    iconBg: "bg-amber-500",
  },
]

/* ─── Plan types ──────────────────────────────────────── */

type PlanCard = {
  name: string
  prices: { monthly: number; quarterly: number; annual: number }
  features: string[]
  cta: string
  popular: boolean
}

type DbPlan = {
  name: string
  price: number
  maxLocations: number
  maxPromos: number
  maxClients: number
  features: string[] | null
}

const FALLBACK_PLANS: PlanCard[] = [
  {
    name: "Starter",
    prices: { monthly: 69, quarterly: 48, annual: 34 },
    features: [
      "1 sucursal",
      "1 promoción activa",
      "Clientes ilimitados",
      "Push notifications",
      "Geo-notifications",
      "CRM Básico",
      "Panel de cajero",
      "Soporte por email",
      "Editor básico",
    ],
    cta: "Empezar",
    popular: false,
  },
  {
    name: "Pro",
    prices: { monthly: 159, quarterly: 111, annual: 78 },
    features: [
      "Hasta 3 sucursales",
      "Hasta 3 promociones activas",
      "Clientes ilimitados",
      "Push notifications",
      "Geo-notifications",
      "CRM Avanzado",
      "Panel de cajero",
      "Soporte prioritario",
      "Editor completo",
      "Campañas push",
    ],
    cta: "Suscribirme al plan Pro",
    popular: true,
  },
  {
    name: "Ultra",
    prices: { monthly: 289, quarterly: 202, annual: 142 },
    features: [
      "Sucursales ilimitadas",
      "Promociones ilimitadas",
      "Clientes ilimitados",
      "Push notifications",
      "Geo-notifications",
      "CRM Avanzado + Export",
      "Panel de cajero",
      "Soporte dedicado",
      "Editor + Templates",
      "Campañas + Automatización",
      "API access",
    ],
    cta: "Contactar ventas",
    popular: false,
  },
]

/** Build location/promo feature text from DB limits */
function formatLimit(count: number, singular: string, plural: string): string {
  if (count >= 999) return `${plural} ilimitadas`
  if (count === 1) return `1 ${singular}`
  return `Hasta ${count} ${plural}`
}

/** Map DB plans to pricing card format */
function mapDbPlansToCards(dbPlans: DbPlan[]): PlanCard[] {
  return dbPlans.map((p, i) => {
    const monthly = p.price / 100
    const quarterly = Math.round(monthly * 0.7)
    const annual = Math.round(monthly * 0.49)

    const features = [
      formatLimit(p.maxLocations, "sucursal", "sucursales"),
      formatLimit(p.maxPromos, "promoción activa", "promociones activas"),
      p.maxClients >= 999_999
        ? "Clientes ilimitados"
        : `Hasta ${p.maxClients.toLocaleString()} clientes`,
      ...(Array.isArray(p.features) ? p.features : []),
    ]

    const isMiddle = dbPlans.length >= 3 ? i === 1 : i === dbPlans.length - 1

    return {
      name: p.name,
      prices: { monthly, quarterly, annual },
      features,
      cta: isMiddle ? `Suscribirme al plan ${p.name}` : i === 0 ? "Empezar" : "Contactar ventas",
      popular: isMiddle,
    }
  })
}

type BillingCycle = "monthly" | "quarterly" | "annual"

/* ─── Intersection Observer hook ───────────────────────── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setInView(true)
      },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])

  return { ref, inView }
}

/* ─── Phone Mockup ─────────────────────────────────────── */

function _PhoneMockup({
  color = "#FDF8EA",
  textColor = "#DA4319",
  businessName = "Café Aromático",
  filled = 3,
  className = "",
}: {
  color?: string
  textColor?: string
  businessName?: string
  filled?: number
  className?: string
}) {
  const total = 8
  return (
    <div
      className={`relative w-[200px] h-[400px] bg-gray-900 rounded-[40px] shadow-2xl border-4 border-gray-800 flex flex-col items-center overflow-hidden ${className}`}
    >
      <div className="w-20 h-5 bg-gray-900 rounded-b-2xl mt-1 z-10" />
      <div className="flex-1 w-full flex flex-col" style={{ backgroundColor: color }}>
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: textColor, color }}
            >
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: textColor }}>
                {businessName}
              </div>
              <div className="text-xs opacity-70" style={{ color: textColor }}>
                Fidelización digital
              </div>
            </div>
          </div>
        </div>
        <div className="mx-3 p-3 rounded-xl mb-2" style={{ backgroundColor: `${textColor}15` }}>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative stamp grid
                key={i}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                style={{
                  backgroundColor: i < filled ? textColor : "transparent",
                  border: `2px solid ${textColor}`,
                  opacity: i < filled ? 1 : 0.4,
                  color,
                }}
              >
                {i < filled ? <Check className="w-3 h-3" /> : ""}
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 space-y-1">
          <div className="flex justify-between">
            <span className="text-xs font-semibold" style={{ color: textColor }}>
              Visitas
            </span>
            <span className="text-xs font-bold" style={{ color: textColor }}>
              {filled} de {total}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs font-semibold" style={{ color: textColor }}>
              Premio
            </span>
            <span className="text-xs font-bold" style={{ color: textColor }}>
              Gratis
            </span>
          </div>
        </div>
        <div className="flex justify-center mt-3">
          <div className="w-16 h-16 bg-white rounded-xl p-1.5 shadow">
            <div className="w-full h-full grid grid-cols-5 gap-px">
              {[1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1].map(
                (v, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static decorative QR pattern
                    key={i}
                    className="rounded-sm"
                    style={{ backgroundColor: v ? "#000" : "#fff" }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
        <div className="mx-4 mt-3 py-1.5 px-3 bg-black rounded-lg flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-white fill-white" viewBox="0 0 24 24">
            <title>Apple</title>
            <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
          </svg>
          <span className="text-white text-xs font-medium">Apple Wallet</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Animated counter ─────────────────────────────────── */

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0)
  const { ref, inView } = useInView()

  useEffect(() => {
    if (!inView) return
    let frame: number
    const duration = 1200
    const start = performance.now()
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(eased * target))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, target])

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  )
}

/* ─── Page ─────────────────────────────────────────────── */

export default function HomePage() {
  const [billing, setBilling] = useState<BillingCycle>("monthly")
  const [beforeAfter, setBeforeAfter] = useState<"before" | "after">("after")
  const [showConfetti, setShowConfetti] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [plans, setPlans] = useState<PlanCard[]>(FALLBACK_PLANS)

  const handleAfterClick = () => {
    if (beforeAfter === "after") return
    setBeforeAfter("after")
    setShowConfetti(true)
    setTimeout(() => setShowConfetti(false), 2500)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    fetch("/api/public/plans")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setPlans(mapDbPlansToCards(json.data))
        }
      })
      .catch(() => {
        // Keep fallback plans on error
      })
  }, [])

  const hero = useInView(0.1)
  const benefits = useInView()
  const demo = useInView()
  const diff = useInView()
  const mechanics = useInView()
  const social = useInView()
  const pricing = useInView()

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* ─── Styles ──────────────────────────────────── */}
      <style>{`
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes pulse-stamp { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.15); } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes fade-up { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        .anim-fade-up { animation: fade-up 0.7s ease-out both; }
        .anim-fade-in { animation: fade-in 0.5s ease-out both; }
        .anim-scale-in { animation: scale-in 0.6s ease-out both; }
        .anim-delay-1 { animation-delay: 0.1s; }
        .anim-delay-2 { animation-delay: 0.2s; }
        .anim-delay-3 { animation-delay: 0.3s; }
        .anim-delay-4 { animation-delay: 0.4s; }
        .anim-delay-5 { animation-delay: 0.5s; }
        .anim-stagger > * { opacity: 0; }
        .anim-stagger.is-visible > * { animation: fade-up 0.6s ease-out both; }
        .anim-stagger.is-visible > *:nth-child(1) { animation-delay: 0s; }
        .anim-stagger.is-visible > *:nth-child(2) { animation-delay: 0.1s; }
        .anim-stagger.is-visible > *:nth-child(3) { animation-delay: 0.15s; }
        .anim-stagger.is-visible > *:nth-child(4) { animation-delay: 0.2s; }
        .anim-stagger.is-visible > *:nth-child(5) { animation-delay: 0.25s; }
        .anim-stagger.is-visible > *:nth-child(6) { animation-delay: 0.3s; }
        .grain::after { content: ''; position: absolute; inset: 0; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); pointer-events: none; }
        @keyframes confetti-fall { 0% { transform: translateY(-20px) rotate(0deg) scale(0); opacity: 1; } 15% { transform: translateY(0) rotate(45deg) scale(1); opacity: 1; } 100% { transform: translateY(calc(100vh - 100px)) rotate(720deg) scale(0.5); opacity: 0; } }
        @keyframes confetti-spread { 0% { transform: translate(0,0) scale(0); opacity: 1; } 20% { transform: translate(var(--cx), var(--cy)) scale(1.2); opacity: 1; } 100% { transform: translate(var(--cx), calc(var(--cy) + 300px)) scale(0.3); opacity: 0; } }
        .confetti-particle { position: absolute; pointer-events: none; animation: confetti-spread 2.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
      `}</style>

      {/* ─── Navbar ──────────────────────────────────── */}
      <nav
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100" : "bg-transparent"}`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <CuikLogo />
            <span className="text-xl font-extrabold text-gray-900 tracking-tight">Cuik</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {[
              { href: "#beneficios", label: "Beneficios" },
              { href: "#demo", label: "Demo" },
              { href: "#precios", label: "Precios" },
              { href: "#casos", label: "Casos de uso" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-[#0e70db] rounded-lg hover:bg-blue-50/60 transition-all"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex text-gray-700 font-medium hover:text-[#0e70db] hover:bg-blue-50/60"
              >
                Iniciar sesión
              </Button>
            </Link>
            <Link href="/login?view=demo">
              <Button
                size="sm"
                className="hidden md:inline-flex bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-semibold shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60 transition-all"
              >
                Agenda una demo
              </Button>
            </Link>
            <button
              type="button"
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label="Menu"
            >
              {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100 px-4 py-5 space-y-1 anim-fade-in">
            {[
              { href: "#beneficios", label: "Beneficios" },
              { href: "#demo", label: "Demo" },
              { href: "#precios", label: "Precios" },
              { href: "#casos", label: "Casos de uso" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenu(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <Link
                href="/login"
                className="block px-3 py-2.5 text-sm font-semibold text-[#0e70db]"
              >
                Iniciar sesión
              </Link>
              <Link href="/login?view=demo">
                <Button className="w-full bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-semibold">
                  Agenda una demo
                </Button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ─── Hero ────────────────────────────────────── */}
      <section ref={hero.ref} className="relative overflow-hidden pt-12 pb-24 sm:pt-20 sm:pb-32">
        {/* Background: subtle radial glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-[#0e70db]/[0.04] blur-3xl" />
          <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] rounded-full bg-[#ff4810]/[0.03] blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div
              className={`space-y-7 ${hero.inView ? "anim-stagger is-visible" : "anim-stagger"}`}
            >
              <div>
                <Badge className="bg-gradient-to-r from-blue-50 to-blue-100 text-[#0e70db] border-blue-200/60 font-semibold px-3.5 py-1.5 text-xs tracking-wide uppercase">
                  <Zap className="w-3 h-3 mr-1.5" />
                  Plataforma #1 de fidelización en LATAM
                </Badge>
              </div>
              <div>
                <h1 className="text-5xl sm:text-6xl lg:text-[4.25rem] font-extrabold text-gray-900 leading-[1.08] tracking-tight">
                  Convierte visitas en{" "}
                  <span className="relative inline-block">
                    <span className="relative z-10 bg-gradient-to-r from-[#0e70db] to-[#3b8ee8] bg-clip-text text-transparent">
                      clientes fieles
                    </span>
                    <span className="absolute bottom-1 left-0 right-0 h-3 bg-[#ff4810]/15 -rotate-1 rounded" />
                  </span>
                </h1>
              </div>
              <div>
                <p className="text-lg sm:text-xl text-gray-500 leading-relaxed max-w-lg">
                  Tarjetas de lealtad digitales en Apple y Google Wallet. Sin apps. Sin cartón. Tu
                  cliente solo escanea y listo.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link href="/login?view=demo">
                  <Button
                    size="lg"
                    className="bg-[#ff4810] hover:bg-[#e03f0d] text-white font-bold text-base px-8 h-13 rounded-xl shadow-lg shadow-orange-200/50 hover:shadow-xl hover:shadow-orange-200/60 transition-all group w-full sm:w-auto"
                  >
                    Empieza gratis
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </Link>
                <Link href="/login?view=demo">
                  <Button
                    size="lg"
                    className="border-2 border-gray-200 bg-white text-gray-700 font-semibold h-13 rounded-xl hover:border-[#0e70db]/40 hover:bg-blue-50 hover:text-[#0e70db] transition-all w-full sm:w-auto"
                  >
                    Prueba 7 días gratis
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                {["Listo para tu negocio", "Setup en 10 min", "Sin tarjeta de crédito"].map((b) => (
                  <div key={b} className="flex items-center gap-1.5 text-sm text-gray-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="relative flex items-center justify-center h-[440px] lg:h-[520px]"
              style={{ perspective: "1200px" }}
            >
              <div
                className="relative w-[320px] sm:w-[380px] lg:w-[420px] h-[380px] sm:h-[440px] lg:h-[500px]"
                style={{
                  transformStyle: "preserve-3d",
                  animation: "float 6s ease-in-out infinite",
                }}
              >
                {/* Left phone — MascotaVeloz (BEHIND, rotated in 3D) */}
                <div
                  className="absolute top-1/2 left-1/2 w-[52%]"
                  style={{
                    transform: "translate(-90%, -50%) rotateY(25deg) scale(0.85)",
                    transformOrigin: "center center",
                    opacity: 0.65,
                    filter: "blur(1.5px)",
                  }}
                >
                  <Image
                    src="/landing/mockup-mascotaveloz.png"
                    alt="Pase de fidelización MascotaVeloz en Apple Wallet"
                    width={564}
                    height={1002}
                    className="w-full h-auto drop-shadow-xl"
                  />
                </div>
                {/* Right phone — El Patrón Barber (BEHIND, rotated in 3D) */}
                <div
                  className="absolute top-1/2 left-1/2 w-[52%]"
                  style={{
                    transform: "translate(-10%, -50%) rotateY(-25deg) scale(0.85)",
                    transformOrigin: "center center",
                    opacity: 0.65,
                    filter: "blur(1.5px)",
                  }}
                >
                  <Image
                    src="/landing/mockup-elpatron.png"
                    alt="Pase de puntos El Patrón Barber en Apple Wallet"
                    width={564}
                    height={1002}
                    className="w-full h-auto drop-shadow-xl"
                  />
                </div>
                {/* Center phone — Gradual (FRONT, no rotation) */}
                <div
                  className="absolute top-1/2 left-1/2 w-[55%] z-10"
                  style={{
                    transform: "translate(-50%, -50%) rotateY(0deg) scale(1)",
                    transformOrigin: "center center",
                  }}
                >
                  <Image
                    src="/landing/mockup-gradual.png"
                    alt="Pase de fidelización Gradual Café en Apple Wallet"
                    width={564}
                    height={1002}
                    className="w-full h-auto drop-shadow-2xl"
                    priority
                  />
                </div>
                {/* Shadow underneath the group */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[80%] h-6 bg-black/10 rounded-full blur-2xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Verticals Marquee ───────────────────────── */}
      <section className="py-6 bg-gray-50/80 border-y border-gray-100/80 overflow-hidden">
        <div className="flex gap-10" style={{ animation: "marquee 25s linear infinite" }}>
          {[...VERTICALS, ...VERTICALS].map((v, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: duplicated marquee items need index keys
              key={i}
              className="flex items-center gap-2 text-gray-400 whitespace-nowrap select-none"
            >
              <span className="text-[#0e70db]/40">{v.icon}</span>
              <span className="text-sm font-medium tracking-wide">{v.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Stats Bar ───────────────────────────────── */}
      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: 500, suffix: "+", label: "Comercios activos" },
              { value: 50, suffix: "K+", label: "Clientes fidelizados" },
              { value: 40, suffix: "%", label: "Más retención" },
              { value: 24, suffix: "h", label: "Activación" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                  <AnimatedNumber target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-gray-500 mt-1 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Benefits: Así de simple ─────────────────── */}
      <section id="beneficios" className="py-20 sm:py-24 bg-white">
        <div ref={benefits.ref} className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              Así de simple
            </h2>
            <p className="text-gray-500 text-lg max-w-md mx-auto">
              Tres pasos para que tus clientes vuelvan una y otra vez
            </p>
          </div>
          <div
            className={`grid md:grid-cols-3 gap-6 anim-stagger ${benefits.inView ? "is-visible" : ""}`}
          >
            {[
              {
                icon: <QrCode className="w-9 h-9" />,
                step: "01",
                title: "Escanea",
                desc: "Tu cliente muestra su QR en el mostrador. El cajero lo escanea en segundos.",
                img: "/landing/step-scan.png",
              },
              {
                icon: <Stamp className="w-9 h-9" />,
                step: "02",
                title: "Acumula",
                desc: "Cada visita suma un sello digital a su tarjeta en Apple o Google Wallet.",
                img: "/landing/step-stamp.png",
              },
              {
                icon: <Gift className="w-9 h-9" />,
                step: "03",
                title: "Premia",
                desc: "Al completar el ciclo, gana su recompensa automáticamente.",
                img: "/landing/step-reward.png",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative p-8 rounded-2xl bg-gradient-to-b from-gray-50 to-white border border-gray-100 hover:border-[#0e70db]/20 hover:shadow-lg hover:shadow-blue-50 transition-all duration-300 group overflow-hidden"
              >
                <div className="text-6xl font-black text-gray-100/80 group-hover:text-blue-100 absolute top-4 right-6 transition-colors select-none">
                  {item.step}
                </div>
                <div className="relative w-full h-40 mb-5 rounded-xl overflow-hidden bg-blue-50/50">
                  <Image
                    src={item.img}
                    alt={item.title}
                    fill
                    className="object-contain p-2 group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#0e70db] text-white flex items-center justify-center mb-4 shadow-lg shadow-blue-200/40">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Hero Banner Image ────────────────────────── */}
      <section className="relative h-[280px] sm:h-[360px] overflow-hidden">
        <Image
          src="/landing/hero-cafe.png"
          alt="Cafetería en Lima usando Cuik para fidelizar clientes con pases digitales"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a]/70 via-[#0f172a]/40 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <p className="text-white/90 text-lg sm:text-xl font-semibold max-w-md leading-relaxed">
              Comercios reales en Perú ya usan Cuik para convertir cada visita en un cliente que
              vuelve.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Demo Interactiva ────────────────────────── */}
      <section id="demo" className="relative py-20 sm:py-24 grain overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/70 via-white to-gray-50 pointer-events-none" />
        <div ref={demo.ref} className="max-w-5xl mx-auto px-4 sm:px-6 relative">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              Mira cómo funciona tu pase
            </h2>
            <p className="text-gray-500 text-lg">En 3 simples pasos, tu cliente queda fidelizado</p>
          </div>
          <div
            className={`flex flex-col lg:flex-row items-center gap-14 ${demo.inView ? "" : "opacity-0"}`}
            style={demo.inView ? { animation: "fade-up 0.8s ease-out both" } : undefined}
          >
            {/* Phone */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-8 bg-[#0e70db]/[0.04] rounded-full blur-2xl" />
              <div className="relative w-[220px]">
                <Image
                  src="/landing/mockup-gradual.png"
                  alt="Pase de fidelización Gradual Café en Apple Wallet"
                  width={564}
                  height={1002}
                  className="w-full h-auto drop-shadow-2xl"
                />
              </div>
            </div>

            {/* Steps */}
            <div className="flex-1 grid sm:grid-cols-3 gap-8">
              {[
                {
                  icon: <QrCode className="w-7 h-7" />,
                  step: "1",
                  title: "El cliente escanea el QR",
                  desc: "Apunta la cámara al código QR en tu mostrador. Sin apps, sin registro complicado.",
                },
                {
                  icon: <CheckCircle2 className="w-7 h-7" />,
                  step: "2",
                  title: "Se registra la visita",
                  desc: "El sello se agrega automáticamente a su pase digital en el wallet.",
                },
                {
                  icon: <Gift className="w-7 h-7" />,
                  step: "3",
                  title: "Completa y gana",
                  desc: "Al completar todos los sellos, el premio se desbloquea al instante.",
                },
              ].map((item) => (
                <div key={item.step} className="text-center lg:text-left space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-[#0e70db] text-white flex items-center justify-center mx-auto lg:mx-0 shadow-lg shadow-blue-200/40">
                    {item.icon}
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0e70db] uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">
                      {item.step}
                    </span>
                    Paso {item.step}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Differentiators ─────────────────────────── */}
      <section className="py-20 sm:py-24 bg-white">
        <div ref={diff.ref} className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              ¿Por qué Cuik y no otra solución?
            </h2>
            <p className="text-gray-500 text-lg">Comparamos para que no tengas que hacerlo tú</p>
          </div>
          <div
            className={`grid md:grid-cols-3 gap-6 anim-stagger ${diff.inView ? "is-visible" : ""}`}
          >
            <Card className="border-2 border-gray-200 bg-gray-50/50 opacity-75">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded bg-gray-300 flex items-center justify-center">
                    <Stamp className="w-4 h-4 text-gray-500" />
                  </span>
                  <h3 className="text-lg font-bold text-gray-400 line-through">
                    Tarjetas de cartón
                  </h3>
                </div>
                {[
                  "Se pierden o se dañan",
                  "No generan data",
                  "No escalan",
                  "Cero personalización",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-gray-400 line-through">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-2 border-amber-200 bg-amber-50/30">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded bg-amber-200 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </span>
                  <h3 className="text-lg font-bold text-amber-700">Apps genéricas</h3>
                </div>
                {[
                  "El cliente debe descargar una app",
                  "Abandono del 80% en la descarga",
                  "Sin integración con wallet",
                  "Diseño genérico",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="text-sm text-amber-700">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-2 border-[#0e70db] bg-gradient-to-b from-blue-50/60 to-white shadow-xl shadow-blue-100/50 md:scale-105">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CuikLogo size="sm" />
                  <h3 className="text-lg font-bold text-[#0e70db]">Cuik</h3>
                  <Badge className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-bold border-0">
                    Mejor opción
                  </Badge>
                </div>
                {[
                  "Directo en Apple & Google Wallet",
                  "Sin descargar apps",
                  "Data en tiempo real",
                  "Diseño personalizado con IA",
                  "Notificaciones push nativas",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 font-medium">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── Before / After ──────────────────────────── */}
      <section className="relative py-20 sm:py-24 bg-gray-50/80 overflow-hidden">
        {/* Confetti burst */}
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none z-20">
            {Array.from({ length: 40 }).map((_, i) => {
              const colors = ["#0e70db", "#ff4810", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"]
              const color = colors[i % colors.length]
              const cx = `${(Math.random() - 0.5) * 600}px`
              const cy = `${(Math.random() - 0.5) * 200 - 100}px`
              const delay = `${Math.random() * 0.4}s`
              const size = 6 + Math.random() * 8
              const shapes = ["rounded-full", "rounded-sm", "rounded-none"]
              const shape = shapes[i % shapes.length]
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static confetti particles
                  key={i}
                  className={`confetti-particle ${shape}`}
                  style={
                    {
                      left: "50%",
                      top: "30%",
                      width: size,
                      height: size,
                      backgroundColor: color,
                      "--cx": cx,
                      "--cy": cy,
                      animationDelay: delay,
                    } as React.CSSProperties
                  }
                />
              )
            })}
          </div>
        )}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 text-center mb-8 tracking-tight">
            El antes y el ahora
          </h2>
          <div className="flex justify-center mb-10">
            <div className="bg-white rounded-xl p-1 border border-gray-200 flex gap-1 shadow-sm">
              <button
                type="button"
                onClick={() => setBeforeAfter("before")}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${beforeAfter === "before" ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:text-gray-700"}`}
              >
                Antes
              </button>
              <button
                type="button"
                onClick={handleAfterClick}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${beforeAfter === "after" ? "bg-[#0e70db] text-white shadow-md shadow-blue-200/50" : "text-gray-500 hover:text-gray-700"}`}
              >
                Ahora con Cuik
              </button>
            </div>
          </div>
          {beforeAfter === "before" ? (
            <Card className="border-2 border-red-100 anim-scale-in">
              <CardContent className="p-8 sm:p-10">
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    {[
                      "Se pierde entre bolsillos",
                      "No genera data útil",
                      "Cero tecnología",
                      "Diseño poco profesional",
                      "No se puede actualizar",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <X className="w-3.5 h-3.5 text-red-500" />
                        </div>
                        <span className="text-gray-600">{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    <div className="relative w-56 h-40 rounded-xl overflow-hidden shadow-inner opacity-80 -rotate-2">
                      <Image
                        src="/landing/old-stamp-card.png"
                        alt="Tarjeta de sellos de cartón desgastada"
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="relative rounded-2xl bg-[#0c3d7a] overflow-hidden anim-scale-in">
              {/* Floating Lucide icons as decoration */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <QrCode className="absolute top-6 left-8 w-8 h-8 text-white/[0.07] rotate-12" />
                <Gift className="absolute top-12 right-12 w-10 h-10 text-white/[0.07] -rotate-6" />
                <Star className="absolute bottom-16 left-12 w-7 h-7 text-white/[0.07] rotate-45" />
                <CheckCircle2 className="absolute bottom-8 right-20 w-9 h-9 text-white/[0.07] -rotate-12" />
                <Stamp className="absolute top-1/2 left-4 w-6 h-6 text-white/[0.07] rotate-[-20deg]" />
                <Zap className="absolute top-8 left-1/3 w-6 h-6 text-white/[0.07] rotate-12" />
                <Coffee className="absolute bottom-12 left-1/3 w-7 h-7 text-white/[0.07] -rotate-6" />
                <Trophy className="absolute top-1/3 right-8 w-6 h-6 text-white/[0.07] rotate-[25deg]" />
              </div>
              <div className="relative p-8 sm:p-10">
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    {[
                      "Siempre en su teléfono",
                      "Data accionable en tiempo real",
                      "Tecnología Apple & Google Wallet",
                      "Diseño profesional personalizado",
                      "Se actualiza automáticamente",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <span className="text-white font-medium">{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    <div className="w-[200px]">
                      <Image
                        src="/landing/mockup-elpatron.png"
                        alt="Pase de puntos El Patrón Barber en Apple Wallet"
                        width={564}
                        height={1002}
                        className="w-full h-auto drop-shadow-2xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── 4 Mechanics ─────────────────────────────── */}
      <section className="py-20 sm:py-24 bg-white">
        <div ref={mechanics.ref} className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              4 formas de fidelizar
            </h2>
            <p className="text-gray-500 text-lg">
              Elige la mecánica que mejor funciona para tu negocio
            </p>
          </div>
          <div
            className={`grid sm:grid-cols-2 lg:grid-cols-4 gap-5 anim-stagger ${mechanics.inView ? "is-visible" : ""}`}
          >
            {MECHANICS.map((m) => (
              <Card
                key={m.title}
                className={`bg-gradient-to-b ${m.color} border-0 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-default`}
              >
                <CardContent className="p-6 space-y-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${m.iconBg} text-white flex items-center justify-center shadow-lg`}
                  >
                    {m.icon}
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">{m.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{m.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Social Proof ────────────────────────────── */}
      <section id="social-proof" className="py-20 sm:py-24 bg-gray-50/80">
        <div ref={social.ref} className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              Comercios que ya confían en Cuik
            </h2>
            <p className="text-gray-500 text-lg">Negocios reales, resultados reales</p>
          </div>

          <div className="flex flex-wrap justify-center gap-8 mb-14">
            {[
              { initials: "MV", name: "Mascota Veloz", color: "bg-emerald-500" },
              { initials: "CC", name: "Café Central", color: "bg-orange-500" },
              { initials: "BD", name: "Barbería Don Carlos", color: "bg-blue-600" },
              { initials: "GF", name: "Gym Fitness", color: "bg-purple-500" },
              { initials: "NB", name: "Nail Bar Studio", color: "bg-pink-500" },
              { initials: "PD", name: "Pastelería Dulce", color: "bg-amber-500" },
            ].map((logo) => (
              <div key={logo.initials} className="flex flex-col items-center gap-2 group">
                <div
                  className={`w-14 h-14 rounded-full ${logo.color} flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-110 transition-transform`}
                >
                  {logo.initials}
                </div>
                <span className="text-xs text-gray-500 font-medium">{logo.name}</span>
              </div>
            ))}
          </div>

          <div
            className={`grid md:grid-cols-3 gap-6 anim-stagger ${social.inView ? "is-visible" : ""}`}
          >
            {[
              {
                quote:
                  "Desde que usamos Cuik, nuestros clientes vuelven un 40% más. El pase en el wallet es un game changer.",
                author: "María G.",
                business: "Café Central",
              },
              {
                quote:
                  "Mis clientes ya no pierden las tarjetas de cartón. Todo digital, todo automático.",
                author: "Carlos R.",
                business: "Barbería Don Carlos",
              },
              {
                quote:
                  "La demo con IA nos convenció al instante. En 24 horas teníamos nuestro pase funcionando.",
                author: "Ana P.",
                business: "Mascota Veloz",
              },
            ].map((t) => (
              <Card
                key={t.author}
                className="border border-gray-200 bg-white hover:shadow-lg transition-shadow duration-300"
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        // biome-ignore lint/suspicious/noArrayIndexKey: static star rating display
                        key={i}
                        className="w-4 h-4 fill-amber-400 text-amber-400"
                      />
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed italic">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-sm font-semibold text-gray-900">{t.author}</div>
                    <div className="text-xs text-gray-500">{t.business}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Use Cases ───────────────────────────────── */}
      <section id="casos" className="py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
            Para negocios como el tuyo
          </h2>
          <p className="text-gray-500 text-lg mb-10">
            Funciona para cualquier comercio físico con clientes recurrentes
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {VERTICALS.map((v) => (
              <span
                key={v.label}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700 hover:border-[#0e70db]/40 hover:bg-blue-50/40 hover:text-[#0e70db] transition-all cursor-default shadow-sm"
              >
                <span className="text-[#0e70db]">{v.icon}</span>
                <span>{v.label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─────────────────────────────────── */}
      <section id="precios" className="relative py-20 sm:py-24 grain overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-50/80 to-white pointer-events-none" />
        <div ref={pricing.ref} className="max-w-5xl mx-auto px-4 sm:px-6 relative">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              Elige tu plan
            </h2>
            <p className="text-gray-500 text-lg">Precios en soles peruanos. Sin sorpresas.</p>
          </div>
          <div className="flex justify-center mb-10">
            <div className="bg-white rounded-xl p-1 flex gap-1 border border-gray-200 shadow-sm">
              {(["monthly", "quarterly", "annual"] as const).map((cycle) => (
                <button
                  type="button"
                  key={cycle}
                  onClick={() => setBilling(cycle)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${billing === cycle ? "bg-[#0e70db] text-white shadow-md shadow-blue-200/50" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {cycle === "monthly" ? "Mensual" : cycle === "quarterly" ? "Trimestral" : "Anual"}
                  {cycle === "quarterly" && (
                    <span className="ml-1.5 text-xs font-bold text-emerald-300">-30%</span>
                  )}
                  {cycle === "annual" && (
                    <span className="ml-1.5 text-xs font-bold text-emerald-300">-51%</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`grid gap-6 anim-stagger ${plans.length === 1 ? "max-w-md mx-auto" : plans.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "md:grid-cols-3"} ${pricing.inView ? "is-visible" : ""}`}
          >
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative border-2 transition-all duration-300 hover:shadow-lg ${plan.popular ? "border-[#0e70db] shadow-xl shadow-blue-100/50 md:scale-105" : "border-gray-200 hover:border-gray-300"}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-[#0e70db] text-white px-4 py-1.5 text-xs font-bold shadow-lg shadow-blue-200/50">
                      Más popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-7 space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <div className="mt-3 flex items-end gap-1">
                      <span className="text-4xl font-extrabold text-gray-900">
                        S/{plan.prices[billing]}
                      </span>
                      <span className="text-gray-500 mb-1">/mes</span>
                    </div>
                    {billing !== "monthly" && (
                      <div className="text-xs text-emerald-600 font-semibold mt-1">
                        Ahorras S/
                        {(plan.prices.monthly - plan.prices[billing]) *
                          (billing === "quarterly" ? 3 : 12)}
                        /{billing === "quarterly" ? "trim" : "año"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/login?view=demo">
                    <Button
                      className={`w-full font-bold h-11 rounded-xl transition-all ${plan.popular ? "bg-[#0e70db] hover:bg-[#0c5fc0] text-white shadow-md shadow-blue-200/40 hover:shadow-lg" : "bg-gray-900 hover:bg-gray-800 text-white"}`}
                    >
                      {plan.cta}
                      <ChevronRight className="ml-1 w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-gray-400 text-sm mt-10">
            Todos los planes incluyen 7 días de prueba gratis. Sin tarjeta de crédito.
          </p>
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────── */}
      <section className="relative py-20 sm:py-24 overflow-hidden bg-[#0c3d7a]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-7 relative">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight text-balance">
            ¿Listo para fidelizar a tus clientes?
          </h2>
          <p className="text-blue-200 text-lg max-w-md mx-auto">
            Activa tu demo gratuita de 7 días y compruébalo tú mismo.
          </p>

          <div className="max-w-lg mx-auto pt-2">
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/login?view=demo" className="flex-1">
                <Button
                  size="lg"
                  className="w-full bg-[#ff4810] hover:bg-[#e03f0d] text-white font-bold h-13 rounded-xl shadow-lg shadow-orange-500/20 hover:shadow-xl transition-all text-base group"
                >
                  Solicitar demo gratis
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
              <Link href="/contacto">
                <Button
                  size="lg"
                  className="w-full border-2 border-white/30 bg-transparent text-white font-semibold h-13 rounded-xl hover:bg-white/15 hover:border-white/50 transition-all"
                >
                  Contactar ventas
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-blue-200/70 text-sm">O escríbenos por</span>
            <a
              href="https://wa.me/51999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold text-sm transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>

          <p className="text-blue-300/50 text-sm pt-1">
            Sin compromiso &bull; Sin tarjeta de crédito &bull; Demo en 24hs
          </p>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────── */}
      <footer className="bg-[#0f172a] text-gray-400 py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <Link href="/" className="flex items-center gap-2.5">
                <CuikLogo size="sm" />
                <span className="text-white font-extrabold text-lg tracking-tight">Cuik</span>
              </Link>
              <p className="text-sm leading-relaxed">
                Fidelización digital para comercios físicos en LATAM.
              </p>
              <div className="flex gap-2">
                {[
                  { label: "I", href: "https://instagram.com/cuik.app" },
                  { label: "T", href: "https://tiktok.com/@cuik.app" },
                  { label: "L", href: "https://linkedin.com/company/cuik" },
                ].map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs font-bold text-gray-400 hover:text-white transition-all"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
            {[
              {
                title: "Producto",
                links: [
                  { label: "Beneficios", href: "#beneficios" },
                  { label: "Precios", href: "#precios" },
                  { label: "Casos de uso", href: "#casos" },
                ],
              },
              {
                title: "Recursos",
                links: [
                  { label: "Blog", href: "#" },
                  { label: "Guías", href: "#" },
                  { label: "API Docs", href: "#" },
                ],
              },
              {
                title: "Empresa",
                links: [
                  { label: "Sobre nosotros", href: "#" },
                  { label: "Contacto", href: "/contacto" },
                  { label: "Términos", href: "#" },
                  { label: "Privacidad", href: "#" },
                ],
              },
            ].map((col) => (
              <div key={col.title} className="space-y-3">
                <div className="text-white font-semibold text-sm">{col.title}</div>
                {col.links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    className="block text-sm hover:text-white transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
            <span>© 2026 Cuik. Hecho con amor en Lima, Perú</span>
            <Link
              href="/login?view=demo"
              className="text-[#0e70db] hover:text-blue-400 font-semibold transition-colors"
            >
              Empieza gratis →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
