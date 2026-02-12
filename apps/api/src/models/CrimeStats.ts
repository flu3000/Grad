interface ICrimeStats {
  regionId: ObjectId;
  period: string; // ex: "2025-01"
  homicide: number;
  robbery: number;
  theft: number;
  vehicleTheft: number;
}
