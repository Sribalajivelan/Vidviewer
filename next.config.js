/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  // ffmpeg-static/ffprobe-static resolve their bundled binary's path off
  // their own `__dirname` at require-time; webpack bundling them into a
  // single vendor chunk breaks that (the path ends up pointing into
  // .next/.../vendor-chunks instead of node_modules). Keeping them external
  // makes Next.js `require()` them normally at runtime instead.
  serverExternalPackages: ['ffmpeg-static', 'ffprobe-static'],
};

module.exports = nextConfig;
