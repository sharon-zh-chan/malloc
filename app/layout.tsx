import React from "react";
import type { Metadata, Viewport } from "next";
import { Caveat, IBM_Plex_Mono, Inter, Lora } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
});
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "malloc | Space for what's on your mind",
  description:
    "A lightweight workspace for capturing tasks, notepad notes and whatever is on your mind.",
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
    <html lang="en" className="notranslate" translate="no">
      <body
        className={`${inter.className} ${inter.variable} ${lora.variable} ${ibmPlexMono.variable} ${caveat.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
