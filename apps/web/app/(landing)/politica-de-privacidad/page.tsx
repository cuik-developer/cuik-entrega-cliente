import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage, type LegalSection } from "@/components/landing/legal-page"
import { LEGAL } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Política de Privacidad — Cuik",
  description:
    "Qué datos personales trata Cuik, con qué finalidad, con quién los comparte y cómo ejercer tus derechos ARCO.",
}

const SECTIONS: LegalSection[] = [
  {
    id: "objetivo",
    title: "Objetivo",
    body: (
      <p>
        Esta política explica cómo <strong>{LEGAL.razonSocial}</strong> (“Cuik”), RUC {LEGAL.ruc},
        recopila, usa, conserva y protege los datos personales de quienes visitan {LEGAL.site},
        contratan la plataforma como Comercios o se registran como Clientes en el programa de un
        Comercio.
      </p>
    ),
  },
  {
    id: "legislacion",
    title: "Legislación aplicable",
    body: (
      <p>
        Cumplimos la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento aprobado
        por Decreto Supremo N.° 016-2024-JUS, así como las directivas de la Autoridad Nacional de
        Protección de Datos Personales (ANPD).
      </p>
    ),
  },
  {
    id: "datos",
    title: "Qué datos recopilamos",
    body: (
      <>
        <p>
          <strong>Si visitás el sitio:</strong> datos técnicos de navegación (dirección IP,
          navegador, páginas vistas) y, solo si aceptas las cookies de medición, estadísticas de
          uso. Ver la <Link href="/politica-de-cookies">Política de Cookies</Link>.
        </p>
        <p>
          <strong>Si eres un Comercio:</strong> nombre del negocio, RUC, rubro, dirección, datos de
          contacto del responsable y de los usuarios del Panel, datos de facturación y la
          configuración de tu programa.
        </p>
        <p>
          <strong>Si eres Cliente de un Comercio:</strong> nombre, correo, teléfono y, si el
          Comercio lo pregunta, fecha de cumpleaños u otros campos que él defina; además, tus
          visitas, sellos, puntos y canjes, y el estado de tu pase en Apple Wallet o Google Wallet.
        </p>
        <p>
          <strong>Si nos escribes por Contáctanos o el Libro de Reclamaciones:</strong> los datos
          que incluyas en el formulario.
        </p>
      </>
    ),
  },
  {
    id: "finalidad",
    title: "Para qué usamos los datos",
    body: (
      <ul>
        <li>Prestar el servicio: crear y actualizar pases, registrar visitas y canjes.</li>
        <li>Permitir que cada Comercio administre su programa y se comunique con sus Clientes.</li>
        <li>
          Enviar notificaciones del programa al pase (por ejemplo, un sello nuevo o un premio).
        </li>
        <li>Atender solicitudes, consultas y reclamos.</li>
        <li>Facturar y cumplir obligaciones legales y tributarias.</li>
        <li>Mejorar la plataforma con estadísticas agregadas y anonimizadas.</li>
        <li>
          Enviar novedades de Cuik a los Comercios y a quienes lo hayan autorizado expresamente.
        </li>
      </ul>
    ),
  },
  {
    id: "roles",
    title: "Quién es responsable de cada dato",
    body: (
      <>
        <p>
          Respecto de los datos de los Comercios y de los visitantes del sitio, Cuik es el{" "}
          <strong>titular del banco de datos</strong>.
        </p>
        <p>
          Respecto de los datos de los Clientes de un Comercio, el <strong>Comercio</strong> es el
          titular del banco de datos y decide las finalidades de su programa; Cuik actúa como{" "}
          <strong>encargado del tratamiento</strong> por cuenta del Comercio, conforme a lo previsto
          en la Ley N.° 29733, y solo trata eeres datos según sus instrucciones y esta política.
        </p>
        <p>Banco de datos de Cuik inscrito ante la ANPD: {LEGAL.bancoDatosCodigo}.</p>
      </>
    ),
  },
  {
    id: "terceros",
    title: "Con quién compartimos los datos",
    body: (
      <>
        <p>Compartimos datos únicamente cuando es necesario para prestar el servicio:</p>
        <ul>
          <li>
            <strong>Apple y Google</strong>, para emitir y actualizar los pases en sus Wallets.
          </li>
          <li>
            <strong>Proveedores de infraestructura y correo</strong> (hosting, almacenamiento, envío
            de notificaciones y correos transaccionales).
          </li>
          <li>
            <strong>El Comercio</strong> del programa en el que te registraste, que ve tus datos y
            tu actividad en su Panel.
          </li>
          <li>
            <strong>Autoridades</strong>, cuando una ley o un mandato judicial lo exija.
          </li>
        </ul>
        <p>No vendemos datos personales ni los cedemos con fines publicitarios de terceros.</p>
      </>
    ),
  },
  {
    id: "transferencia",
    title: "Flujo transfronterizo",
    body: (
      <p>
        Nuestros servidores y proveedores pueden estar ubicados fuera del Perú (por ejemplo, en
        Estados Unidos o la Unión Europea). Realizamos estas transferencias con proveedores que
        ofrecen garantías de seguridad y confidencialidad adecuadas, conforme al Reglamento de la
        Ley N.° 29733.
      </p>
    ),
  },
  {
    id: "conservacion",
    title: "Conservación",
    body: (
      <p>
        Conservamos los datos mientras exista la relación con el Comercio o mientras el Cliente
        mantenga su registro en un programa. Al cancelarse el servicio o solicitarse la baja, los
        datos se eliminan o anonimizan en un plazo máximo de 90 días, salvo aquellos que debamos
        conservar por obligación legal (por ejemplo, comprobantes de pago).
      </p>
    ),
  },
  {
    id: "seguridad",
    title: "Seguridad",
    body: (
      <p>
        Aplicamos medidas técnicas y organizativas: cifrado en tránsito, cifrado de credenciales
        sensibles, control de acceeres por rol, registros de actividad y copias de seguridad. Ante
        un incidente que afecte datos personales, lo notificaremos a la ANPD y a los titulares
        afectados dentro de los plazos que fija el Reglamento.
      </p>
    ),
  },
  {
    id: "derechos",
    title: "Tus derechos (ARCO)",
    body: (
      <>
        <p>
          Puedes ejercer tus derechos de{" "}
          <strong>acceso, rectificación, cancelación y oposición</strong>, así como revocar tu
          consentimiento, escribiendo a{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> con el asunto “Datos
          personales”, indicando tu nombre y el Comercio del programa, si corresponde. Responderemos
          en los plazos legales: hasta 8 días hábiles para información, 20 para acceso y 10 para
          rectificación, cancelación u oposición.
        </p>
        <p>
          Si eres Cliente de un Comercio, también puedes dirigirte directamente a él. Si consideras
          que tu solicitud no fue atendida, puedes acudir a la ANPD.
        </p>
      </>
    ),
  },
  {
    id: "menores",
    title: "Menores de edad",
    body: (
      <p>
        La plataforma no está dirigida a menores de 14 años. Si detectamos datos de un menor
        registrados sin autorización de sus padres o tutores, los eliminaremos.
      </p>
    ),
  },
  {
    id: "cambios",
    title: "Cambios en esta política",
    body: (
      <p>
        Publicaremos cualquier cambio en esta página con su fecha de actualización. Si el cambio
        afecta de forma sustancial el tratamiento de tus datos, te lo comunicaremos por correo.
      </p>
    ),
  },
]

export default function PrivacidadPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de Privacidad"
      intro="Qué datos tratamos, para qué, con quién los compartimos y cómo ejercer tus derechos."
      sections={SECTIONS}
    />
  )
}
