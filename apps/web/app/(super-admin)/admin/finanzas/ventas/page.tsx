import { DocumentsClient } from "../_components/documents-client"

export const dynamic = "force-dynamic"

export default function VentasPage() {
  return <DocumentsClient direction="sale" />
}
