"use client"

import { Loader2, Send } from "lucide-react"
import { useRef, useState } from "react"
import type { AgentMeta } from "@/lib/office/agents"
import { AgentAvatar } from "./agent-avatar"

interface ChatInputProps {
  agent: AgentMeta
  onSend: (message: string) => void
  disabled?: boolean
  isStreaming?: boolean
}

export function ChatInput({ agent, onSend, disabled, isStreaming }: ChatInputProps) {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText("")
    textareaRef.current?.focus()
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      {/* Agent indicator */}
      <div className="flex items-center gap-1.5 mb-2">
        <AgentAvatar agent={agent} size="sm" />
        <span className="text-xs text-gray-500">
          {isStreaming ? (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {agent.name} esta pensando...
            </span>
          ) : (
            `Hablando con ${agent.name}`
          )}
        </span>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder={`Escribe un mensaje para ${agent.name}...`}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#0e70db] text-white transition-colors hover:bg-[#0c5fb8] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
