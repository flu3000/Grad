import { Schema, model } from 'mongoose';

const SubprefectureSchema = new Schema({
  name: { type: String, required: true },

  sourceId: { type: Number, required: true, unique: true }, // 👈 NOVO

  geometry: {
    type: {
      type: String,
      enum: ['Polygon', 'MultiPolygon'],
      required: true
    },
    coordinates: {
      type: Array,
      required: true
    }
  }
});

SubprefectureSchema.index({ geometry: '2dsphere' });

export const Subprefecture = model(
  'Subprefecture',
  SubprefectureSchema
);
