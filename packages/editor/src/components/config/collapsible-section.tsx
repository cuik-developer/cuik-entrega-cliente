import { useState } from "react"

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 px-1 text-left group"
      >
        <span className="text-xs font-semibold text-[#0e70db] uppercase tracking-wider group-hover:text-[#0c5fb8] transition-colors">
          {title}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <title>Toggle section</title>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && <div className="pb-4 px-1 flex flex-col gap-4">{children}</div>}
    </div>
  )
}
