import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KeyPoint AI',
  description: 'Paste long text and turn it into clear key points.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
