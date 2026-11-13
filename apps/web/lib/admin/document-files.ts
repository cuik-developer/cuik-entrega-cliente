/**
 * Files a fiscal document can carry: the printed document (PDF, or a photo of
 * a ticket), the electronic XML (UBL) and SUNAT's CDR (XML or the ZIP it comes
 * in). Pure; shared by the upload and download routes.
 */
export type DocumentFileKind = "pdf" | "xml" | "cdr"

export const DOCUMENT_FILE_RULES: Record<
  DocumentFileKind,
  { exts: string[]; accept: string; label: string; error: string }
> = {
  pdf: {
    exts: ["pdf", "jpg", "jpeg", "png"],
    accept: "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png",
    label: "PDF",
    error: "Solo PDF, JPG o PNG",
  },
  xml: { exts: ["xml"], accept: ".xml,application/xml,text/xml", label: "XML", error: "Solo XML" },
  cdr: {
    exts: ["xml", "zip"],
    accept: ".xml,.zip,application/xml,text/xml,application/zip,application/x-zip-compressed",
    label: "CDR",
    error: "Solo XML o ZIP",
  },
}

/** Extension to store the file with, from its name (the browser's MIME is unreliable for XML/ZIP); null if not allowed. */
export function documentFileExt(
  kind: DocumentFileKind,
  fileName: string,
  _mime: string,
): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? ""
  if (!DOCUMENT_FILE_RULES[kind].exts.includes(ext)) return null
  return ext === "jpeg" ? "jpg" : ext
}

/** Content-Type to serve a stored file with, and whether it may open inline. */
export function documentFileServe(key: string): { type: string; inline: boolean } {
  const ext = key.toLowerCase().split(".").pop() ?? ""
  switch (ext) {
    case "pdf":
      return { type: "application/pdf", inline: true }
    case "jpg":
      return { type: "image/jpeg", inline: true }
    case "png":
      return { type: "image/png", inline: true }
    // XML and ZIP always download: an XML opened inline could run as a page.
    case "xml":
      return { type: "application/xml", inline: false }
    case "zip":
      return { type: "application/zip", inline: false }
    default:
      return { type: "application/octet-stream", inline: false }
  }
}
