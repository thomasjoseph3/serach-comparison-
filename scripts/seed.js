import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';

const users = [
  { username: 'user1', password: 'pass1234', name: 'User One'   },
  { username: 'user2', password: 'pass1234', name: 'User Two'   },
  { username: 'user3', password: 'pass1234', name: 'User Three' },
  { username: 'user4', password: 'pass1234', name: 'User Four'  },
  { username: 'user5', password: 'pass1234', name: 'User Five'  }
];

await mongoose.connect(process.env.MONGO_URL);
console.log('Connected to MongoDB');

for (const u of users) {
  const hash = await bcrypt.hash(u.password, 10);
  await User.findOneAndUpdate(
    { username: u.username },
    { username: u.username, password: hash, name: u.name },
    { upsert: true, new: true }
  );
  console.log(`✓ ${u.username} (${u.name}) — password: ${u.password}`);
}

console.log('\nDone. All 5 users created/updated.');
await mongoose.disconnect();
