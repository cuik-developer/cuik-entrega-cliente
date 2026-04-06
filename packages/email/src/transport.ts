import type { ReactElement } from "react"
import { Resend } from "resend"

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  template: ReactElement
  from?: string
}

type SendEmailResult = { id: string } | { error: string }

const DEFAULT_FROM = "Cuik <onboarding@resend.dev>"

let resendClient: Resend | null = null

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, template, from } = options
  const sender = from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM
  const recipient = process.env.EMAIL_TEST_TO ?? to

  const client = getClient()

  // Dev preview mode: log to console when no API key is set
  if (!client) {
    console.log("[Email Dev Mode] Would send email:")
    console.log(`  From: ${sender}`)
    console.log(`  To: ${Array.isArray(recipient) ? recipient.join(", ") : recipient}`)
    console.log(`  Subject: ${subject}`)
    console.log("  Template: (React Email component)")
    return { id: `dev-${Date.now()}` }
  }

  try {
    const { data, error } = await client.emails.send({
      from: sender,
      to: Array.isArray(recipient) ? recipient : [recipient],
      subject,
      react: template,
    })

    if (error) {
      console.error("[Email] Resend error:", error)
      return { error: error.message }
    }

    return { id: data?.id ?? "unknown" }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error"
    console.error("[Email] Send failed:", message)
    return { error: message }
  }
}
