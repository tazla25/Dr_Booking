import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dr_Booking — Smart Queue & Booking System",
  description:
    "Reformed admin dashboard for doctor appointments and live queue management. Built with Next.js, TypeScript, and Prisma.",
  keywords: [
    "Dr_Booking",
    "doctor appointment",
    "queue management",
    "clinic admin",
    "telemedicine",
    "Next.js",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <Providers>
            {children}
            <SonnerToaster richColors position="top-right" />
            <Toaster />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
