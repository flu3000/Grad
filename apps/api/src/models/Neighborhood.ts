import { Schema, model, Types, HydratedDocument } from 'mongoose';

/**
 * Tipos GeoJSON corretos
 */
type PolygonCoordinates = number[][][];
type MultiPolygonCoordinates = number[][][][];

export interface INeighborhood {
  name: string;

  sourceId: number; // ← ADICIONE ISSO

  city?: string;
  state?: string;

  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };

  riskLevel?: number | null;

  subprefecture: Types.ObjectId; // agora obrigatório
}


/**
 * Tipo do documento do Mongo
 */
export type NeighborhoodDocument = HydratedDocument<INeighborhood>;

const NeighborhoodSchema = new Schema<INeighborhood>({
  name: { type: String, required: true },

  sourceId: {
    type: Number,
    required: true,
    unique: true
  },

  city: String,
  state: String,

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
  },

  riskLevel: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },

  subprefecture: {
    type: Schema.Types.ObjectId,
    ref: 'Subprefecture',
    required: true
  }
});

// índice geoespacial
NeighborhoodSchema.index({ geometry: '2dsphere' });

export const Neighborhood = model<INeighborhood>(
  'Neighborhood',
  NeighborhoodSchema
);
