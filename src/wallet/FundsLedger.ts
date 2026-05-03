/**
 * 资金账本 - 内存版
 * 用于撮合前后的资金冻结/释放/结算
 */

// ==================== 类型定义 ====================

export interface Balance {
  available: string;  // 可用余额
  frozen: string;     // 冻结余额
}

export interface FreezeRecord {
  userId: string;
  asset: string;
  amount: string;
  reason: string;
  refId: string;
  timestamp: number;
}

export interface SettlementResult {
  buyerDeducted: string;
  sellerCredited: string;
  success: boolean;
}

// ==================== 资金账本类 ====================

export class FundsLedger {
  // userId -> asset -> Balance
  private balances: Map<string, Map<string, Balance>>;
  // 冻结记录：refId -> FreezeRecord
  private freezeRecords: Map<string, FreezeRecord>;
  // 已结算的交易ID集合（防重）
  private settledTradeIds: Set<string>;

  constructor() {
    this.balances = new Map();
    this.freezeRecords = new Map();
    this.settledTradeIds = new Set();
  }

  /**
   * 初始化用户余额（仅用于测试）
   */
  initBalance(userId: string, asset: string, amount: string): void {
    if (!this.balances.has(userId)) {
      this.balances.set(userId, new Map());
    }
    const userBalances = this.balances.get(userId)!;
    userBalances.set(asset, {
      available: amount,
      frozen: '0'
    });
  }

  /**
   * 冻结资金
   */
  freeze(userId: string, asset: string, amount: string, reason: string, refId: string): boolean {
    if (this.compare(amount, '0') <= 0) {
      throw new Error('Freeze amount must be positive');
    }

    // 检查 refId 是否已存在
    if (this.freezeRecords.has(refId)) {
      throw new Error('Duplicate freeze refId');
    }

    const balance = this.getBalanceObject(userId, asset);
    if (!balance) {
      throw new Error('Balance not found');
    }

    // 检查可用余额是否足够
    if (this.compare(balance.available, amount) < 0) {
      return false;
    }

    // 冻结资金
    balance.available = this.subtract(balance.available, amount);
    balance.frozen = this.add(balance.frozen, amount);

    // 记录冻结
    this.freezeRecords.set(refId, {
      userId,
      asset,
      amount,
      reason,
      refId,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 释放冻结资金
   */
  release(userId: string, asset: string, amount: string, reason: string, refId: string): boolean {
    if (this.compare(amount, '0') <= 0) {
      throw new Error('Release amount must be positive');
    }

    const balance = this.getBalanceObject(userId, asset);
    if (!balance) {
      throw new Error('Balance not found');
    }

    // 检查冻结余额是否足够
    if (this.compare(balance.frozen, amount) < 0) {
      return false;
    }

    // 释放资金
    balance.frozen = this.subtract(balance.frozen, amount);
    balance.available = this.add(balance.available, amount);

    // 删除冻结记录
    this.freezeRecords.delete(refId);

    return true;
  }

  /**
   * 结算交易
   * @param trade 包含 buyUserId, sellUserId, price, quantity, asset
   */
  settleTrade(trade: {
    id?: string;
    buyUserId: string;
    sellUserId: string;
    price: string;
    quantity: string;
    baseAsset: string;   // 基础资产（如 BTC）
    quoteAsset: string;  // 计价资产（如 USDT）
  }): SettlementResult {
    // 幂等性检查：如果有 tradeId 且已结算过，直接返回
    if (trade.id && this.settledTradeIds.has(trade.id)) {
      return {
        buyerDeducted: '0',
        sellerCredited: '0',
        success: false
      };
    }

    const totalAmount = this.multiply(trade.price, trade.quantity);

    // 买方：扣除冻结的计价资产
    const buyerBalance = this.getBalanceObject(trade.buyUserId, trade.quoteAsset);
    if (!buyerBalance || this.compare(buyerBalance.frozen, totalAmount) < 0) {
      throw new Error('Buyer insufficient frozen balance');
    }

    // 卖方：扣除冻结的基础资产
    const sellerBalance = this.getBalanceObject(trade.sellUserId, trade.baseAsset);
    if (!sellerBalance || this.compare(sellerBalance.frozen, trade.quantity) < 0) {
      throw new Error('Seller insufficient frozen balance');
    }

    // 买方：扣除冻结的计价资产，增加基础资产
    buyerBalance.frozen = this.subtract(buyerBalance.frozen, totalAmount);
    const buyerBaseBalance = this.getOrCreateBalance(trade.buyUserId, trade.baseAsset);
    buyerBaseBalance.available = this.add(buyerBaseBalance.available, trade.quantity);

    // 卖方：扣除冻结的基础资产，增加计价资产
    sellerBalance.frozen = this.subtract(sellerBalance.frozen, trade.quantity);
    const sellerQuoteBalance = this.getOrCreateBalance(trade.sellUserId, trade.quoteAsset);
    sellerQuoteBalance.available = this.add(sellerQuoteBalance.available, totalAmount);

    // 记录已结算的交易ID
    if (trade.id) {
      this.settledTradeIds.add(trade.id);
    }

    return {
      buyerDeducted: totalAmount,
      sellerCredited: totalAmount,
      success: true
    };
  }

  /**
   * 获取可用余额
   */
  getBalance(userId: string, asset: string): string {
    const balance = this.getBalanceObject(userId, asset);
    return balance ? balance.available : '0';
  }

  /**
   * 获取冻结余额
   */
  getFrozen(userId: string, asset: string): string {
    const balance = this.getBalanceObject(userId, asset);
    return balance ? balance.frozen : '0';
  }

  /**
   * 获取总余额（可用 + 冻结）
   */
  getTotalBalance(userId: string, asset: string): string {
    const balance = this.getBalanceObject(userId, asset);
    if (!balance) return '0';
    return this.add(balance.available, balance.frozen);
  }

  /**
   * 获取余额对象
   */
  private getBalanceObject(userId: string, asset: string): Balance | null {
    const userBalances = this.balances.get(userId);
    if (!userBalances) return null;
    return userBalances.get(asset) || null;
  }

  /**
   * 获取或创建余额对象
   */
  private getOrCreateBalance(userId: string, asset: string): Balance {
    if (!this.balances.has(userId)) {
      this.balances.set(userId, new Map());
    }
    const userBalances = this.balances.get(userId)!;
    if (!userBalances.has(asset)) {
      userBalances.set(asset, { available: '0', frozen: '0' });
    }
    return userBalances.get(asset)!;
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

  /**
   * BigInt 加法
   */
  private add(a: string, b: string): string {
    return (BigInt(a) + BigInt(b)).toString();
  }

  /**
   * BigInt 减法
   */
  private subtract(a: string, b: string): string {
    return (BigInt(a) - BigInt(b)).toString();
  }

  /**
   * BigInt 乘法
   */
  private multiply(a: string, b: string): string {
    return (BigInt(a) * BigInt(b)).toString();
  }
}
