/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Set the basePath for GitHub Pages (repo name)
  basePath: '/knack',
  // assetPrefix is also needed for some deployment scenarios
  assetPrefix: '/knack',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
