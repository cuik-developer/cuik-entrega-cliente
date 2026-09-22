import type { ReactNode } from "react"
import { SiteFooter } from "@/components/landing/site-footer"
import { SiteNav } from "@/components/landing/site-nav"
import { LEGAL } from "@/lib/legal"

export type LegalSection = { id: string; title: string; body: ReactNode }

/**
 * Shared frame for the legal pages: eyebrow, title, "última actualización",
 * a table of contents on the left (desktop) and numbered sections with
 * comfortable reading measure on the right. Same tokens as the home.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
  children,
}: {
  eyebrow: string
  title: string
  intro: string
  sections: LegalSection[]
  /** Optional block rendered after the sections (a form, for instance). */
  children?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      <SiteNav solid />

      <header className="relative overflow-hidden border-b border-gray-100">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-[-40%] left-[5%] w-[520px] h-[520px] rounded-full bg-[#0e70db]/[0.05] blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-10 sm:pb-12">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{eyebrow}</p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-[1.08] text-balance max-w-3xl">
            {title}
          </h1>
          <p className="mt-4 text-lg text-gray-500 max-w-2xl leading-relaxed">{intro}</p>
          <p className="mt-4 text-xs font-medium text-gray-400">
            Última actualización: {LEGAL.lastUpdated}
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Contenido" className="lg:sticky lg:top-24 self-start">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Contenido
          </div>
          <ol className="space-y-1.5 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex gap-2 text-gray-500 hover:text-[#0e70db] transition-colors"
                >
                  <span className="tabular-nums text-gray-300 w-5 shrink-0">{i + 1}.</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="legal max-w-[68ch]">
          <style>{`
            .legal section + section { margin-top: 2.5rem; }
            .legal h2 { scroll-margin-top: 6rem; font-size: 1.25rem; line-height: 1.3; font-weight: 800; letter-spacing: -0.01em; color: #111827; }
            .legal h2 .n { color: #0e70db; margin-right: 0.5rem; font-variant-numeric: tabular-nums; }
            .legal p, .legal li { color: #4b5563; line-height: 1.7; }
            .legal p + p, .legal p + ul, .legal ul + p, .legal p + ol { margin-top: 0.9rem; }
            .legal ul { list-style: disc; padding-left: 1.4rem; }
            .legal ol { list-style: decimal; padding-left: 1.4rem; }
            .legal li + li { margin-top: 0.35rem; }
            .legal strong { color: #111827; font-weight: 600; }
            .legal a { color: #0e70db; font-weight: 500; }
            .legal a:hover { text-decoration: underline; }
            .legal table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 0.9rem; }
            .legal th, .legal td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
            .legal th { color: #111827; font-weight: 600; background: #f9fafb; }
          `}</style>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2>
                <span className="n">{i + 1}.</span>
                {s.title}
              </h2>
              <div className="mt-3">{s.body}</div>
            </section>
          ))}
          {children}
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
