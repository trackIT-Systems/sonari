/** @type {import('next').NextConfig} */

const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_SONARI_FOLDER ?? "",
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
