import "./globals.css";
import { Mulish } from "next/font/google";

import { ClientProvider } from "@/app/client";
import type { Metadata } from "next";
import Notification from "@/components/Notification";

import { HOST } from "@/api/common";

const mulish = Mulish({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sonari",
  description: "Audio annotation tool for machine learning",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
      <link rel="icon" sizes="any" href={`${HOST}/favicon.ico`}/>
      <link rel="icon" type="image/svg+xml" href={`${HOST}/icon.svg`} />
      <link rel="apple-touch-icon" href={`${HOST}/apple-touch-icon.png`} />
      <link rel="manifest" href={`${HOST}/manifest.webmanifest`} />
      </head>
      <body
        className={`${mulish.className} font-sans bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 min-h-screen w-screen overflow-x-hidden`}
      >
        <ClientProvider>
          {children}
          <Notification />
        </ClientProvider>
      </body>
    </html>
  );
}
