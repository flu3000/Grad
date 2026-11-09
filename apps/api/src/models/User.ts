import { Schema, model, Document } from "mongoose";

export type AuthProvider = "anonymous" | "google" | "apple";

export interface IUser extends Document {
  provider: AuthProvider;
  providerId: string;

  email?: string | null;
  name?: string | null;
  avatar?: string | null;

  refreshToken?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    provider: {
      type: String,
      enum: ["anonymous", "google", "apple"],
      required: true,
      index: true
    },

    // id único dentro do provedor
    providerId: {
      type: String,
      required: true,
      index: true
    },

    // opcionais (nem todo provedor envia)
    email: {
      type: String,
      sparse: true
    },

    name: {
      type: String,
      default: null
    },

    avatar: {
      type: String,
      default: null
    },

    refreshToken: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

// impede duplicação de conta do mesmo provedor
UserSchema.index({ provider: 1, providerId: 1 }, { unique: true });

export const User = model<IUser>("User", UserSchema);
