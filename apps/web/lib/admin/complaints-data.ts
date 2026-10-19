import { complaints, db, desc, eq, user } from "@cuik/db"
import { limaYmd } from "@/lib/business-days"

/** Libro de Reclamaciones screen: every sheet, newest first, with who answered it. */
export async function loadComplaints() {
  const rows = await db
    .select({
      id: complaints.id,
      numero: complaints.numero,
      tipo: complaints.tipo,
      nombre: complaints.nombre,
      documentoTipo: complaints.documentoTipo,
      documento: complaints.documento,
      domicilio: complaints.domicilio,
      telefono: complaints.telefono,
      email: complaints.email,
      menor: complaints.menor,
      apoderado: complaints.apoderado,
      bienTipo: complaints.bienTipo,
      bienDescripcion: complaints.bienDescripcion,
      monto: complaints.monto,
      detalle: complaints.detalle,
      pedido: complaints.pedido,
      status: complaints.status,
      dueOn: complaints.dueOn,
      answer: complaints.answer,
      answeredAt: complaints.answeredAt,
      answeredByName: user.name,
      emailStatus: complaints.emailStatus,
      createdAt: complaints.createdAt,
      updatedAt: complaints.updatedAt,
    })
    .from(complaints)
    .leftJoin(user, eq(user.id, complaints.answeredBy))
    .orderBy(desc(complaints.createdAt))
  return {
    today: limaYmd(),
    complaints: rows.map((r) => ({
      ...r,
      monto: r.monto === null ? null : Number(r.monto),
      answeredAt: r.answeredAt ? r.answeredAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  }
}

export type ComplaintsData = Awaited<ReturnType<typeof loadComplaints>>
export type ComplaintRow = ComplaintsData["complaints"][number]
