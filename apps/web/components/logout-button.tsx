"use client"

import { useRouter } from "next/navigation"
import { signOut } from "@/lib/auth-client"

export function LogoutButton({ children, className, ...rest }: React.ComponentProps<"button">) {
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
    <button type="button" {...rest} onClick={handleLogout} className={className}>
      {children}
    </button>
  )
}
