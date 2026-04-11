"use client"

import type { AgentMeta } from "@/lib/office/agents"

interface AgentAvatarProps {
  agent: AgentMeta
  size?: "sm" | "md"
}

export function AgentAvatar({ agent, size = "md" }: AgentAvatarProps) {
  const sizeClasses = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm"

  return (
    <div
      className={`${sizeClasses} rounded-full flex items-center justify-center bg-gray-100 shrink-0`}
      title={agent.name}
    >
      {agent.emoji}
    </div>
  )
}
