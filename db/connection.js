import mongoose from 'mongoose';

let connected = false;

export async function connectDB() {
  if (connected) return;
  await mongoose.connect(process.env.MONGO_URL);
  connected = true;
  console.log('[DB] MongoDB connected');
}
