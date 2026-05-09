import 'dotenv/config';
import app from './app';

const PORT = parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, 'localhost', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   محاسب — خادم الواجهة الخلفية               ║
╠══════════════════════════════════════════════╣
║  Running on: http://localhost:${PORT}           ║
║  Health:     /health                         ║
║  ETA Proxy:  /eta/token, /eta/submit         ║
╚══════════════════════════════════════════════╝
  `);
});
