import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Lutra CRM",
  description: "Misje pozyskania partnerów Lutry",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-surface font-sans text-foreground" suppressHydrationWarning>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}

