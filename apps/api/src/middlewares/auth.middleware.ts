import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  id: string;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Token não fornecido'
    });
  }

  const [, token] = authHeader.split(' ');

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as JwtPayload;

    req.userId = decoded.id;

    return next();
  } catch {
    return res.status(401).json({
      error: 'Token inválido ou expirado'
    });
  }
}
