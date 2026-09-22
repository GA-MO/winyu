import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Noto_Sans_Thai } from "next/font/google";
import { TH } from "@/lib/i18n/th";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme-provider";
import { Providers } from "./providers";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-noto-sans-thai", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: TH.app.name,
  description: TH.app.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`dark vexa-scrollbar ${notoSansThai.variable} ${inter.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
