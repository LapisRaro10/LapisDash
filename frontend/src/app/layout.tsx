import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "LapisRaro Dashboard",
  description: "Dashboard de produtividade",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans bg-[var(--background)] text-[var(--foreground)] antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
