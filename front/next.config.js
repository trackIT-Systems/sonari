/** @type {import('next').NextConfig} */

const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER ?? "";
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  output: "export",
  basePath,
  ...(isDev && {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:5000' + basePath + '/api/:path*',
        },
      ];
    },
  }),
};
module.exports = nextConfig;
