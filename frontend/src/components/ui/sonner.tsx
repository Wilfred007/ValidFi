"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      style={
        {
          "--normal-bg": "rgba(255, 255, 255, 0.06)",
          "--normal-border": "rgba(255, 255, 255, 0.15)",
          "--normal-text": "var(--text-primary)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
