/**
 * 认证中间件
 */

import { Request, Response, NextFunction } from 'express';

// 内存版 token 映射：token -> userId
const tokenMap = new Map<string, string>([
  ['token-user1-abc123', 'user1'],
  ['token-user2-def456', 'user2'],
  ['token-user3-ghi789', 'user3']
]);

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * 认证中间件
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Missing authorization token'
    });
    return;
  }

  const userId = tokenMap.get(token);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
    return;
  }

  // 将 userId 注入到 request 对象
  req.userId = userId;
  next();
}

/**
 * 获取所有有效的 token（用于测试）
 */
export function getAllTokens(): Array<{ token: string; userId: string }> {
  return Array.from(tokenMap.entries()).map(([token, userId]) => ({ token, userId }));
}
