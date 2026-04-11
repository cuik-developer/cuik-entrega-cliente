"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AGENTS_META, type AgentId } from "@/lib/office/agents"
import { MessageBubble } from "./message-bubble"

interface Message {
  id: string
  role: "user" | "agent" | "system" | "tool"
  agentId?: string | null
  content: string
  createdAt: Date
}

interface ChatMessagesProps {
  conversationId: string | null
  agentId: AgentId
  refreshKey: number
}

export function ChatMessages({ conversationId, agentId, refreshKey }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const agent = AGENTS_META.find((a) => a.id === agentId) ?? AGENTS_META[0]

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  // Load existing messages
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    fetch(`/api/office/conversations/${conversationId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.messages) {
          setMessages(
            json.data.messages.map((m: Record<string, unknown>) => ({
              ...m,
              createdAt: new Date(m.createdAt as string),
            })),
          )
          requestAnimationFrame(scrollToBottom)
        }
      })
      .catch(console.error)
  }, [conversationId, refreshKey, scrollToBottom])

  // SSE stream
  useEffect(() => {
    if (!conversationId) return

    // Close previous stream
    eventSourceRef.current?.close()

    const es = new EventSource(`/api/office/sessions/${conversationId}/stream`)
    eventSourceRef.current = es
    setIsStreaming(true)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>

        if (data.type === "agent.message") {
          const content = (data.content as Array<{ type: string; text?: string }>)
            ?.filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("")

          if (content) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "agent",
                agentId,
                content,
                createdAt: new Date(),
              },
            ])
            requestAnimationFrame(scrollToBottom)
          }
        }

        if (data.type === "agent.tool_use") {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "tool",
              content: `Usando herramienta: ${data.name as string}`,
              createdAt: new Date(),
            },
          ])
        }

        if (data.type === "session.status_idle") {
          setIsStreaming(false)
        }
      } catch {
        // Ignore parse errors on SSE
      }
    }

    es.onerror = () => {
      setIsStreaming(false)
      es.close()
    }

    return () => es.close()
  }, [conversationId, agentId, scrollToBottom])

  return {
    messages,
    isStreaming,
    agent,
    scrollRef,
    MessagesView: (
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-4xl mb-3">{agent.emoji}</span>
            <p className="text-sm font-medium">{agent.name}</p>
            <p className="text-xs">{agent.description}</p>
            <p className="text-xs mt-2">Escribe un mensaje para comenzar</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              agentId={msg.agentId}
              content={msg.content}
              timestamp={msg.createdAt}
            />
          ))
        )}
      </div>
    ),
  }
}
