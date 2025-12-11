import * as React from "react"

import { tornPaperStyles } from "@/components/shared/Paper"
import { cn } from "@/lib/utils"

type CardVariant = "default" | "paper"

type CardProps = React.ComponentProps<"div"> & {
  variant?: CardVariant
  tornSeed?: number | string
}

const variantStyles: Record<CardVariant, (seed: number | string) => string> = {
  default: () =>
    "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
  paper: (seed) => tornPaperStyles(seed),
}

function Card({ className, variant = "paper", tornSeed, ...props }: CardProps) {
  const seed = tornSeed ?? React.useId()

  return (
    <div
      data-slot="card"
      className={cn(
        "relative z-0 flex flex-col gap-6 bg-transparent py-6 text-foreground font-base [&_[data-slot=button]]:after:hidden",
        variantStyles[variant](seed),
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
