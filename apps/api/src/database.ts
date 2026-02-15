import mongoose from 'mongoose';

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("Banco conectado:", mongoose.connection.name);
    console.log('🟢 MongoDB conectado');
  } catch (err) {
    console.error('🔴 Erro ao conectar no MongoDB', err);
    process.exit(1);
  }
}
