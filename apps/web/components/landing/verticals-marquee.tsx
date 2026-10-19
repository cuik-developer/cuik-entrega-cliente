import {
  Cake,
  Car,
  Coffee,
  Dumbbell,
  PawPrint,
  Scissors,
  Shirt,
  Sparkles,
  Trophy,
  UtensilsCrossed,
} from "lucide-react"
import type { ReactNode } from "react"

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

/** The scrolling band of business types, shared by the home and Sobre Cuik. */
export function VerticalsMarquee() {
  return (
    <section className="py-6 bg-gray-50/80 border-y border-gray-100/80 overflow-hidden">
      <style>{`
        @keyframes verticals-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @media (prefers-reduced-motion: reduce) { .verticals-track { animation: none !important; } }
      `}</style>
      <div
        className="verticals-track flex gap-10 w-max"
        style={{ animation: "verticals-marquee 25s linear infinite" }}
      >
        {[...VERTICALS, ...VERTICALS].map((v, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: duplicated marquee items need index keys
            key={i}
            className="flex items-center gap-2 text-gray-400 whitespace-nowrap select-none"
            aria-hidden={i >= VERTICALS.length}
          >
            <span className="text-[#0e70db]/40">{v.icon}</span>
            <span className="text-sm font-medium tracking-wide">{v.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
