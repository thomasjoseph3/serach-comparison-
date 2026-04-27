import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name:           String,
  price:          String,
  original_price: String,
  discount:       String,
  rating:         mongoose.Schema.Types.Mixed,
  reviews:        mongoose.Schema.Types.Mixed,
  retailer:       String,
  url:            String,
  image_url:      String,
  description:    String,
  delivery:       String,
  in_stock:       Boolean,
  availability:   String,
  metal:          String,
  stone:          String,
  carat:          String,
  clarity:        String,
  why:            String
}, { _id: false });

const searchSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  query:     { type: String, required: true },
  tool:      { type: String, default: 'serper' },
  country:   { type: String, default: 'in' },
  aiReply:   String,
  results:   [productSchema],
  resultCount: Number
}, { timestamps: true });

searchSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Search || mongoose.model('Search', searchSchema);
