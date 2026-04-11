"use client"

import { MessageSquarePlus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { AGENTS_META, type AgentId } from "@/lib/office/agents"
import { AgentAvatar } from "./agent-avatar"

interface Conversation {
  id: string
  agentId: string
  title: string
  createdAt: string
}

interface ChatSidebarProps {
  activeId: string | null
  onSelect: (id: string, agentId: AgentId) => void
  onNew: () => void
  refreshKey: number
}

export function ChatSidebar({ activeId, onSelect, onNew, refreshKey }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/office/conversations")
      const json = await res.json()
      if (json.success) setConversations(json.data)
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  return (
    <div className="w-72 border-r border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Office</h2>
        <button
          type="button"
          onClick={onNew}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="Nueva conversacion"
        >
          <MessageSquarePlus className="w-4 h-4" />
        </button>
      </div>

      {/* Agent filter chips */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-gray-100">
        {AGENTS_META.filter((a) => a.active).map((agent) => (
          <span
            key={agent.id}
            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
          >
            {agent.emoji} {agent.name}
          </span>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8 px-4">
            Sin conversaciones. Crea una nueva para empezar.
          </p>
        ) : (
          conversations.map((conv) => {
            const agent = AGENTS_META.find((a) => a.id === conv.agentId)
            const isActive = conv.id === activeId
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelect(conv.id, conv.agentId as AgentId)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${
                  isActive ? "bg-blue-50 border-r-2 border-[#0e70db]" : "hover:bg-gray-50"
                }`}
              >
                {agent && <AgentAvatar agent={agent} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{conv.title}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(conv.createdAt).toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
