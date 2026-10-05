import type { Metadata } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { TH } from "@/lib/i18n/th";
import { ThemeBootScript } from "@/components/theme/theme-boot-script";
import { Providers } from "./providers";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-noto-sans-thai", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: TH.app.name,
  description: TH.app.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`ui-scrollbar ${notoSansThai.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <ThemeBootScript />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
