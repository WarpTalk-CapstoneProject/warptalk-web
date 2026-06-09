"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircle, Info, Spinner, XCircle, Warning } from "@phosphor-icons/react/dist/ssr"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircle weight="light" className="size-4" />
        ),
        info: (
          <Info weight="light" className="size-4" />
        ),
        warning: (
          <Warning weight="light" className="size-4" />
        ),
        error: (
          <XCircle weight="light" className="size-4" />
        ),
        loading: (
          <Spinner weight="light" className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
