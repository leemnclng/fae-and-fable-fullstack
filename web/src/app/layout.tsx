import type { Metadata } from "next";
import { Caveat, Geist, Playfair_Display } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const display = Playfair_Display({ variable: "--font-display", subsets: ["latin"] });
// Handwriting for guests' notes in the photo viewer
const script = Caveat({ variable: "--font-script", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fae&Fable | Mirror Selfie Booth",
  description: "Mirror selfie booth rentals for weddings, birthdays and events.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${script.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
