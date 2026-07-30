import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WarpTalk — AI-Powered TranslationRoom Translation",
    template: "%s | WarpTalk",
  },
  description:
    "Real-time multilingual translationRoom translation and transcription platform for global teams.",
  keywords: [
    "translationRoom translation",
    "real-time transcription",
    "multilingual",
    "AI",
    "WarpTalk",
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
    >
      <body className="min-h-screen bg-black text-white font-sans antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
