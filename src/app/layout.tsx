import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Providers from '@/components/Providers';
import './globals.css';

// Use LiberationSans (bundled with pdfjs-dist, metrically compatible with Inter/Arial)
// Falls back gracefully to system-ui when files aren't present
const inter = localFont({
  src: [
    {
      path: '../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf',
      weight: '400',
    },
    { path: '../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf', weight: '700' },
  ],
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Lifecycle',
  description: 'A transparent, stateful visual workflow system powered by CID Agent',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
