import Image from "next/image"
import { cn } from "@/lib/utils"

type Size = "sm" | "md" | "lg"

const sizeMap: Record<Size, string> = {
  sm: "w-7 h-7 rounded-md",
  md: "w-8 h-8 rounded-lg",
  lg: "w-16 h-16 rounded-2xl shadow-xl",
}

export function CuikLogo({ size = "md", className }: { size?: Size; className?: string }) {
  const dimensions = size === "lg" ? 64 : size === "md" ? 32 : 28
  return (
    <Image
      src="/logo.jpeg"
      alt="Cuik"
      width={dimensions}
      height={dimensions}
      className={cn(sizeMap[size], className)}
    />
  )
}
