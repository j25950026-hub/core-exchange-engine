/**
 * 历史记录服务 - 管理订单和成交历史
 */

import { Order, Trade } from '../matching/MatchingEngine';

export class HistoryService {
  private orderHistory: Order[] = [];
  private tradeHistory: Trade[] = [];

  /**
   * 保存订单
   */
  saveOrder(order: Order): void {
    this.orderHistory.push(order);
  }

  /**
   * 保存成交记录
   */
  saveTrades(trades: Trade[]): void {
    this.tradeHistory.push(...trades);
  }

  /**
   * 获取用户的订单历史
   */
  getOrdersByUser(userId: string, filters?: {
    symbol?: string;
    status?: string;
    side?: string;
  }): Order[] {
    let userOrders = this.orderHistory.filter(order => order.userId === userId);

    if (filters?.symbol) {
      userOrders = userOrders.filter(order => order.symbol === filters.symbol);
    }

    if (filters?.status) {
      userOrders = userOrders.filter(order => order.status === filters.status);
    }

    if (filters?.side) {
      userOrders = userOrders.filter(order => order.side === filters.side);
    }

    // 按时间倒序排序
    userOrders.sort((a, b) => b.timestamp - a.timestamp);

    return userOrders;
  }

  /**
   * 获取用户的成交记录
   */
  getTradesByUser(userId: string, filters?: {
    symbol?: string;
    orderId?: string;
  }): Trade[] {
    let userTrades = this.tradeHistory.filter(
      trade => trade.buyUserId === userId || trade.sellUserId === userId
    );

    if (filters?.symbol) {
      userTrades = userTrades.filter(trade => trade.symbol === filters.symbol);
    }

    if (filters?.orderId) {
      userTrades = userTrades.filter(
        trade => trade.buyOrderId === filters.orderId || trade.sellOrderId === filters.orderId
      );
    }

    // 按时间倒序排序
    userTrades.sort((a, b) => b.timestamp - a.timestamp);

    return userTrades;
  }
}
