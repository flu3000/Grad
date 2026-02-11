import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { generateTokens } from '../utils/generateTokens';

export class AuthController {

  // ======================
  // REGISTER
  // ======================
  static async register(req: Request, res: Response) {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Usuário já existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword
    });

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email
    });
  }

  // ======================
  // LOGIN
  // ======================
  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    user.refreshToken = refreshToken;
    await user.save();

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  }

  // ======================
  // REFRESH TOKEN
  // ======================
  static async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token ausente' });
    }

    try {
      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!
      ) as any;

      const user = await User.findById(payload.sub);

      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json({ message: 'Refresh token inválido' });
      }

      const tokens = generateTokens(user.id);

      user.refreshToken = tokens.refreshToken;
      await user.save();

      return res.json(tokens);
    } catch {
      return res.status(403).json({ message: 'Refresh token expirado ou inválido' });
    }
  }

  // ======================
  // LOGOUT
  // ======================
  static async logout(req: Request, res: Response) {
    const userId = req.userId; // vem do middleware JWT

    await User.findByIdAndUpdate(userId, {
      refreshToken: null
    });

    return res.status(204).send();
  }
}
