import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { LegalPage, type LegalSection } from "@/components/landing/legal-page"
import { LEGAL, LEGAL_PAGES_ENABLED } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Términos y Condiciones — Cuik",
  description: "Condiciones de uso de la plataforma Cuik para negocios y sus clientes.",
}

const SECTIONS: LegalSection[] = [
  {
    id: "sobre-cuik",
    title: "Sobre Cuik",
    body: (
      <>
        <p>
          Cuik es una plataforma de fidelización digital operada por{" "}
          <strong>{LEGAL.razonSocial}</strong>, RUC {LEGAL.ruc}, con domicilio en {LEGAL.domicilio}{" "}
          (en adelante, “Cuik”). Permite a negocios físicos crear programas de lealtad (estampillas,
          puntos, descuentos y cupones de regalo) que sus clientes guardan como pases digitales en
          Apple Wallet y Google Wallet.
        </p>
        <p>
          Estos Términos regulan el uso del sitio {LEGAL.site}, del panel de administración, de la
          app del cajero y de los pases digitales, tanto por los negocios que contratan el servicio
          (“Comercios”) como por sus clientes que se registran en un programa (“Clientes”).
        </p>
      </>
    ),
  },
  {
    id: "aceptacion",
    title: "Aceptación",
    body: (
      <p>
        Al crear una cuenta, solicitar una demo, registrarse en el programa de un Comercio o añadir
        un pase a su Wallet, la persona declara haber leído y aceptado estos Términos y la{" "}
        <Link href="/politica-de-privacidad">Política de Privacidad</Link>. Si no está de acuerdo,
        debe abstenerse de usar la plataforma.
      </p>
    ),
  },
  {
    id: "definiciones",
    title: "Definiciones",
    body: (
      <ul>
        <li>
          <strong>Comercio:</strong> negocio que contrata Cuik para gestionar su programa de
          fidelización.
        </li>
        <li>
          <strong>Cliente:</strong> persona que se registra en el programa de un Comercio y recibe
          un pase digital.
        </li>
        <li>
          <strong>Pase:</strong> tarjeta digital en Apple Wallet o Google Wallet que representa la
          participación del Cliente en un programa.
        </li>
        <li>
          <strong>Visita, sello, punto y premio:</strong> registros y beneficios definidos por cada
          Comercio según la mecánica que elija.
        </li>
        <li>
          <strong>Panel:</strong> herramienta web con la que el Comercio administra su programa, sus
          clientes y sus campañas.
        </li>
      </ul>
    ),
  },
  {
    id: "servicio",
    title: "El servicio para Comercios",
    body: (
      <>
        <p>
          Cuik ofrece planes de suscripción cuyo alcance, precio y período de prueba se publican en{" "}
          <Link href="/#precios">cuik.org</Link>. El período de prueba gratuito no requiere tarjeta
          de crédito y termina automáticamente si no se contrata un plan.
        </p>
        <p>
          El Comercio es responsable de las reglas de su programa (número de sellos, premios,
          descuentos, vigencias) y de cumplirlas frente a sus Clientes. Cuik provee la tecnología
          para registrarlas y comunicarlas, pero no es parte de la relación comercial entre el
          Comercio y su Cliente ni garantiza la entrega de premios.
        </p>
        <p>
          El Comercio se obliga a usar los datos de sus Clientes únicamente para operar su programa
          y enviar comunicaciones relacionadas con él, respetando la Ley N.° 29733 y la{" "}
          <Link href="/politica-de-privacidad">Política de Privacidad</Link>.
        </p>
      </>
    ),
  },
  {
    id: "clientes",
    title: "El servicio para Clientes",
    body: (
      <>
        <p>
          Registrarse en un programa es gratuito para el Cliente. El pase se añade a su Wallet desde
          un enlace o un código QR y se actualiza automáticamente cuando el Comercio registra una
          visita, un canje o un cambio en el programa.
        </p>
        <p>
          El Cliente puede eliminar el pase de su Wallet en cualquier momento y solicitar la baja de
          su registro escribiendo a{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> o directamente al
          Comercio.
        </p>
      </>
    ),
  },
  {
    id: "cuentas",
    title: "Cuentas y seguridad",
    body: (
      <ul>
        <li>
          Las credenciales del Panel y de la app del cajero son personales. El Comercio responde por
          el uso que hagan las personas a quienes dé acceso.
        </li>
        <li>
          Debe notificarnos de inmediato cualquier uso no autorizado a{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </li>
        <li>
          Cuik puede suspender cuentas ante indicios de fraude, uso abusivo, registros faleres de
          visitas o incumplimiento de estos Términos.
        </li>
      </ul>
    ),
  },
  {
    id: "pagos",
    title: "Pagos, renovación y cancelación",
    body: (
      <>
        <p>
          Los planes se cobran por adelantado según la periodicidad elegida (mensual, trimestral o
          anual) y se renuevan automáticamente salvo cancelación previa. Los precios se expresan en
          soles e incluyen los impuestos aplicables cuando así se indique.
        </p>
        <p>
          El Comercio puede cancelar en cualquier momento desde el Panel o escribiéndonos; la
          cancelación surte efecto al final del período pagado. No se realizan devoluciones por
          períodos parciales, salvo error atribuible a Cuik.
        </p>
      </>
    ),
  },
  {
    id: "disponibilidad",
    title: "Disponibilidad y mantenimiento",
    body: (
      <p>
        Cuik procura una disponibilidad continua, pero el servicio puede interrumpirse por
        mantenimiento, fallas de terceros (Apple, Google, proveedores de hosting o de mensajería) o
        causas de fuerza mayor. Avisaremos con anticipación razonable los mantenimientos
        programados.
      </p>
    ),
  },
  {
    id: "uso-permitido",
    title: "Uso permitido",
    body: (
      <p>
        Queda prohibido usar la plataforma para actividades ilícitas, enviar comunicaciones no
        solicitadas a personas que no se hayan registrado, registrar visitas o canjes ficticios,
        intentar acceder a datos de otros Comercios, realizar ingeniería inversa o sobrecargar
        deliberadamente el servicio.
      </p>
    ),
  },
  {
    id: "propiedad",
    title: "Propiedad intelectual",
    body: (
      <p>
        El software, el diseño, la marca Cuik y los contenidos de la plataforma son propiedad de{" "}
        {LEGAL.razonSocial}. Las marcas, logotipos y diseños de cada Comercio siguen siendo de su
        propiedad; el Comercio autoriza a Cuik a reproducirlos únicamente para generar y mostrar sus
        pases y comunicaciones. Apple Wallet y Google Wallet son marcas de sus respectivos
        titulares.
      </p>
    ),
  },
  {
    id: "responsabilidad",
    title: "Limitación de responsabilidad",
    body: (
      <p>
        Cuik no responde por daños indirectos, lucro cesante ni pérdida de datos derivados del uso o
        imposibilidad de uso del servicio, ni por decisiones que el Comercio tome a partir de la
        información del Panel. En cualquier caso, la responsabilidad total de Cuik frente a un
        Comercio se limita al monto pagado por este en los tres meses anteriores al hecho que la
        origina.
      </p>
    ),
  },
  {
    id: "reclamos",
    title: "Reclamos y atención",
    body: (
      <p>
        Cuik cuenta con un <Link href="/libro-de-reclamaciones">Libro de Reclamaciones</Link>{" "}
        virtual, conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571) y su
        reglamento. También puede escribirnos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>{" "}
        o por los canales de <Link href="/contacto">Contáctanos</Link>.
      </p>
    ),
  },
  {
    id: "modificaciones",
    title: "Modificaciones",
    body: (
      <p>
        Podemos actualizar estos Términos por cambios en el servicio o en la normativa. La versión
        vigente se publica en esta página con su fecha de actualización; los cambios sustanciales se
        comunicarán a los Comercios por correo con al menos 15 días de anticipación.
      </p>
    ),
  },
  {
    id: "ley",
    title: "Ley aplicable y jurisdicción",
    body: (
      <p>
        Estos Términos se rigen por las leyes de la República del Perú. Cualquier controversia se
        someterá a los jueces y tribunales de Lima, sin perjuicio de los derechos que asisten al
        consumidor ante INDECOPI.
      </p>
    ),
  },
]

export default function TerminosPage() {
  if (!LEGAL_PAGES_ENABLED) notFound()
  return (
    <LegalPage
      eyebrow="Legal"
      title="Términos y Condiciones"
      intro="Las reglas de uso de Cuik para los negocios que contratan la plataforma y para los clientes que guardan sus pases."
      sections={SECTIONS}
    />
  )
}
