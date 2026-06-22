import type { Metadata } from "next";
import { Nunito, Inter, Outfit } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// ✅ Font variables — available in CSS via var(--font-nunito), etc.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://xan.vercel.app"),
  title: {
    default: "XAN | Stream Anime",
    template: "%s | XAN",
  },
  description:
    "Stream anime without the noise. Discover, search, and watch your favorite anime.",
  applicationName: "XAN",
  keywords: ["anime streaming", "watch anime online", "anime", "XAN"],
  openGraph: {
    type: "website",
    siteName: "XAN",
    title: "XAN | Stream Anime",
    description: "Stream anime without the noise.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ✅ Bug #14: suppressHydrationWarning REQUIRED for next-themes
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${nunito.variable} ${inter.variable} ${outfit.variable}`}
    >
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
