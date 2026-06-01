import React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "malloc | Allocate space for what's on your mind",
  description:
    "A lightweight workspace for allocating space to tasks, memos and thoughts.",
  icons: {
    icon: "/brand/malloc-symbol.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0047D6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
