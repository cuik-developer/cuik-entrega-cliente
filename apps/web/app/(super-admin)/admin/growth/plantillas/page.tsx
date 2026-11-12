import { redirect } from "next/navigation"

import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { currentAdminAccess } from "@/lib/admin-access"
import { AUDIENCES } from "@/lib/growth/audiences"
import { TEMPLATE_BY_KEY, TEMPLATE_VARIABLES, TEMPLATES } from "@/lib/growth/templates"

export const dynamic = "force-dynamic"

/**
 * Growth › Plantillas y audiencias: the catalog Cuik ships for pet shops,
 * read-only for now (the merchant edits the text when creating a send; a
 * tenant's audiences are switched off in Reglas por comercio).
 */
export default async function PlantillasPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") redirect("/admin")

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Growth", href: "/admin" }, { label: "Plantillas y audiencias" }]}
        title="Plantillas y audiencias"
        subtitle="El catálogo de Cuik para tiendas de mascotas: qué audiencia existe, con qué regla, y la plantilla sugerida para cada una. El comercio ajusta el texto al crear cada envío; una audiencia se apaga por comercio en Reglas."
      />

      <Notice tone="info">
        Canales hoy: WhatsApp 1 a 1 desde Cuik (enlace con el mensaje escrito) y exportar lista para
        una herramienta masiva. Correo (Resend) y WhatsApp Business API quedan para la fase 2.
      </Notice>

      <Panel>
        <PanelHeader title={`Audiencias (${AUDIENCES.length})`} />
        <DataTable>
          <thead>
            <tr>
              <Th>Audiencia</Th>
              <Th>Regla de Cuik</Th>
              <Th>Plantilla sugerida</Th>
              <Th className="text-right">Prioridad</Th>
              <Th>Tipo</Th>
            </tr>
          </thead>
          <tbody>
            {AUDIENCES.map((a) => (
              <Tr key={a.slug}>
                <Td className="font-medium">{a.name}</Td>
                <Td className="text-ent-fg-2 whitespace-normal max-w-[460px]">{a.rule}</Td>
                <Td className="text-ent-fg-2">
                  {TEMPLATE_BY_KEY.get(a.templateKey as never)?.name ?? a.templateKey}
                </Td>
                <Td className="text-right tabular-nums text-ent-fg-2">{a.priority}</Td>
                <Td>
                  {a.informational ? (
                    <StatusChip tone="info">Informativa</StatusChip>
                  ) : (
                    <StatusChip tone="ok">Con envíos</StatusChip>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
        <div className="px-3 py-2 text-[11.5px] text-ent-fg-3 border-t border-ent-line">
          Un cliente en varias audiencias recibe un solo mensaje: gana la de menor número de
          prioridad (Recompra, En riesgo, Antipulgas, cross-sell, Tarjeta).
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={`Plantillas (${TEMPLATES.length})`} />
        <div className="divide-y divide-ent-line">
          {TEMPLATES.map((t) => (
            <div key={t.key} className="px-3 py-2.5">
              <div className="text-[12.5px] font-medium text-ent-fg">{t.name}</div>
              <div className="text-[12.5px] text-ent-fg-2 mt-0.5">{t.text}</div>
            </div>
          ))}
        </div>
        <div className="px-3 py-2 text-[11.5px] text-ent-fg-3 border-t border-ent-line">
          Variables: {TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(" ")}. Una frase cuyo dato falte
          para un cliente se omite entera; {"{mascota}"} es el nombre registrado o "tu perro" / "tu
          gato" según lo que compra.
        </div>
      </Panel>
    </div>
  )
}
