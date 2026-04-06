/**
 * Seed script for development data.
 *
 * Usage: pnpm db:seed
 *
 * Requires the Next.js dev server to be running at http://localhost:3000
 * because seed logic uses Better Auth's API which lives in the web app.
 */

const SEED_URL = process.env.SEED_URL ?? "http://localhost:3000/api/seed"

async function main() {
  console.log(`Seeding via ${SEED_URL} ...`)
  console.log("Make sure the Next.js dev server is running.\n")

  const res = await fetch(SEED_URL)
  const data = await res.json()

  if (!res.ok) {
    console.error("Seed failed:", data)
    process.exit(1)
  }

  console.log("Seed completed successfully!")
  console.log(JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error("Seed error:", err)
  process.exit(1)
})
