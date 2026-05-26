module.exports = {
  apps: [
    {
      name: 'agents-ui-server',
      script: 'server/index.js',
      cwd: __dirname,
      watch: ['server'],
      ignore_watch: ['data'],
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'agents-ui-vite',
      script: 'node_modules/.bin/vite',
      args: '--port 5174',
      cwd: __dirname,
    },
  ],
}
