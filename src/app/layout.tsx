import type { Metadata } from "next";
import { getLocale, getMessages } from "next-intl/server";
import { IntlClientProvider } from "@/i18n/intl-client-provider";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WarpTalk — AI-Powered Meeting Translation",
    template: "%s | WarpTalk",
  },
  description:
    "Real-time multilingual meeting translation and transcription platform for global teams.",
  keywords: [
    "meeting translation",
    "real-time transcription",
    "multilingual",
    "AI",
    "WarpTalk",
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased" suppressHydrationWarning>
        <IntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </IntlClientProvider>
      </body>
    </html>
  );
}
