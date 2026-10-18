/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@crm/shared'],
  // "/" has no screen of its own. The session token lives in sessionStorage, which the
  // server cannot read, so AppLayout (client side) decides where a signed-in user goes.
  async redirects() {
    return [{ source: '/', destination: '/login', permanent: false }]
  },
}

module.exports = nextConfig
