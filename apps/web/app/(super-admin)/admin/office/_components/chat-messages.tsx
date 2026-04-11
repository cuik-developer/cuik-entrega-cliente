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

  // SSE stream via fetch (supports cookies, unlike EventSource)
  useEffect(() => {
    if (!conversationId) return

    const abortController = new AbortController()
    setIsStreaming(true)

    async function readStream() {
      try {
        const res = await fetch(`/api/office/sessions/${conversationId}/stream`, {
          credentials: "include",
          signal: abortController.signal,
        })

        if (!res.ok || !res.body) {
          console.error("[Office:Stream] Failed:", res.status)
          setIsStreaming(false)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE lines from buffer
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === "[DONE]") continue

            try {
              const data = JSON.parse(jsonStr) as Record<string, unknown>

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
              // Ignore parse errors on individual SSE events
            }
          }
        }

        setIsStreaming(false)
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[Office:Stream] Error:", err)
        }
        setIsStreaming(false)
      }
    }

    readStream()
    return () => abortController.abort()
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
