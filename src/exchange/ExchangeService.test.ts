/**
 * ExchangeService 测试
 * 使用 Node.js 内置 assert
 */

import assert from 'assert';
import { ExchangeService } from './ExchangeService';
import { MatchingEngine, OrderSide } from '../matching/MatchingEngine';
import { FundsLedger } from '../wallet/FundsLedger';

async function runTests() {
  console.log('开始测试 ExchangeService...\n');

  // 测试1：下买单成功撮合
  await test1();

  // 测试2：余额不足无法下单
  await test2();

  // 测试3：部分成交
  await test3();

  // 测试4：取消订单释放冻结资金
  await test4();

  // 测试5：完整交易流程
  await test5();

  // 测试6：重复 orderId 处理
  await test6();

  // 测试7：成交价格和差额释放
  await test7();

  // 测试8：Maker price 规则和差额释放
  await test8();

  console.log('\n✅ 所有测试通过！');
}

// 测试1：下买单成功撮合
async function test1() {
  console.log('测试1：下买单成功撮合');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  // 初始化余额
  ledger.initBalance('seller', 'BTC', '10');
  ledger.initBalance('seller', 'USDT', '0');
  ledger.initBalance('buyer', 'USDT', '100000');
  ledger.initBalance('buyer', 'BTC', '0');

  // 卖方下卖单
  const sellResult = await exchange.placeLimitOrder({
    id: 'sell1',
    userId: 'seller',
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    price: '50000',
    quantity: '1'
  });

  assert.strictEqual(sellResult.success, true, '卖单应下单成功');
  assert.strictEqual(ledger.getFrozen('seller', 'BTC'), '1', '卖方BTC应冻结1');

  // 买方下买单，立即成交
  const buyResult = await exchange.placeLimitOrder({
    id: 'buy1',
    userId: 'buyer',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '50000',
    quantity: '1'
  });

  assert.strictEqual(buyResult.success, true, '买单应下单成功');
  assert.strictEqual(buyResult.trades.length, 1, '应产生1笔交易');

  // 验证余额
  assert.strictEqual(ledger.getBalance('buyer', 'BTC'), '1', '买方应获得1 BTC');
  assert.strictEqual(ledger.getBalance('buyer', 'USDT'), '50000', '买方USDT余额应为50000');
  assert.strictEqual(ledger.getBalance('seller', 'BTC'), '9', '卖方BTC余额应为9');
  assert.strictEqual(ledger.getBalance('seller', 'USDT'), '50000', '卖方应获得50000 USDT');

  // 验证冻结余额已清零
  assert.strictEqual(ledger.getFrozen('buyer', 'USDT'), '0', '买方USDT冻结应为0');
  assert.strictEqual(ledger.getFrozen('seller', 'BTC'), '0', '卖方BTC冻结应为0');

  console.log('  ✓ 通过\n');
}

// 测试2：余额不足无法下单
async function test2() {
  console.log('测试2：余额不足无法下单');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  ledger.initBalance('user1', 'USDT', '1000');

  const result = await exchange.placeLimitOrder({
    id: 'buy1',
    userId: 'user1',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '50000',
    quantity: '1'
  });

  assert.strictEqual(result.success, false, '应下单失败');
  assert.strictEqual(result.message, 'Insufficient USDT balance', '应提示余额不足');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '0', '不应冻结资金');

  console.log('  ✓ 通过\n');
}

// 测试3：部分成交
async function test3() {
  console.log('测试3：部分成交');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  ledger.initBalance('seller', 'BTC', '10');
  ledger.initBalance('buyer', 'USDT', '100000');
  ledger.initBalance('buyer', 'BTC', '0');

  // 卖方下 2 BTC
  await exchange.placeLimitOrder({
    id: 'sell1',
    userId: 'seller',
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    price: '50000',
    quantity: '2'
  });

  // 买方只买 1 BTC
  const buyResult = await exchange.placeLimitOrder({
    id: 'buy1',
    userId: 'buyer',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '50000',
    quantity: '1'
  });

  assert.strictEqual(buyResult.success, true, '买单应成功');
  assert.strictEqual(buyResult.trades.length, 1, '应产生1笔交易');

  // 卖方应还有 1 BTC 冻结
  assert.strictEqual(ledger.getFrozen('seller', 'BTC'), '1', '卖方应还有1 BTC冻结');
  assert.strictEqual(ledger.getBalance('buyer', 'BTC'), '1', '买方应获得1 BTC');

  console.log('  ✓ 通过\n');
}

// 测试4：取消订单释放冻结资金
async function test4() {
  console.log('测试4：取消订单释放冻结资金');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  ledger.initBalance('user1', 'USDT', '100000');

  // 下买单
  const placeResult = await exchange.placeLimitOrder({
    id: 'buy1',
    userId: 'user1',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '50000',
    quantity: '2'
  });

  assert.strictEqual(placeResult.success, true, '下单应成功');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '100000', '应冻结100000 USDT');
  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '0', '可用余额应为0');

  // 取消订单
  const cancelResult = await exchange.cancelOrder('buy1');

  assert.strictEqual(cancelResult.success, true, '取消应成功');
  assert.strictEqual(cancelResult.releasedAmount, '100000', '应释放100000 USDT');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '0', '冻结余额应为0');
  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '100000', '可用余额应恢复为100000');

  console.log('  ✓ 通过\n');
}

// 测试5：完整交易流程
async function test5() {
  console.log('测试5：完整交易流程');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  // 初始化3个用户
  ledger.initBalance('seller1', 'BTC', '5');
  ledger.initBalance('seller2', 'BTC', '5');
  ledger.initBalance('buyer1', 'USDT', '200000');

  // 两个卖方下单
  await exchange.placeLimitOrder({
    id: 'sell1',
    userId: 'seller1',
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    price: '50000',
    quantity: '1'
  });

  await exchange.placeLimitOrder({
    id: 'sell2',
    userId: 'seller2',
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    price: '51000',
    quantity: '1'
  });

  // 买方下单，匹配价格更优的 sell1
  const buyResult = await exchange.placeLimitOrder({
    id: 'buy1',
    userId: 'buyer1',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '51000',
    quantity: '1'
  });

  assert.strictEqual(buyResult.success, true, '买单应成功');
  assert.strictEqual(buyResult.trades.length, 1, '应产生1笔交易');
  assert.strictEqual(buyResult.trades[0].sellOrderId, 'sell1', '应匹配sell1');
  assert.strictEqual(buyResult.trades[0].price, '50000', '成交价应为50000');

  // 验证余额
  assert.strictEqual(ledger.getBalance('buyer1', 'BTC'), '1', '买方应获得1 BTC');
  assert.strictEqual(ledger.getBalance('seller1', 'USDT'), '50000', 'seller1应获得50000 USDT');
  assert.strictEqual(ledger.getFrozen('seller2', 'BTC'), '1', 'seller2的订单应继续冻结');

  console.log('  ✓ 通过\n');
}

// 测试6：重复 orderId 处理
async function test6() {
  console.log('测试6：重复 orderId 处理');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  ledger.initBalance('user1', 'USDT', '200000');

  // 第一次下单：应成功并冻结资金
  const firstResult = await exchange.placeLimitOrder({
    id: 'duplicate-order',
    userId: 'user1',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '50000',
    quantity: '2'
  });

  assert.strictEqual(firstResult.success, true, '第一次下单应成功');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '100000', '应冻结100000 USDT');
  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '100000', '可用余额应为100000');

  // 第二次下单：使用相同 orderId，应失败
  const secondResult = await exchange.placeLimitOrder({
    id: 'duplicate-order',
    userId: 'user1',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '51000',
    quantity: '1'
  });

  assert.strictEqual(secondResult.success, false, '第二次下单应失败');

  // 验证资金状态未改变：不应重复冻结
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '100000', '冻结金额应保持100000（未重复冻结）');
  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '100000', '可用余额应保持100000');

  console.log('  ✓ 通过\n');
}

// 测试7：成交价格和差额释放
async function test7() {
  console.log('测试7：成交价格和差额释放');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  ledger.initBalance('buyer', 'USDT', '10000');
  ledger.initBalance('buyer', 'BTC', '0');
  ledger.initBalance('seller', 'BTC', '100');
  ledger.initBalance('seller', 'USDT', '0');

  // 买家下买单：price=100, quantity=10，应冻结 1000 USDT
  const buyResult = await exchange.placeLimitOrder({
    id: 'buy1',
    userId: 'buyer',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '100',
    quantity: '10'
  });

  assert.strictEqual(buyResult.success, true, '买单应下单成功');
  assert.strictEqual(ledger.getFrozen('buyer', 'USDT'), '1000', '买家应冻结1000 USDT');
  assert.strictEqual(ledger.getBalance('buyer', 'USDT'), '9000', '买家可用余额应为9000 USDT');

  // 卖家下卖单：price=80, quantity=10
  const sellResult = await exchange.placeLimitOrder({
    id: 'sell1',
    userId: 'seller',
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    price: '80',
    quantity: '10'
  });

  assert.strictEqual(sellResult.success, true, '卖单应下单成功');
  assert.strictEqual(sellResult.trades.length, 1, '应产生1笔交易');

  // 验证成交价格（按撮合引擎规则）
  const trade = sellResult.trades[0];
  console.log(`  成交价格: ${trade.price}`);

  if (trade.price === '100') {
    // 如果成交价是100，买家支付1000
    assert.strictEqual(ledger.getBalance('buyer', 'USDT'), '9000', '买家USDT余额应为9000');
    assert.strictEqual(ledger.getBalance('seller', 'USDT'), '1000', '卖家应获得1000 USDT');
  } else if (trade.price === '80') {
    // 如果成交价是80，买家只支付800，差额200应释放
    assert.strictEqual(ledger.getBalance('buyer', 'USDT'), '9200', '买家USDT余额应为9200（释放200差额）');
    assert.strictEqual(ledger.getBalance('seller', 'USDT'), '800', '卖家应获得800 USDT');
  } else {
    throw new Error(`未预期的成交价格: ${trade.price}`);
  }

  // 验证冻结余额已清零
  assert.strictEqual(ledger.getFrozen('buyer', 'USDT'), '0', '买家USDT冻结应为0');
  assert.strictEqual(ledger.getFrozen('seller', 'BTC'), '0', '卖家BTC冻结应为0');

  // 验证BTC转移
  assert.strictEqual(ledger.getBalance('buyer', 'BTC'), '10', '买家应获得10 BTC');
  assert.strictEqual(ledger.getBalance('seller', 'BTC'), '90', '卖家BTC余额应为90');

  console.log('  ✓ 通过\n');
}

// 测试8：Maker price 规则和差额释放
async function test8() {
  console.log('测试8：Maker price 规则和差额释放');
  const engine = new MatchingEngine();
  const ledger = new FundsLedger();
  const exchange = new ExchangeService(engine, ledger);

  ledger.initBalance('seller', 'BTC', '100');
  ledger.initBalance('seller', 'USDT', '0');
  ledger.initBalance('buyer', 'USDT', '10000');
  ledger.initBalance('buyer', 'BTC', '0');

  // 1. 卖家先挂卖单：price=80, quantity=10
  const sellResult = await exchange.placeLimitOrder({
    id: 'sell1',
    userId: 'seller',
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    price: '80',
    quantity: '10'
  });

  assert.strictEqual(sellResult.success, true, '卖单应下单成功');
  assert.strictEqual(ledger.getFrozen('seller', 'BTC'), '10', '卖家应冻结10 BTC');

  // 2. 买家后下买单：price=100, quantity=10
  // 下单前应冻结 1000 USDT
  const buyResult = await exchange.placeLimitOrder({
    id: 'buy1',
    userId: 'buyer',
    symbol: 'BTC/USDT',
    side: OrderSide.BUY,
    price: '100',
    quantity: '10'
  });

  assert.strictEqual(buyResult.success, true, '买单应下单成功');
  assert.strictEqual(buyResult.trades.length, 1, '应产生1笔交易');

  // 3. 验证成交价格：按 maker price 规则应该是 80
  const trade = buyResult.trades[0];
  console.log(`  成交价格: ${trade.price}`);
  assert.strictEqual(trade.price, '80', '成交价应为 maker 价格 80');

  // 4. 验证买家资金：实际支付 800，差额 200 应释放
  assert.strictEqual(ledger.getBalance('buyer', 'USDT'), '9200', '买家USDT余额应为9200（10000-800）');
  assert.strictEqual(ledger.getFrozen('buyer', 'USDT'), '0', '买家USDT冻结应为0');

  // 5. 验证卖家获得 800 USDT
  assert.strictEqual(ledger.getBalance('seller', 'USDT'), '800', '卖家应获得800 USDT');

  // 6. 验证BTC转移
  assert.strictEqual(ledger.getBalance('buyer', 'BTC'), '10', '买家应获得10 BTC');
  assert.strictEqual(ledger.getBalance('seller', 'BTC'), '90', '卖家BTC余额应为90');
  assert.strictEqual(ledger.getFrozen('seller', 'BTC'), '0', '卖家BTC冻结应为0');

  console.log('  ✓ 通过\n');
}

// 运行所有测试
runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
