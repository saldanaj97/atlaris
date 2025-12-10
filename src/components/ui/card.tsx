import * as React from "react"

import { tornPaperSurfaceClasses } from "@/components/shared/TornPaperStyles"
import { cn } from "@/lib/utils"

type CardVariant = "default" | "paper"

type CardProps = React.ComponentProps<"div"> & {
  variant?: CardVariant
  tornSeed?: number | string
}

const variantStyles: Record<CardVariant, (seed: number | string) => string> = {
  default: () =>
    cn(
      // Background + Scribbled Border
      "before:absolute before:inset-0 before:border-3 before:border-border before:rounded-[inherit] before:bg-card-background before:filter-[url(#scribble)] before:-z-10",
      // Hatched Shadow
      "after:absolute after:top-1 after:left-1 after:w-full after:h-full after:rounded-[inherit] after:bg-[image:var(--pattern-hatch)] after:-z-20",
    ),
  paper: (seed) => tornPaperSurfaceClasses(seed),
}

function Card({ className, variant = "default", tornSeed, ...props }: CardProps) {
  const renderSeed = tornSeed ?? React.useId()

  return (
    <div
      data-slot="card"
      className={cn(
        "relative flex flex-col gap-6 py-6 text-foreground font-base bg-transparent z-0",
        variantStyles[variant](renderSeed),
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-[data-slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-heading leading-none", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm font-base", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
}
