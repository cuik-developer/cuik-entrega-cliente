import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { LegalPage, type LegalSection } from "@/components/landing/legal-page"
import { LEGAL, LEGAL_PAGES_ENABLED } from "@/lib/legal"
import { CookiePreferences } from "./cookie-preferences"

export const metadata: Metadata = {
  title: "Política de Cookies — Cuik",
  description:
    "Qué cookies usa cuik.org, para qué y cómo aceptarlas, rechazarlas o cambiar tu elección.",
}

const SECTIONS: LegalSection[] = [
  {
    id: "que-es",
    title: "Qué es una cookie",
    body: (
      <p>
        Una cookie es un pequeño archivo de texto que el sitio guarda en tu navegador para
        recordarte entre páginas o entre visitas. Solo la lee el dominio que la creó y puedes
        borrarla cuando quieras desde la configuración del navegador.
      </p>
    ),
  },
  {
    id: "donde",
    title: "Dónde se usan",
    body: (
      <p>
        En {LEGAL.site} y en el panel de administración de Cuik. Los pases en Apple Wallet y Google
        Wallet no usan cookies.
      </p>
    ),
  },
  {
    id: "tipos",
    title: "Qué cookies usamos",
    body: (
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Para qué</th>
            <th>Ejemplos</th>
            <th>¿Requiere consentimiento?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Esenciales</td>
            <td>Mantener tu sesión iniciada en el panel y proteger los formularios.</td>
            <td>Cookies de sesión de autenticación; “cuik_consent”, que guarda tu elección.</td>
            <td>No: sin ellas el sitio no funciona.</td>
          </tr>
          <tr>
            <td>Preferencias</td>
            <td>Recordar ajustes de la interfaz.</td>
            <td>Pestaña o filtro elegido en el panel.</td>
            <td>No.</td>
          </tr>
          <tr>
            <td>Medición</td>
            <td>Entender qué páginas se visitan y desde dónde, para mejorar el sitio.</td>
            <td>
              Microsoft Clarity (“_clck”, “_clsk”, “CLID”, “MUID”, entre otras): mide cómo se navega
              el sitio público. Solo se activa si aceptaste.
            </td>
            <td>Sí.</td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    id: "terceros",
    title: "Cookies de terceros",
    body: (
      <>
        <p>
          Usamos <strong>Microsoft Clarity</strong>, de Microsoft Corporation (Estados Unidos), para
          entender cómo se navega el sitio público: qué páginas se ven, hasta dónde se desplaza la
          gente y dónde hace clic, con grabaciones de la sesión y mapas de calor. El texto que
          escribes queda oculto y Clarity nunca se carga en el Panel, en la caja ni en tu pase. Sus
          cookies duran hasta un año. Más detalle en la{" "}
          <a
            href="https://privacy.microsoft.com/es-es/privacystatement"
            target="_blank"
            rel="noreferrer"
          >
            declaración de privacidad de Microsoft
          </a>
          .
        </p>
        <p>
          Si incorporamos otras herramientas de medición o publicidad, se listarán aquí con su
          proveedor, finalidad y duración antes de activarse.
        </p>
      </>
    ),
  },
  {
    id: "consentimiento",
    title: "Tu elección",
    body: (
      <>
        <p>
          Al entrar por primera vez te mostramos un aviso con dos opciones igual de visibles:{" "}
          <strong>Aceptar</strong> o <strong>Rechazar</strong>. Rechazar no limita el uso del sitio;
          solo evita las cookies de medición. Tu elección se guarda por un año en la cookie
          “cuik_consent”.
        </p>
        <p>Puedes cambiarla ahora mismo:</p>
        <CookiePreferences />
      </>
    ),
  },
  {
    id: "navegador",
    title: "Configurar el navegador",
    body: (
      <p>
        También puedes bloquear o borrar cookies desde tu navegador (Chrome, Safari, Firefox o Edge,
        en Configuración → Privacidad). Si bloqueas las esenciales, el panel de administración no
        podrá mantener tu sesión.
      </p>
    ),
  },
  {
    id: "cambios",
    title: "Cambios en esta política",
    body: (
      <p>
        Actualizaremos esta página cuando cambien las cookies que usamos. Para más información sobre
        el tratamiento de tus datos, consulta la{" "}
        <Link href="/politica-de-privacidad">Política de Privacidad</Link>.
      </p>
    ),
  },
]

export default function CookiesPage() {
  if (!LEGAL_PAGES_ENABLED) notFound()
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de Cookies"
      intro="Qué cookies usa el sitio, para qué sirven y cómo aceptarlas, rechazarlas o cambiar tu elección."
      sections={SECTIONS}
    />
  )
}
