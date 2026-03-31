import app from './app';
import { connectDB } from './config/database';

const PORT = process.env.PORT || 3000;

connectDB();

const server = app.listen(PORT, () => {
  console.log(`API demarree sur http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Documentation: http://localhost:${PORT}/`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM reçu, arret du serveur...');
  server.close(() => {
    console.log('Serveur arrete');
    process.exit(0);
  });
});