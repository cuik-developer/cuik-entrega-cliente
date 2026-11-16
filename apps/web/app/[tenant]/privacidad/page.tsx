import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LegalPage, type LegalSection } from "@/components/landing/legal-page"
import { LEGAL } from "@/lib/legal"
import {
  type MerchantPrivacyIdentity,
  merchantPrivacyIdentity,
  PRIVACY_NOTICE_UPDATED,
  preferencesPath,
} from "@/lib/privacy/notice"

/**
 * Privacy notice of one merchant's loyalty program: the merchant is the
 * titular of its clients' data and Cuik the encargado (Ley 29733). Linked from
 * the registration checkbox and from the pass; one page per program.
 */

type Params = { params: Promise<{ tenant: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenant } = await params
  const merchant = await merchantPrivacyIdentity(tenant).catch(() => null)
  return {
    title: merchant ? `Aviso de privacidad — ${merchant.name}` : "Aviso de privacidad",
    description: merchant
      ? `Cómo ${merchant.name} trata los datos de los clientes de su programa de fidelización.`
      : undefined,
  }
}

function titularLine(m: MerchantPrivacyIdentity) {
  if (!m.complete) {
    return (
      <p>
        <strong>{m.name}</strong> es el titular del banco de datos de los clientes de su programa de
        fidelización y decide para qué se usan.
      </p>
    )
  }
  return (
    <p>
      <strong>{m.razonSocial}</strong> (“{m.name}”), RUC {m.ruc}, con domicilio en {m.direccion}, es
      el titular del banco de datos de los clientes de su programa de fidelización y decide para qué
      se usan.
    </p>
  )
}

function sections(m: MerchantPrivacyIdentity): LegalSection[] {
  const contact = m.contactEmail ?? LEGAL.privacyEmail
  return [
    {
      id: "responsable",
      title: "Quién es responsable de tus datos",
      body: (
        <>
          {titularLine(m)}
          <p>
            {LEGAL.razonSocial} (“Cuik”), RUC {LEGAL.ruc}, presta la plataforma del programa y trata
            tus datos como <strong>encargado del tratamiento</strong>: solo por cuenta de {m.name},
            según sus instrucciones, y nunca para fines propios ni para otros comercios.
          </p>
        </>
      ),
    },
    {
      id: "datos",
      title: "Qué datos se tratan",
      body: (
        <ul>
          <li>
            Los que das al inscribirte: nombre, apellido, DNI, correo, teléfono y, si el programa
            los pide, tu cumpleaños u otros datos que {m.name} defina.
          </li>
          <li>
            Tu actividad en el programa: visitas, sellos, puntos, premios y canjes, y el estado de
            tu pase en Apple Wallet o Google Wallet.
          </li>
          <li>
            Si {m.name} conecta su sistema de ventas, las compras que haces en sus tiendas (fecha,
            local, productos e importe), asociadas a tu DNI.
          </li>
        </ul>
      ),
    },
    {
      id: "finalidades",
      title: "Para qué se usan",
      body: (
        <>
          <ul>
            <li>Darte tu tarjeta del programa, registrar tus visitas y entregarte tus premios.</li>
            <li>
              Enviarte avisos del programa en tu pase, como un sello nuevo, un premio o una novedad
              del comercio. Puedes desactivarlos cuando quieras desde la configuración del pase en
              tu Wallet.
            </li>
            <li>
              Analizar tu frecuencia de visita y tus compras para que {m.name} mejore su programa y
              su atención.
            </li>
            <li>
              <strong>Solo si lo autorizas:</strong> que {m.name} te contacte por WhatsApp o correo
              con promociones y novedades.
            </li>
          </ul>
          <p>
            Inscribirte en el programa requiere aceptar las tres primeras finalidades. La cuarta es
            voluntaria: no aceptarla no cambia tu tarjeta ni tus beneficios.
          </p>
        </>
      ),
    },
    {
      id: "promociones",
      title: "Tu autorización de promociones",
      body: (
        <p>
          Puedes dar o retirar tu autorización en cualquier momento en{" "}
          <a href={preferencesPath(m.slug)}>
            {LEGAL.site.replace(/^https?:\/\//, "")}
            {preferencesPath(m.slug)}
          </a>
          . Te enviaremos un enlace a tu correo para confirmar el cambio, y guardamos la fecha de
          cada cambio.
        </p>
      ),
    },
    {
      id: "terceros",
      title: "Con quién se comparten",
      body: (
        <>
          <p>
            Tus datos los ve {m.name} en su panel. Para prestar el servicio, Cuik se apoya en
            proveedores de infraestructura, correo y emisión de pases (Apple y Google), que pueden
            estar fuera del Perú, por ejemplo en Estados Unidos o la Unión Europea.
          </p>
          <p>
            Estas transferencias se hacen con proveedores que ofrecen garantías de seguridad y
            confidencialidad adecuadas, conforme al Reglamento de la Ley N.° 29733. No se venden tus
            datos ni se ceden a terceros con fines publicitarios.
          </p>
        </>
      ),
    },
    {
      id: "conservacion",
      title: "Cuánto tiempo se conservan",
      body: (
        <p>
          Mientras sigas inscrito en el programa. Si pides la baja, tus datos se eliminan o
          anonimizan en un plazo máximo de 90 días, salvo los que deban conservarse por una
          obligación legal.
        </p>
      ),
    },
    {
      id: "derechos",
      title: "Tus derechos",
      body: (
        <>
          <p>
            Puedes ejercer tus derechos de{" "}
            <strong>acceso, rectificación, cancelación y oposición</strong>, y revocar tu
            consentimiento, escribiendo a <a href={`mailto:${contact}`}>{contact}</a> con el asunto
            “Datos personales” e indicando tu nombre y DNI.
          </p>
          {m.contactEmail ? (
            <p>
              También puedes escribir a Cuik, que lo trasladará a {m.name}:{" "}
              <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
            </p>
          ) : null}
          <p>
            Si consideras que tu solicitud no fue atendida, puedes acudir a la Autoridad Nacional de
            Protección de Datos Personales.
          </p>
        </>
      ),
    },
  ]
}

export default async function MerchantPrivacyPage({ params }: Params) {
  const { tenant } = await params
  const merchant = await merchantPrivacyIdentity(tenant)
  if (!merchant) notFound()
  return (
    <LegalPage
      eyebrow={merchant.name}
      title="Aviso de privacidad del programa"
      intro={`Cómo se tratan tus datos como cliente del programa de fidelización de ${merchant.name}.`}
      updated={PRIVACY_NOTICE_UPDATED}
      sections={sections(merchant)}
    />
  )
}
