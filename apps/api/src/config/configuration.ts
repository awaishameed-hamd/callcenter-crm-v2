export default () => ({
  port:    parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  jwt: {
    accessSecret:     process.env.JWT_ACCESS_SECRET  ?? 'change-me-access',
    refreshSecret:    process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    accessExpiresIn:  process.env.JWT_ACCESS_EXPIRES_IN  ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  clientUrl:        process.env.CLIENT_URL         ?? 'http://localhost:3000',
  socketCorsOrigin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:3000',
})
