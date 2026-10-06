import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// PIPE-06 layer 1: any request-time API (headers(), cookies(), searchParams...)
// fails `next build` instead of silently turning a route into a function.
// Never enable `cacheComponents` in next.config (it disables this option);
// scripts/check-static.ts is layer 2.
export const dynamic = 'error';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Intelligence Hub — novidades de IA a cada hora",
  description:
    "Novidades de Inteligência Artificial de fontes oficiais, atualizadas automaticamente a cada hora.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={geistSans.variable}>
      <body className="bg-bg text-fg font-sans antialiased">{children}</body>
    </html>
  );
}
