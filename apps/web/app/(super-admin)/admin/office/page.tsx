"use client"

import { useCallback, useState } from "react"
import { AGENTS_META, type AgentId } from "@/lib/office/agents"
import { ChatInput } from "./_components/chat-input"
import { ChatMessages } from "./_components/chat-messages"
import { ChatSidebar } from "./_components/chat-sidebar"

export default function OfficePage() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<AgentId>("luna")
  const [refreshKey, setRefreshKey] = useState(0)

  const handleNewConversation = useCallback(async () => {
    try {
      const res = await fetch("/api/office/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, title: `Chat con ${agentId}` }),
      })
      const json = await res.json()
      if (json.success) {
        setConversationId(json.data.conversationId)
        setRefreshKey((k) => k + 1)
      }
    } catch (err) {
      console.error("[Office] Failed to create conversation:", err)
    }
  }, [agentId])

  const handleSelectConversation = useCallback((id: string, agent: AgentId) => {
    setConversationId(id)
    setAgentId(agent)
  }, [])

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!conversationId) {
        // Auto-create conversation on first message
        try {
          const res = await fetch("/api/office/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, title: message.slice(0, 50) }),
          })
          const json = await res.json()
          if (json.success) {
            setConversationId(json.data.conversationId)
            setRefreshKey((k) => k + 1)
            // Send the message after session is created
            await fetch(`/api/office/sessions/${json.data.conversationId}/events`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message }),
            })
          }
        } catch (err) {
          console.error("[Office] Failed to create conversation:", err)
        }
        return
      }

      // Send message to existing conversation
      try {
        await fetch(`/api/office/sessions/${conversationId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        })
        setRefreshKey((k) => k + 1)
      } catch (err) {
        console.error("[Office] Failed to send message:", err)
      }
    },
    [conversationId, agentId],
  )

  const agent = AGENTS_META.find((a) => a.id === agentId) ?? AGENTS_META[0]

  const { MessagesView, isStreaming } = ChatMessages({
    conversationId,
    agentId,
    refreshKey,
  })

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar */}
      <ChatSidebar
        activeId={conversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        refreshKey={refreshKey}
      />

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white">
          <span className="text-xl">{agent.emoji}</span>
          <div>
            <h1 className="text-sm font-semibold text-gray-800">{agent.name}</h1>
            <p className="text-xs text-gray-500">{agent.description}</p>
          </div>
        </div>

        {/* Messages */}
        {MessagesView}

        {/* Input */}
        <ChatInput
          agent={agent}
          onSend={handleSendMessage}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  )
}
