import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { v4 as uuid } from "uuid";
import { User } from "../models/User";
import { generateTokens } from "../utils/generateTokens";

// ===== Clients =====
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const appleJWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

export class AuthController {

  // ======================
  // ANONYMOUS LOGIN
  // ======================
  static async anonymous(req: Request, res: Response) {
    const anonId = "anon_" + uuid();

    const user = await User.create({
      provider: "anonymous",
      providerId: anonId,
      name: "Guest"
    });

    const tokens = generateTokens(user.id);

    user.refreshToken = tokens.refreshToken;
    await user.save();

    return res.json({ ...tokens, user });
  }

  // ======================
  // GOOGLE LOGIN
  // ======================
  static async google(req: Request, res: Response) {
    const { idToken } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) return res.status(401).json({ message: "Token inválido" });

    const { sub, email, name, picture } = payload;

    let user = await User.findOne({
      provider: "google",
      providerId: sub
    });

    if (!user) {
      user = await User.create({
        provider: "google",
        providerId: sub,
        email,
        name,
        avatar: picture
      });
    }

    const tokens = generateTokens(user.id);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    return res.json({ ...tokens, user });
  }

  // ======================
  // APPLE LOGIN
  // ======================
  static async apple(req: Request, res: Response) {
    const { idToken } = req.body;

    try {
      const { payload } = await jwtVerify(idToken, appleJWKS, {
        issuer: "https://appleid.apple.com",
        audience: process.env.APPLE_CLIENT_ID
      });

      const sub = payload.sub as string;
      const email = payload.email as string | undefined;

      let user = await User.findOne({
        provider: "apple",
        providerId: sub
      });

      if (!user) {
        user = await User.create({
          provider: "apple",
          providerId: sub,
          email,
          name: "Apple User"
        });
      }

      const tokens = generateTokens(user.id);
      user.refreshToken = tokens.refreshToken;
      await user.save();

      return res.json({ ...tokens, user });

    } catch {
      return res.status(401).json({ message: "Apple token inválido" });
    }
  }

  // ======================
  // REFRESH TOKEN
  // ======================
  static async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body;

    if (!refreshToken)
      return res.status(401).json({ message: "Refresh token ausente" });

    try {
      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!
      ) as any;

      const user = await User.findById(payload.sub);

      if (!user || user.refreshToken !== refreshToken)
        return res.status(403).json({ message: "Refresh inválido" });

      const tokens = generateTokens(user.id);

      user.refreshToken = tokens.refreshToken;
      await user.save();

      return res.json(tokens);
    } catch {
      return res.status(403).json({ message: "Refresh expirado" });
    }
  }

  // ======================
  // LOGOUT
  // ======================
  static async logout(req: Request, res: Response) {
    const userId = req.userId;

    await User.findByIdAndUpdate(userId, { refreshToken: null });

    return res.status(204).send();
  }

  static async linkGoogle(req: Request, res: Response) {
    const { idToken } = req.body;
    const currentUserId = req.userId;

    if (!currentUserId)
      return res.status(401).json({ message: "Não autenticado" });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) return res.status(401).json({ message: "Token inválido" });

    const { sub, email, name, picture } = payload;

    // verifica se já existe conta Google
    const existingGoogleUser = await User.findOne({
      provider: "google",
      providerId: sub
    });

    if (existingGoogleUser)
      return res.status(409).json({
        message: "Esta conta Google já está vinculada a outro usuário"
      });

    // pega usuário atual (anônimo)
    const user = await User.findById(currentUserId);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

    // converte conta
    user.provider = "google";
    user.providerId = sub;
    user.email = email ?? user.email;
    user.name = name ?? user.name;
    user.avatar = picture ?? user.avatar;

    await user.save();

    const tokens = generateTokens(user.id);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    return res.json({ ...tokens, user });
  }

  static async linkApple(req: Request, res: Response) {
    const { idToken } = req.body;
    const currentUserId = req.userId;

    if (!currentUserId)
      return res.status(401).json({ message: "Não autenticado" });

    try {
      const { payload } = await jwtVerify(idToken, appleJWKS, {
        issuer: "https://appleid.apple.com",
        audience: process.env.APPLE_CLIENT_ID
      });

      const sub = payload.sub as string;
      const email = payload.email as string | undefined;

      const existingAppleUser = await User.findOne({
        provider: "apple",
        providerId: sub
      });

      if (existingAppleUser)
        return res.status(409).json({
          message: "Esta conta Apple já está vinculada a outro usuário"
        });

      const user = await User.findById(currentUserId);
      if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

      user.provider = "apple";
      user.providerId = sub;
      user.email = email ?? user.email;

      await user.save();

      const tokens = generateTokens(user.id);
      user.refreshToken = tokens.refreshToken;
      await user.save();

      return res.json({ ...tokens, user });

    } catch {
      return res.status(401).json({ message: "Token Apple inválido" });
    }
  }

}
