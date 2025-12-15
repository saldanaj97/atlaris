import { cn } from "@/lib/utils"
import * as React from "react"

export function Highlighter({ className, children, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "relative inline-block px-1",
        // Highlight shape - using after to ensure it sits on top of text for multiply effect
        "after:absolute after:inset-0 after:bg-highlighter after:z-10 after:pointer-events-none",
        // Scribble effect
        "after:filter-[url(#marker-bleed)] after:scale-105 after:rotate-[-5deg] after:rounded-sm",
        // Blending mode for realistic ink
        "after:mix-blend-multiply after:opacity-90",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
