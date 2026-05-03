/**
 * API 路由定义
 */

import { Router, Request, Response } from 'express';
import { ExchangeService } from '../exchange/ExchangeService';
import { MatchingEngine, OrderSide } from '../matching/MatchingEngine';
import { HistoryService } from '../history/HistoryService';
import { authMiddleware } from './auth';

export function createRoutes(
  exchange: ExchangeService,
  engine: MatchingEngine,
  historyService: HistoryService
): Router {
  const router = Router();

  // POST /api/orders - 下单（需要认证）
  router.post('/orders', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { id, symbol, side, price, quantity } = req.body;
      const userId = req.userId!; // 从 token 解析出的 userId

      if (!id || !symbol || !side || !price || !quantity) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: id, symbol, side, price, quantity'
        });
      }

      // 拒绝客户端传递 userId
      if (req.body.userId) {
        return res.status(400).json({
          success: false,
          message: 'userId should not be provided in request body, it is derived from token'
        });
      }

      if (side !== 'BUY' && side !== 'SELL') {
        return res.status(400).json({
          success: false,
          message: 'Invalid side, must be BUY or SELL'
        });
      }

      const result = await exchange.placeLimitOrder({
        id,
        userId, // 使用从 token 解析的 userId
        symbol,
        side: side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        price,
        quantity
      });

      // 保存订单和成交记录到历史服务
      if (result.success && result.order) {
        historyService.saveOrder(result.order);
      }

      if (result.trades && result.trades.length > 0) {
        historyService.saveTrades(result.trades);
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // POST /api/orders/cancel - 取消订单（需要认证）
  router.post('/orders/cancel', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { orderId } = req.body;
      const userId = req.userId!; // 从 token 解析出的 userId

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required field: orderId'
        });
      }

      // 验证订单是否属于当前用户
      const order = exchange.getOrder(orderId);
      if (order && order.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only cancel your own orders'
        });
      }

      const result = await exchange.cancelOrder(orderId);

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // GET /api/orderbook - 获取订单簿
  router.get('/orderbook', (req: Request, res: Response) => {
    try {
      const { symbol } = req.query;

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Missing required query parameter: symbol'
        });
      }

      const orderbook = engine.getOrderBookSnapshot(symbol);

      if (!orderbook) {
        return res.json({
          success: true,
          symbol,
          bids: [],
          asks: []
        });
      }

      res.json({
        success: true,
        symbol,
        bids: orderbook.bids,
        asks: orderbook.asks
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // GET /api/balance - 获取余额（需要认证）
  router.get('/balance', authMiddleware, (req: Request, res: Response) => {
    try {
      const { asset } = req.query;
      const userId = req.userId!; // 从 token 解析出的 userId

      if (!asset || typeof asset !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Missing required query parameter: asset'
        });
      }

      // 拒绝客户端传递 userId
      if (req.query.userId) {
        return res.status(400).json({
          success: false,
          message: 'userId should not be provided in query, it is derived from token'
        });
      }

      const available = exchange.getBalance(userId, asset);
      const frozen = exchange.getFrozen(userId, asset);
      const total = exchange.getTotalBalance(userId, asset);

      res.json({
        success: true,
        userId,
        asset,
        available,
        frozen,
        total
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // GET /api/health - 健康检查
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/orders - 查询当前用户的订单历史
  router.get('/orders', authMiddleware, (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { symbol, status, side } = req.query;

      // 使用 HistoryService 获取订单
      const userOrders = historyService.getOrdersByUser(userId, {
        symbol: typeof symbol === 'string' ? symbol : undefined,
        status: typeof status === 'string' ? status : undefined,
        side: typeof side === 'string' ? side : undefined
      });

      res.json({
        success: true,
        data: userOrders,
        total: userOrders.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // GET /api/trades - 查询当前用户的成交记录
  router.get('/trades', authMiddleware, (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { symbol, orderId } = req.query;

      // 使用 HistoryService 获取成交记录
      const userTrades = historyService.getTradesByUser(userId, {
        symbol: typeof symbol === 'string' ? symbol : undefined,
        orderId: typeof orderId === 'string' ? orderId : undefined
      });

      res.json({
        success: true,
        data: userTrades,
        total: userTrades.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  return router;
}
