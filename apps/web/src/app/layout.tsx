import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SteadyFlow — E-commerce Growth Intelligence',
  description: 'AI-powered Shopify store analysis and growth insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
