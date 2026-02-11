import { Schema, model } from 'mongoose';

const NeighborhoodSchema = new Schema({
  name: String,
  city: String,
  state: String,

  // Polígono geográfico
  geometry: {
    type: {
      type: String,
      enum: ['Polygon'],
      required: true
    },
    coordinates: {
      type: [[[Number]]],
      required: true
    }
  },

  riskLevel: {
    type: Number, // 1 a 5
    required: true
  }
});

NeighborhoodSchema.index({ geometry: '2dsphere' });

export const Neighborhood = model(
  'Neighborhood',
  NeighborhoodSchema
);
