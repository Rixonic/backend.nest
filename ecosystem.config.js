module.exports = {
  apps: [
    {
      name: 'backend.nest',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      // pm2 manda SIGKILL al vencer este plazo, y ahi no corre ningun handler:
      // ni los de Puppeteer ni los shutdown hooks de Nest, y Chromium queda
      // huerfano. El default de 1600 ms no alcanza para cerrar dos conexiones
      // TypeORM + MQTT + Modbus + el browser.
      kill_timeout: 10000,
      // Ojo: esto solo mira el proceso Node padre (hoy ~135 MB). Los renderers
      // de Chrome son procesos hijos y no cuentan para este limite; el techo
      // de esos lo pone el MemoryMax de la unit de systemd.
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
