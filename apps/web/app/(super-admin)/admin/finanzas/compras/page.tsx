import { DocumentsClient } from "../_components/documents-client"

export const dynamic = "force-dynamic"

export default function ComprasPage() {
  return <DocumentsClient direction="purchase" />
}
