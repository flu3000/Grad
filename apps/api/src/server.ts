import app from './app';
import 'dotenv/config';
import { connectDB } from './database';

const PORT = process.env.PORT || 3333;

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

start();