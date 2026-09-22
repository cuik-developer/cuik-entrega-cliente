import { Clock, Instagram, Mail } from "lucide-react"
import type { Metadata } from "next"
import { CONTACT_EMAIL, INSTAGRAM_URL, SiteFooter } from "@/components/landing/site-footer"
import { SiteNav } from "@/components/landing/site-nav"
import { ContactExperience } from "./_components/contact-experience"

export const metadata: Metadata = {
  title: "Contáctanos — Cuik",
  description:
    "Cuéntanos qué te trae por aquí y te responde una persona del equipo en menos de un día hábil. WhatsApp siempre a un toque.",
}

export default function ContactoPage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      <SiteNav solid />
      <ContactExperience />

      {/* One quiet line of channels; the conversation above is the page. */}
      <section className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-10 text-sm text-gray-500">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 hover:text-gray-900 transition-colors"
          >
            <Mail className="w-4 h-4 text-[#0e70db]" /> {CONTACT_EMAIL}
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 hover:text-gray-900 transition-colors"
          >
            <Instagram className="w-4 h-4 text-pink-500" /> @cuik.ia
          </a>
          <span className="inline-flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" /> Lunes a viernes, 9:00 a 18:00 (Lima)
          </span>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
