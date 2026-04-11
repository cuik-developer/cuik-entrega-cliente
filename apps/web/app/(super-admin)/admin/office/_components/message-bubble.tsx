"use client"

import { AGENTS_META, type AgentId } from "@/lib/office/agents"
import { AgentAvatar } from "./agent-avatar"

interface MessageBubbleProps {
  role: "user" | "agent" | "system" | "tool"
  agentId?: string | null
  content: string
  timestamp: Date
}

export function MessageBubble({ role, agentId, content, timestamp }: MessageBubbleProps) {
  const isUser = role === "user"
  const isTool = role === "tool" || role === "system"
  const agent = agentId ? AGENTS_META.find((a) => a.id === agentId) : null

  if (isTool) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">{content}</span>
      </div>
    )
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 rounded-full bg-[#0e70db] flex items-center justify-center text-white text-xs font-bold shrink-0">
          SA
        </div>
      ) : agent ? (
        <AgentAvatar agent={agent} />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
      )}

      {/* Bubble */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-[#0e70db] text-white rounded-tr-md"
            : "bg-white border border-gray-200 text-gray-800 rounded-tl-md"
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{content}</div>
        <div
          className={`text-[10px] mt-1 ${isUser ? "text-white/60" : "text-gray-400"}`}
        >
          {timestamp.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  )
}
