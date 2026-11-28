import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import WhatsNewModal from "@/components/changelog/WhatsNewModal";
import TourGuide from "@/components/tour/TourGuide";
import LastPageTracker from "@/components/nav/LastPageTracker";
import LanguageRestore from "@/components/i18n/LanguageRestore";

// All fonts are self-hosted from src/app/fonts (Latin subset, which covers the accents ES/EN/FR need) so a
// production build never has to fetch anything from Google. Licences: SIL Open Font License 1.1, see the
// *-OFL.txt files next to the font files. Geist and Geist Mono are the variable-weight files.
const geistSans = localFont({
  variable: "--font-geist-sans",
  display: "swap",
  src: [{ path: "./fonts/geist-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [{ path: "./fonts/geist-mono-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
});

// Display serif for page titles (see globals.css).
const cormorant = localFont({
  variable: "--font-cormorant",
  display: "swap",
  src: [
    { path: "./fonts/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: "Venuria", description: t("description") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
        {children}
        {/* Release notes — renders nothing unless there's a session with unseen entries */}
        <WhatsNewModal />
        {/* Guided tour for planners — renders nothing unless offered or started from Settings */}
        <TourGuide />
        {/* Remembers the last project page for the nav's "Last project" link */}
        <LastPageTracker />
        {/* Applies the language saved on the account when this browser has no language cookie yet */}
        <LanguageRestore />
        </NextIntlClientProvider>
        {/* Vercel Speed Insights — real-user performance metrics, no UI */}
        <SpeedInsights />
      </body>
    </html>
  );
}
