import app from './app';
import mongoose from 'mongoose';
import 'dotenv/config';

const PORT = 3333;

mongoose.connect(process.env.MONGO_URI!)
  .then(() => {
    console.log('MongoDB conectado');
    app.listen(PORT, () =>
      console.log(`Servidor rodando na porta ${PORT}`)
    );
  })
  .catch(err => {
    console.error('Erro ao conectar no Mongo', err);
  });
