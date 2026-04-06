// Stub — client registration moved to /api/[tenant]/register-client
// This route reserved for future client listing/search endpoints
import { errorResponse } from "@/lib/api-utils"

export async function GET() {
  return errorResponse("Use /api/{tenant}/register-client for client registration", 410)
}
