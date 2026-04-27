import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true }
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messages: [messageSchema]
}, { timestamps: true });

chatSessionSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);
