import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import * as React from "react"

import { cn } from "@/lib/utils"

// Background + Scribbled Border (Background moved to ::before to allow shadow behind it)
const scribbleStyles = "before:absolute before:inset-0 before:border-2 before:border-border before:rounded-[inherit] before:filter-[url(#scribble)] before:-z-10"
const hatchedShadow = "after:absolute after:top-1 after:left-1 after:w-full after:h-full after:rounded-[inherit] after:bg-[image:var(--pattern-hatch)] after:-z-20"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-base ring-offset-white transition-all gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer relative z-0 bg-transparent",
  {
    variants: {
      variant: {
        default:
          `text-main-foreground before:bg-main hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:after:opacity-0 ${scribbleStyles} ${hatchedShadow}`,
        noShadow: `text-main-foreground before:bg-main ${scribbleStyles}`,
        neutral:
          `before:bg-secondary-background text-foreground hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:after:opacity-0 ${scribbleStyles} ${hatchedShadow}`,
        reverse:
          `text-main-foreground before:bg-main hover:translate-x-reverseBoxShadowX hover:translate-y-reverseBoxShadowY hover:after:opacity-100 after:opacity-0 ${scribbleStyles} ${hatchedShadow}`,
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
