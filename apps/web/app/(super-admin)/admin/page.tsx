import Link from "next/link"
import { NoAccess } from "@/components/admin/admin-access"
import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
import { type AdminModuleKey, UPCOMING_MODULES, visibleModules } from "@/lib/admin/admin-modules"
import { type HomePending, loadHomePendings } from "@/lib/admin/home-pendings"
import { currentAdminAccess } from "@/lib/admin-access"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const STRIPE = {
  bad: "border-l-ent-bad",
  warn: "border-l-ent-warn",
  info: "border-l-ent-info",
} as const

/**
 * Super-admin launcher: one card per module (Odoo apps / Oracle springboard),
 * then "Pendientes" across modules. Inside a module the side menu only shows
 * that module; the grid button in the top bar comes back here.
 */
export default async function AdminHome() {
  const { session, access } = await currentAdminAccess()
  const modules = visibleModules(access)
  if (modules.length === 0) return <NoAccess access={access} />

  const pendings = await loadHomePendings(access).catch((err) => {
    console.error("[admin home] pendings", err)
    return null
  })
  const byModule = new Map<AdminModuleKey, number>()
  for (const p of pendings ?? []) byModule.set(p.module, (byModule.get(p.module) ?? 0) + 1)
  const labelOf = new Map(modules.map((m) => [m.module.key, m.module.label]))
  const firstName = session?.user.name?.split(" ")[0]

  return (
    <div className="max-w-[1000px] mx-auto space-y-6 py-2 lg:py-4">
      <div>
        <h1 className="text-[19px] leading-7 font-semibold text-ent-fg tracking-[-0.005em]">
          {firstName ? `Hola, ${firstName}` : "Inicio"}
        </h1>
        <div className="text-[12.5px] text-ent-fg-3 mt-0.5">Elige un módulo para empezar.</div>
      </div>

      <nav
        aria-label="Módulos"
        className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]"
      >
        {modules.map(({ module, href }) => {
          const n = byModule.get(module.key) ?? 0
          return (
            <Link
              key={module.key}
              href={href}
              style={{ borderTopColor: module.rule }}
              className="group relative flex flex-col items-start gap-1.5 bg-ent-panel border border-ent-line border-t-2 rounded-[4px] px-4 pt-4 pb-3.5 hover:border-ent-line-strong hover:!border-t-ent-accent transition-colors"
            >
              {n > 0 && (
                <span
                  className="absolute top-2.5 right-2.5 min-w-[18px] h-[18px] px-[5px] rounded-full bg-ent-bad text-white text-[11px] font-semibold grid place-items-center"
                  title={`${n} ${n === 1 ? "pendiente" : "pendientes"}`}
                >
                  {n}
                </span>
              )}
              <module.icon className="w-6 h-6 text-ent-fg mb-2" strokeWidth={1.5} aria-hidden />
              <span className="text-[13.5px] font-semibold text-ent-fg">{module.label}</span>
              <span className="text-[11.5px] leading-[1.35] text-ent-fg-3">
                {module.description}
              </span>
              <span className="mt-1.5 text-[12px] text-ent-accent group-hover:underline">
                Abrir
              </span>
            </Link>
          )
        })}
        {access.kind === "super_admin" &&
          UPCOMING_MODULES.map((m) => (
            <div
              key={m.label}
              aria-disabled="true"
              className="flex flex-col items-start gap-1.5 bg-ent-panel border border-ent-line border-t-2 rounded-[4px] px-4 pt-4 pb-3.5 opacity-55"
            >
              <m.icon className="w-6 h-6 text-ent-fg-2 mb-2" strokeWidth={1.5} aria-hidden />
              <span className="text-[13.5px] font-semibold text-ent-fg-2">{m.label}</span>
              <span className="text-[11.5px] leading-[1.35] text-ent-fg-3">{m.description}</span>
              <span className="mt-1.5 text-[12px] text-ent-fg-3">Próximamente</span>
            </div>
          ))}
      </nav>

      <Panel>
        <PanelHeader
          title="Pendientes"
          actions={
            pendings && (
              <span className="text-[12px] font-normal text-ent-fg-3">
                {pendings.length === 0 ? "Nada por atender" : `${pendings.length} por atender`}
              </span>
            )
          }
        />
        {pendings === null ? (
          <PanelMessage>No se pudieron cargar los pendientes. Recarga la página.</PanelMessage>
        ) : pendings.length === 0 ? (
          <PanelMessage>Todo al día. Aquí aparecerá lo que necesite atención.</PanelMessage>
        ) : (
          <ul>
            {pendings.map((p) => (
              <PendingRow key={p.key} pending={p} module={labelOf.get(p.module) ?? ""} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function PendingRow({ pending, module }: { pending: HomePending; module: string }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2 border-l-[3px] border-b border-b-ent-line last:border-b-0 text-[12.5px] text-ent-fg-2",
        STRIPE[pending.tone],
      )}
    >
      <span className="hidden sm:block w-[96px] shrink-0 text-[10.5px] uppercase tracking-[0.06em] text-ent-fg-3">
        {module}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-ent-fg">{pending.lead}</span> {pending.text}
      </span>
      <Link href={pending.href} className="shrink-0 text-[12px] text-ent-accent hover:underline">
        Abrir
      </Link>
    </li>
  )
}
