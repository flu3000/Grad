import jwt from 'jsonwebtoken';

export function generateTokens(userId: string) {
  const accessToken = jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { sub: userId },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}
