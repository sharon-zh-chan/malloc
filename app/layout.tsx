import React from "react"
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const _inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "To Do at One Glance",
  description:
    "A sketchy hand-drawn dashboard to manage all your todo lists at one glance",
};

export const viewport: Viewport = {
  themeColor: "#f37520",
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
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
