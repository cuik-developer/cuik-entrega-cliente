"use client"

import { useRouter } from "next/navigation"
import { signOut } from "@/lib/auth-client"

export function LogoutButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()

  const handleLogout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login")
        },
      },
    })
  }

  return (
    <button type="button" onClick={handleLogout} className={className}>
      {children}
    </button>
  )
}
