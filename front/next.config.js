/** @type {import('next').NextConfig} */

const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_SONARI_FOLDER ?? "",
};
module.exports = nextConfig;
