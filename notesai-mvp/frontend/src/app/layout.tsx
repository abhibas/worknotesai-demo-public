import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";
import { devLog } from '@/utils/devLogger';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://worknotesai.com'),
  title: "worknotesAI - Build your professional story bank, one conversation at a time",
  description: "Build your professional story bank, one conversation at a time. AI-powered platform that transforms your professional experiences into compelling STAR format interview responses.",
  openGraph: {
    title: "worknotesAI - Build your professional story bank, one conversation at a time",
    description: "Build your professional story bank, one conversation at a time. AI-powered platform that transforms your professional experiences into compelling STAR format interview responses.",
    url: "https://worknotesai.com",
    siteName: "worknotesAI",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "https://worknotesai.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "worknotesAI - Build your professional story bank, one conversation at a time",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "worknotesAI - Build your professional story bank, one conversation at a time",
    description: "Build your professional story bank, one conversation at a time. AI-powered platform that transforms your professional experiences into compelling STAR format interview responses.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const demoMode = (process.env.NEXT_PUBLIC_DEMO_MODE || 'false').toLowerCase() === 'true';
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (demoMode) {
    return (
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {children}
        </body>
      </html>
    );
  }

  if (!clerkPublishableKey) {
    console.error('❌ Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable!');
    console.error('Please set it in Vercel: Settings → Environment Variables');
    throw new Error('Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable. Please set it in Vercel environment variables.');
  }
  
  // Validate key format
  if (!clerkPublishableKey.startsWith('pk_live_') && !clerkPublishableKey.startsWith('pk_test_')) {
    console.error('❌ Invalid Clerk publishable key format!');
    console.error('Key should start with pk_live_ (production) or pk_test_ (development)');
    console.error('Current key starts with:', clerkPublishableKey.substring(0, 10));
  }
  
  // CODE CLEANUP: Use devLog for production readiness
  // Log key prefix for debugging (both server and client side)
  devLog('[Clerk Debug] Key exists:', !!clerkPublishableKey);
  if (clerkPublishableKey) {
    devLog('[Clerk Debug] Key prefix:', clerkPublishableKey.substring(0, 20) + '...');
    devLog('[Clerk Debug] Key length:', clerkPublishableKey.length);
    devLog('[Clerk Debug] Key type:', clerkPublishableKey.startsWith('pk_live_') ? 'PRODUCTION' : 'TEST/DEV');
  }
  
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: '#4f46e5',
        }
      }}
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
