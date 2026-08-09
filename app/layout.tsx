import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PuzzleSync',
  description: 'Arma rompecabezas con otra persona, en tiempo real y sin crear cuenta.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
