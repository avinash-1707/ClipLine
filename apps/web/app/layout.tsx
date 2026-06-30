import type { Metadata } from "next";
import { Anton, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

/**
 * Anton — bundled for the caption canvas renderer. next/font injects the
 * @font-face and exposes it as --font-anton so the preview engine can measure
 * glyphs without waiting for a network font fetch.
 */
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Clipline: the vertical video editor",
    template: "%s · Clipline",
  },
  description:
    "A local-first editor for Reels, Shorts and TikTok. Cut, caption, grade and export 1080x1920 vertical video. What you preview is exactly what ships.",
  applicationName: "Clipline",
  keywords: [
    "video editor",
    "vertical video",
    "reels",
    "shorts",
    "timeline editing",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
