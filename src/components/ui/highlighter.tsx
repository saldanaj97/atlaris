import * as React from "react"
import { cn } from "@/lib/utils"

export function Highlighter({ className, children, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "relative inline-block px-1",
        // Highlight shape
        "before:absolute before:inset-0 before:bg-highlighter before:z-10",
        // Scribble effect
        "before:filter-[url(#scribble)] before:scale-105 before:rotate-[-1deg] before:rounded-sm",
        // Opacity for marker feel
        "before:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
