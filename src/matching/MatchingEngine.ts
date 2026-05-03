/**
 * 撮合引擎 - 第1步：基础类型定义
 */

// ==================== 枚举定义 ====================

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED'
}

// ==================== 基础订单类型 ====================

export interface Order {
  id: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  quantity: string;
  filledQuantity: string;
  status: OrderStatus;
  timestamp: number;
}

// ==================== 交易记录 ====================

export interface Trade {
  id: string;
  symbol: string;
  buyOrderId: string;
  sellOrderId: string;
  buyUserId: string;
  sellUserId: string;
  price: string;
  quantity: string;
  timestamp: number;
}

// ==================== 撮合结果 ====================

export interface MatchingResult {
  trades: Trade[];
  updatedOrders: Order[];
  remainingOrder?: Order;
}

// ==================== 订单簿快照 ====================

export interface OrderBookSnapshot {
  symbol: string;
  bids: Array<{ price: string; quantity: string }>;
  asks: Array<{ price: string; quantity: string }>;
  timestamp: number;
}

// ==================== 撮合引擎类（空壳） ====================

export class MatchingEngine {
  private orderBooks: Map<string, { bids: Order[]; asks: Order[] }>;
  private orders: Map<string, Order>;
  private buyOrders: Map<string, Order[]>;  // symbol -> 买单列表
  private sellOrders: Map<string, Order[]>; // symbol -> 卖单列表
  private trades: Trade[];  // 所有成交记录
  private tradeCounter: number;
  private locks: Map<string, Promise<void>>;

  constructor() {
    this.orderBooks = new Map();
    this.orders = new Map();
    this.buyOrders = new Map();
    this.sellOrders = new Map();
    this.trades = [];
    this.tradeCounter = 0;
    this.locks = new Map();
  }

  /**
   * 提交订单
   */
  async submitOrder(order: Order): Promise<MatchingResult> {
    await this.acquireLock(order.symbol);
    try {
      if (!this.validateOrder(order)) {
        throw new Error('Invalid order');
      }

      order.status = OrderStatus.PENDING;
      order.filledQuantity = '0';
      this.orders.set(order.id, order);

      const result = await this.matchOrder(order);

      return result;
    } finally {
      this.releaseLock(order.symbol);
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) return false;

    await this.acquireLock(order.symbol);
    try {
      if (order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
        return false;
      }

      order.status = OrderStatus.CANCELLED;
      this.removeOrderFromBook(order);
      return true;
    } finally {
      this.releaseLock(order.symbol);
    }
  }

  /**
   * 获取订单簿快照
   */
  getOrderBookSnapshot(symbol: string): OrderBookSnapshot | null {
    const buyOrders = this.buyOrders.get(symbol) || [];
    const sellOrders = this.sellOrders.get(symbol) || [];

    const bids = buyOrders.map(o => ({
      price: o.price,
      quantity: this.subtract(o.quantity, o.filledQuantity)
    }));
    const asks = sellOrders.map(o => ({
      price: o.price,
      quantity: this.subtract(o.quantity, o.filledQuantity)
    }));

    return { symbol, bids, asks, timestamp: Date.now() };
  }

  /**
   * 获取订单详情
   */
  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  /**
   * 验证订单
   */
  private validateOrder(order: Order): boolean {
    if (!order.id || !order.userId || !order.symbol) return false;
    if (this.compare(order.quantity, '0') <= 0 || this.compare(order.price, '0') <= 0) return false;
    if (order.type !== OrderType.LIMIT) return false;
    return true;
  }

  /**
   * 排序订单簿（价格优先 + 时间优先 FIFO）
   */
  private sortOrderBook(orders: Order[], side: OrderSide): void {
    if (side === OrderSide.BUY) {
      // 买单：价格降序，同价格时间升序（早的优先）
      orders.sort((a, b) => {
        const priceCompare = this.compare(b.price, a.price);
        return priceCompare !== 0 ? priceCompare : a.timestamp - b.timestamp;
      });
    } else {
      // 卖单：价格升序，同价格时间升序（早的优先）
      orders.sort((a, b) => {
        const priceCompare = this.compare(a.price, b.price);
        return priceCompare !== 0 ? priceCompare : a.timestamp - b.timestamp;
      });
    }
  }

  /**
   * 生成交易ID
   */
  private generateTradeId(): string {
    return `trade_${Date.now()}_${++this.tradeCounter}`;
  }

  /**
   * 执行撮合
   */
  private async matchOrder(order: Order): Promise<MatchingResult> {
    const trades: Trade[] = [];
    const updatedOrders: Order[] = [];
    let remainingQty = order.quantity;

    const oppositeOrders = (order.side === OrderSide.BUY
      ? this.sellOrders.get(order.symbol) || []
      : this.buyOrders.get(order.symbol) || []).slice();

    for (const oppositeOrder of oppositeOrders) {
      if (this.compare(remainingQty, '0') <= 0) break;
      if (oppositeOrder.status === OrderStatus.FILLED || oppositeOrder.status === OrderStatus.CANCELLED) continue;

      const canMatch = order.side === OrderSide.BUY
        ? this.compare(order.price, oppositeOrder.price) >= 0
        : this.compare(order.price, oppositeOrder.price) <= 0;

      if (!canMatch) break;

      const oppositeRemaining = this.subtract(oppositeOrder.quantity, oppositeOrder.filledQuantity);
      const matchQty = this.compare(remainingQty, oppositeRemaining) <= 0 ? remainingQty : oppositeRemaining;
      const tradePrice = oppositeOrder.price;

      const trade: Trade = {
        id: this.generateTradeId(),
        symbol: order.symbol,
        buyOrderId: order.side === OrderSide.BUY ? order.id : oppositeOrder.id,
        sellOrderId: order.side === OrderSide.SELL ? order.id : oppositeOrder.id,
        buyUserId: order.side === OrderSide.BUY ? order.userId : oppositeOrder.userId,
        sellUserId: order.side === OrderSide.SELL ? order.userId : oppositeOrder.userId,
        price: tradePrice,
        quantity: matchQty,
        timestamp: Date.now()
      };

      trades.push(trade);
      this.trades.push(trade);  // 保存到成交记录

      order.filledQuantity = this.add(order.filledQuantity, matchQty);
      oppositeOrder.filledQuantity = this.add(oppositeOrder.filledQuantity, matchQty);
      remainingQty = this.subtract(remainingQty, matchQty);

      if (this.compare(oppositeOrder.filledQuantity, oppositeOrder.quantity) >= 0) {
        oppositeOrder.status = OrderStatus.FILLED;
        this.removeOrderFromBook(oppositeOrder);
      } else {
        oppositeOrder.status = OrderStatus.PARTIAL;
      }

      updatedOrders.push(oppositeOrder);
    }

    if (this.compare(order.filledQuantity, order.quantity) >= 0) {
      order.status = OrderStatus.FILLED;
    } else if (this.compare(order.filledQuantity, '0') > 0) {
      order.status = OrderStatus.PARTIAL;
      this.addOrderToBook(order);
    } else {
      this.addOrderToBook(order);
    }

    updatedOrders.push(order);

    return { trades, updatedOrders, remainingOrder: order.status !== OrderStatus.FILLED ? order : undefined };
  }

  /**
   * 添加订单到订单簿
   */
  private addOrderToBook(order: Order): void {
    const ordersMap = order.side === OrderSide.BUY ? this.buyOrders : this.sellOrders;
    const orders = ordersMap.get(order.symbol) || [];
    orders.push(order);
    this.sortOrderBook(orders, order.side);
    ordersMap.set(order.symbol, orders);
  }

  /**
   * 从订单簿移除订单
   */
  private removeOrderFromBook(order: Order): void {
    const ordersMap = order.side === OrderSide.BUY ? this.buyOrders : this.sellOrders;
    const orders = ordersMap.get(order.symbol) || [];
    const index = orders.findIndex(o => o.id === order.id);
    if (index !== -1) {
      orders.splice(index, 1);
      ordersMap.set(order.symbol, orders);
    }
  }

  /**
   * 获取锁
   */
  private async acquireLock(symbol: string): Promise<void> {
    while (this.locks.has(symbol)) {
      await this.locks.get(symbol);
    }
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.locks.set(symbol, lockPromise);
  }

  /**
   * 释放锁
   */
  private releaseLock(symbol: string): void {
    this.locks.delete(symbol);
  }

  /**
   * 字符串数字比较（使用 BigInt）
   */
  private compare(a: string, b: string): number {
    const bigA = BigInt(a.split('.')[0] || '0');
    const bigB = BigInt(b.split('.')[0] || '0');
    if (bigA > bigB) return 1;
    if (bigA < bigB) return -1;
    return 0;
  }

  /**
   * 字符串数字加法（使用 BigInt）
   */
  private add(a: string, b: string): string {
    const bigA = BigInt(a.split('.')[0] || '0');
    const bigB = BigInt(b.split('.')[0] || '0');
    return (bigA + bigB).toString();
  }

  /**
   * 字符串数字减法（使用 BigInt）
   */
  private subtract(a: string, b: string): string {
    const bigA = BigInt(a.split('.')[0] || '0');
    const bigB = BigInt(b.split('.')[0] || '0');
    return (bigA - bigB).toString();
  }

  /**
   * 获取所有订单
   */
  getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  /**
   * 获取所有成交记录
   */
  getAllTrades(): Trade[] {
    return this.trades;
  }
}
