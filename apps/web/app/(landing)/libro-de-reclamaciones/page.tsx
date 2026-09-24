import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LegalPage, type LegalSection } from "@/components/landing/legal-page"
import { LEGAL, LEGAL_PAGES_ENABLED } from "@/lib/legal"
import { ReclamoForm } from "./reclamo-form"

export const metadata: Metadata = {
  title: "Libro de Reclamaciones — Cuik",
  description:
    "Libro de Reclamaciones virtual de Cuik, conforme al Código de Protección y Defensa del Consumidor.",
}

const SECTIONS: LegalSection[] = [
  {
    id: "proveedor",
    title: "Datos del proveedor",
    body: (
      <table>
        <tbody>
          <tr>
            <th>Razón social</th>
            <td>{LEGAL.razonSocial}</td>
          </tr>
          <tr>
            <th>RUC</th>
            <td>{LEGAL.ruc}</td>
          </tr>
          <tr>
            <th>Domicilio</th>
            <td>{LEGAL.domicilio}</td>
          </tr>
          <tr>
            <th>Correo</th>
            <td>
              <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
            </td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    id: "como-funciona",
    title: "Cómo funciona",
    body: (
      <>
        <p>
          Este Libro de Reclamaciones virtual cumple con la Ley N.° 29571, Código de Protección y
          Defensa del Consumidor, y su reglamento (D.S. N.° 011-2011-PCM y modificatorias).
        </p>
        <ul>
          <li>
            <strong>Reclamo:</strong> disconformidad con el producto o servicio contratado.
          </li>
          <li>
            <strong>Queja:</strong> malestar o descontento respecto de la atención recibida.
          </li>
        </ul>
        <p>
          Al enviar el formulario recibirás por correo una copia de tu Hoja de Reclamación con su
          número. Responderemos en un plazo máximo de <strong>15 días hábiles</strong>, prorrogable
          por única vez por otros 15 cuando la naturaleza del caso lo requiera, en cuyo caso te lo
          comunicaremos. La formulación del reclamo no impide acudir a otras vías de solución de
          controversias ni es requisito previo para presentar una denuncia ante INDECOPI.
        </p>
      </>
    ),
  },
]

export default function ReclamacionesPage() {
  if (!LEGAL_PAGES_ENABLED) notFound()
  return (
    <LegalPage
      eyebrow="Legal"
      title="Libro de Reclamaciones"
      intro="Registra aquí tu reclamo o queja. Te enviamos una copia con su número y te respondemos en un máximo de 15 días hábiles."
      sections={SECTIONS}
    >
      <section id="hoja" className="mt-10">
        <h2>
          <span className="n">3.</span>Hoja de Reclamación
        </h2>
        <div className="mt-4">
          <ReclamoForm />
        </div>
      </section>
    </LegalPage>
  )
}
