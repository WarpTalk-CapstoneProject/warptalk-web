"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import CircleCheck from "lucide-react/dist/esm/icons/circle-check"
import Info from "lucide-react/dist/esm/icons/info"
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert"
import OctagonX from "lucide-react/dist/esm/icons/octagon-x"
import Loader2 from "lucide-react/dist/esm/icons/loader-2"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheck className="size-4" />
        ),
        info: (
          <Info className="size-4" />
        ),
        warning: (
          <TriangleAlert className="size-4" />
        ),
        error: (
          <OctagonX className="size-4" />
        ),
        loading: (
          <Loader2 className="size-4 animate-spin" />
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
