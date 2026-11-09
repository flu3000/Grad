import { Schema, model, Types } from 'mongoose';

interface ICrimeStats {
  regionId: Types.ObjectId;
  period: string; // ex: "2025-01"
  homicide: number;
  robbery: number;
  theft: number;
  vehicleTheft: number;
}
