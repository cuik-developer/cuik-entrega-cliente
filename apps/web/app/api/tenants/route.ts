// Stub — tenant management moved to /api/admin/tenants
// This route reserved for future public-facing tenant endpoints
import { errorResponse } from "@/lib/api-utils"

export async function GET() {
  return errorResponse("Use /api/admin/tenants for tenant management", 410)
}
