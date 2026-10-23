import type { Metadata } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Semi_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Administración Trailers",
    template: "%s · Administración Trailers",
  },
  description: "Reparaciones, gastos y comprobantes de la flotilla.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-MX"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster theme="light" position="top-center" richColors />
      </body>
    </html>
  );
}
