import type { Metadata } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import WhatsNewModal from "@/components/changelog/WhatsNewModal";
import ScrollDebug from "@/components/debug/ScrollDebug";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif for page titles (see globals.css). Self-hosted by next/font at
// build time, like Geist. "latin" covers the accents ES/EN/FR need.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Venuria",
  description: "Design and manage event layouts in 2D and 3D.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Release notes — renders nothing unless there's a session with unseen entries */}
        <WhatsNewModal />
        <ScrollDebug />
      </body>
    </html>
  );
}
