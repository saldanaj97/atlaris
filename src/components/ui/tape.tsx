import * as React from "react"

import { cn } from "@/lib/utils"

type TapeVariant = "sm" | "md" | "lg"
type TapeAngle = "straight" | "left" | "right"

type TapeProps = React.ComponentProps<"div"> & {
  variant?: TapeVariant
  angle?: TapeAngle
}

const variantClasses: Record<TapeVariant, string> = {
  sm: "h-4 w-16",
  md: "h-7 w-24",
  lg: "h-10 w-24",
}

const angleClasses: Record<TapeAngle, string> = {
  straight: "",
  left: "-rotate-6",
  right: "rotate-6",
}

export function Tape({
  className,
  variant = "md",
  angle = "straight",
  ...props
}: TapeProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-block pointer-events-none opacity-90",
        // Base tape shape
        "bg-tape rounded-[3px]",
        // Subtle paper texture / creases
        "before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_15%_20%,rgba(0,0,0,0.06),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(0,0,0,0.05),transparent_55%)] before:opacity-70 before:mix-blend-multiply before:pointer-events-none",
        // Soft shadow to lift off the page slightly
        "shadow-[0_2px_4px_rgba(0,0,0,0.18)]",
        variantClasses[variant],
        angleClasses[angle],
        className,
      )}
      {...props}
    />
  )
}
