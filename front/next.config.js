/** @type {import('next').NextConfig} */

const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_WHOMBAT_FOLDER ?? "",
};
module.exports = nextConfig;
