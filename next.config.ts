import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Un error de tipos rompe el build. La rama principal debe estar siempre desplegable.
    ignoreBuildErrors: false,
  },
  // Next 16 ya no ejecuta ESLint durante `next build`: se corre aparte con `npm run lint`,
  // y es una de las comprobaciones obligatorias antes de mergear.
};

export default nextConfig;
