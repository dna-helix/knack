/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  // Only use static export for GitHub Pages demo builds.
  // Normal builds run in server mode for API routes + Supabase.
  ...(isGithubPages ? { output: 'export' } : {}),
  // Only apply basePath/assetPrefix on GitHub Pages builds
  basePath: isGithubPages ? '/knack' : '',
  assetPrefix: isGithubPages ? '/knack' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
