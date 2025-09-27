import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pokémon TCG Watchlist",
  description: "Track Pokémon TCG card prices from TCGplayer and PriceCharting with automatic card merging",
  keywords: ["pokemon", "tcg", "trading cards", "prices", "watchlist", "tcgplayer", "pricecharting", "graded cards"],
  authors: [{ name: "Chen" }],
  openGraph: {
    title: "Pokémon TCG Watchlist",
    description: "Track Pokémon TCG card prices from TCGplayer and PriceCharting with automatic card merging",
    type: "website",
    url: "https://chencat.com",
  },
  twitter: {
    card: "summary",
    title: "Pokémon TCG Watchlist",
    description: "Track Pokémon TCG card prices from TCGplayer and PriceCharting with automatic card merging",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ErrorBoundary>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
