/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  output: 'export',
  // Only apply basePath/assetPrefix on GitHub Pages builds
  basePath: isGithubPages ? '/knack' : '',
  assetPrefix: isGithubPages ? '/knack' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
