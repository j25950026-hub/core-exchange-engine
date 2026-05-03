/**
 * 交易所服务 - 整合撮合引擎和资金账本
 */

import { MatchingEngine, Order, OrderSide, OrderType, OrderStatus, Trade } from '../matching/MatchingEngine';
import { FundsLedger } from '../wallet/FundsLedger';

// ==================== 类型定义 ====================

export interface OrderInput {
  id: string;
  userId: string;
  symbol: string;      // 如 "BTC/USDT"
  side: OrderSide;
  price: string;
  quantity: string;
}

export interface PlaceOrderResult {
  order: Order;
  trades: Trade[];
  success: boolean;
  message?: string;
}

export interface CancelOrderResult {
  success: boolean;
  releasedAmount: string;
  message?: string;
}

// ==================== 交易所服务类 ====================

export class ExchangeService {
  private matchingEngine: MatchingEngine;
  private fundsLedger: FundsLedger;

  constructor(matchingEngine: MatchingEngine, fundsLedger: FundsLedger) {
    this.matchingEngine = matchingEngine;
    this.fundsLedger = fundsLedger;
  }

  /**
   * 下限价单
   */
  async placeLimitOrder(input: OrderInput): Promise<PlaceOrderResult> {
    try {
      // 检查 orderId 是否已存在
      const existingOrder = this.matchingEngine.getOrder(input.id);
      if (existingOrder) {
        return {
          order: null as any,
          trades: [],
          success: false,
          message: 'Duplicate orderId'
        };
      }

      // 解析交易对
      const [baseAsset, quoteAsset] = input.symbol.split('/');
      if (!baseAsset || !quoteAsset) {
        return { order: null as any, trades: [], success: false, message: 'Invalid symbol' };
      }

      // 计算需要冻结的金额
      const totalAmount = this.multiply(input.price, input.quantity);
      const freezeAsset = input.side === OrderSide.BUY ? quoteAsset : baseAsset;
      const freezeAmount = input.side === OrderSide.BUY ? totalAmount : input.quantity;

      // 冻结资金
      const frozen = this.fundsLedger.freeze(
        input.userId,
        freezeAsset,
        freezeAmount,
        'order',
        input.id
      );

      if (!frozen) {
        return {
          order: null as any,
          trades: [],
          success: false,
          message: `Insufficient ${freezeAsset} balance`
        };
      }

      // 创建订单
      const order: Order = {
        id: input.id,
        userId: input.userId,
        symbol: input.symbol,
        side: input.side,
        type: OrderType.LIMIT,
        price: input.price,
        quantity: input.quantity,
        filledQuantity: '0',
        status: OrderStatus.PENDING,
        timestamp: Date.now()
      };

      // 提交到撮合引擎
      const matchResult = await this.matchingEngine.submitOrder(order);

      // 处理成交
      for (const trade of matchResult.trades) {
        await this.fundsLedger.settleTrade({
          buyUserId: trade.buyUserId,
          sellUserId: trade.sellUserId,
          price: trade.price,
          quantity: trade.quantity,
          baseAsset,
          quoteAsset
        });

        // 如果是买单，且成交价低于挂单价，释放差额
        if (order.side === OrderSide.BUY && order.userId === trade.buyUserId) {
          const priceDiff = this.subtract(order.price, trade.price);
          if (this.compare(priceDiff, '0') > 0) {
            const excessAmount = this.multiply(priceDiff, trade.quantity);
            this.fundsLedger.release(
              order.userId,
              quoteAsset,
              excessAmount,
              'price_difference',
              `${order.id}_diff_${trade.id}`
            );
          }
        }
      }

      // 如果订单完全成交，无需额外处理（资金已在 settleTrade 中处理）
      // 如果部分成交或未成交，冻结资金继续保留

      return {
        order,
        trades: matchResult.trades,
        success: true,
        message: `Order placed: ${matchResult.trades.length} trades executed`
      };

    } catch (error: any) {
      return {
        order: null as any,
        trades: [],
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string): Promise<CancelOrderResult> {
    try {
      // 获取订单信息
      const order = this.matchingEngine.getOrder(orderId);
      if (!order) {
        return { success: false, releasedAmount: '0', message: 'Order not found' };
      }

      // 检查订单状态
      if (order.status === OrderStatus.FILLED) {
        return { success: false, releasedAmount: '0', message: 'Order already filled' };
      }

      if (order.status === OrderStatus.CANCELLED) {
        return { success: false, releasedAmount: '0', message: 'Order already cancelled' };
      }

      // 取消订单
      const cancelled = await this.matchingEngine.cancelOrder(orderId);
      if (!cancelled) {
        return { success: false, releasedAmount: '0', message: 'Cancel failed' };
      }

      // 计算需要释放的金额
      const [baseAsset, quoteAsset] = order.symbol.split('/');
      const remainingQty = this.subtract(order.quantity, order.filledQuantity);
      const releaseAsset = order.side === OrderSide.BUY ? quoteAsset : baseAsset;
      const releaseAmount = order.side === OrderSide.BUY
        ? this.multiply(order.price, remainingQty)
        : remainingQty;

      // 释放冻结资金
      const released = this.fundsLedger.release(
        order.userId,
        releaseAsset,
        releaseAmount,
        'cancel',
        orderId
      );

      if (!released) {
        return {
          success: false,
          releasedAmount: '0',
          message: 'Failed to release frozen funds'
        };
      }

      return {
        success: true,
        releasedAmount: releaseAmount,
        message: `Order cancelled, released ${releaseAmount} ${releaseAsset}`
      };

    } catch (error: any) {
      return {
        success: false,
        releasedAmount: '0',
        message: error.message
      };
    }
  }

  /**
   * 获取订单详情
   */
  getOrder(orderId: string): Order | undefined {
    return this.matchingEngine.getOrder(orderId);
  }

  /**
   * 获取用户余额
   */
  getBalance(userId: string, asset: string): string {
    return this.fundsLedger.getBalance(userId, asset);
  }

  /**
   * 获取用户冻结余额
   */
  getFrozen(userId: string, asset: string): string {
    return this.fundsLedger.getFrozen(userId, asset);
  }

  /**
   * 获取用户总余额（可用 + 冻结）
   */
  getTotalBalance(userId: string, asset: string): string {
    return this.fundsLedger.getTotalBalance(userId, asset);
  }

  /**
   * BigInt 乘法
   */
  private multiply(a: string, b: string): string {
    return (BigInt(a) * BigInt(b)).toString();
  }

  /**
   * BigInt 减法
   */
  private subtract(a: string, b: string): string {
    return (BigInt(a) - BigInt(b)).toString();
  }

  /**
   * BigInt 比较
   */
  private compare(a: string, b: string): number {
    const bigA = BigInt(a);
    const bigB = BigInt(b);
    if (bigA > bigB) return 1;
    if (bigA < bigB) return -1;
    return 0;
  }
}
