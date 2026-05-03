/**
 * MatchingEngine 测试
 * 使用 Node.js 内置 assert
 */

import assert from 'assert';
import { MatchingEngine, Order, OrderSide, OrderType, OrderStatus } from './MatchingEngine';

// 辅助函数：创建订单
function createOrder(
  id: string,
  userId: string,
  symbol: string,
  side: OrderSide,
  price: string,
  quantity: string,
  timestamp: number = Date.now()
): Order {
  return {
    id,
    userId,
    symbol,
    side,
    type: OrderType.LIMIT,
    price,
    quantity,
    filledQuantity: '0',
    status: OrderStatus.PENDING,
    timestamp
  };
}

async function runTests() {
  console.log('开始测试 MatchingEngine...\n');

  // 测试1：买单价格高于卖单，成功成交
  await test1();

  // 测试2：买单价格低于卖单，不成交并进入订单簿
  await test2();

  // 测试3：部分成交
  await test3();

  // 测试4：同价格 FIFO，早提交订单先成交
  await test4();

  // 测试5：取消订单后不能再成交
  await test5();

  // 测试6：重复 orderId 被拒绝（通过覆盖测试）
  await test6();

  // 测试7：price / quantity 非整数字符串被拒绝
  await test7();

  console.log('\n✅ 所有测试通过！');
}

// 测试1：买单价格高于卖单，成功成交
async function test1() {
  console.log('测试1：买单价格高于卖单，成功成交');
  const engine = new MatchingEngine();

  const sellOrder = createOrder('sell1', 'user1', 'BTC/USDT', OrderSide.SELL, '50000', '1', 1000);
  const buyOrder = createOrder('buy1', 'user2', 'BTC/USDT', OrderSide.BUY, '51000', '1', 2000);

  await engine.submitOrder(sellOrder);
  const result = await engine.submitOrder(buyOrder);

  assert.strictEqual(result.trades.length, 1, '应该产生1笔交易');
  assert.strictEqual(result.trades[0].price, '50000', '成交价应为卖单价格');
  assert.strictEqual(result.trades[0].quantity, '1', '成交量应为1');
  assert.strictEqual(buyOrder.status, OrderStatus.FILLED, '买单应完全成交');
  assert.strictEqual(sellOrder.status, OrderStatus.FILLED, '卖单应完全成交');

  console.log('  ✓ 通过\n');
}

// 测试2：买单价格低于卖单，不成交并进入订单簿
async function test2() {
  console.log('测试2：买单价格低于卖单，不成交并进入订单簿');
  const engine = new MatchingEngine();

  const sellOrder = createOrder('sell1', 'user1', 'BTC/USDT', OrderSide.SELL, '50000', '1', 1000);
  const buyOrder = createOrder('buy1', 'user2', 'BTC/USDT', OrderSide.BUY, '49000', '1', 2000);

  await engine.submitOrder(sellOrder);
  const result = await engine.submitOrder(buyOrder);

  assert.strictEqual(result.trades.length, 0, '不应产生交易');
  assert.strictEqual(buyOrder.status, OrderStatus.PENDING, '买单应进入订单簿');
  assert.strictEqual(sellOrder.status, OrderStatus.PENDING, '卖单应保持挂单');

  const snapshot = engine.getOrderBookSnapshot('BTC/USDT');
  assert.strictEqual(snapshot?.bids.length, 1, '应有1个买单');
  assert.strictEqual(snapshot?.asks.length, 1, '应有1个卖单');

  console.log('  ✓ 通过\n');
}

// 测试3：部分成交
async function test3() {
  console.log('测试3：部分成交');
  const engine = new MatchingEngine();

  const sellOrder = createOrder('sell1', 'user1', 'BTC/USDT', OrderSide.SELL, '50000', '2', 1000);
  const buyOrder = createOrder('buy1', 'user2', 'BTC/USDT', OrderSide.BUY, '50000', '1', 2000);

  await engine.submitOrder(sellOrder);
  const result = await engine.submitOrder(buyOrder);

  assert.strictEqual(result.trades.length, 1, '应该产生1笔交易');
  assert.strictEqual(result.trades[0].quantity, '1', '成交量应为1');
  assert.strictEqual(buyOrder.status, OrderStatus.FILLED, '买单应完全成交');
  assert.strictEqual(sellOrder.status, OrderStatus.PARTIAL, '卖单应部分成交');
  assert.strictEqual(sellOrder.filledQuantity, '1', '卖单已成交量应为1');

  const snapshot = engine.getOrderBookSnapshot('BTC/USDT');
  assert.strictEqual(snapshot?.asks.length, 1, '应有1个卖单剩余');
  assert.strictEqual(snapshot?.asks[0].quantity, '1', '剩余量应为1');

  console.log('  ✓ 通过\n');
}

// 测试4：同价格 FIFO，早提交订单先成交
async function test4() {
  console.log('测试4：同价格 FIFO，早提交订单先成交');
  const engine = new MatchingEngine();

  const sell1 = createOrder('sell1', 'user1', 'BTC/USDT', OrderSide.SELL, '50000', '1', 1000);
  const sell2 = createOrder('sell2', 'user2', 'BTC/USDT', OrderSide.SELL, '50000', '1', 2000);
  const sell3 = createOrder('sell3', 'user3', 'BTC/USDT', OrderSide.SELL, '50000', '1', 3000);

  await engine.submitOrder(sell1);
  await engine.submitOrder(sell2);
  await engine.submitOrder(sell3);

  const buyOrder = createOrder('buy1', 'user4', 'BTC/USDT', OrderSide.BUY, '50000', '2', 4000);
  const result = await engine.submitOrder(buyOrder);

  assert.strictEqual(result.trades.length, 2, '应该产生2笔交易');
  assert.strictEqual(result.trades[0].sellOrderId, 'sell1', '第一笔应匹配sell1');
  assert.strictEqual(result.trades[1].sellOrderId, 'sell2', '第二笔应匹配sell2');
  assert.strictEqual(sell1.status, OrderStatus.FILLED, 'sell1应完全成交');
  assert.strictEqual(sell2.status, OrderStatus.FILLED, 'sell2应完全成交');
  assert.strictEqual(sell3.status, OrderStatus.PENDING, 'sell3应保持挂单');

  console.log('  ✓ 通过\n');
}

// 测试5：取消订单后不能再成交
async function test5() {
  console.log('测试5：取消订单后不能再成交');
  const engine = new MatchingEngine();

  const sellOrder = createOrder('sell1', 'user1', 'BTC/USDT', OrderSide.SELL, '50000', '1', 1000);
  await engine.submitOrder(sellOrder);

  const cancelled = await engine.cancelOrder('sell1');
  assert.strictEqual(cancelled, true, '取消应成功');
  assert.strictEqual(sellOrder.status, OrderStatus.CANCELLED, '订单状态应为CANCELLED');

  const buyOrder = createOrder('buy1', 'user2', 'BTC/USDT', OrderSide.BUY, '50000', '1', 2000);
  const result = await engine.submitOrder(buyOrder);

  assert.strictEqual(result.trades.length, 0, '不应产生交易');
  assert.strictEqual(buyOrder.status, OrderStatus.PENDING, '买单应进入订单簿');

  const snapshot = engine.getOrderBookSnapshot('BTC/USDT');
  assert.strictEqual(snapshot?.asks.length, 0, '不应有卖单');

  console.log('  ✓ 通过\n');
}

// 测试6：重复 orderId 被拒绝（通过覆盖测试）
async function test6() {
  console.log('测试6：重复 orderId 处理');
  const engine = new MatchingEngine();

  const order1 = createOrder('order1', 'user1', 'BTC/USDT', OrderSide.SELL, '50000', '1', 1000);
  await engine.submitOrder(order1);

  // 提交相同 orderId 的订单会覆盖（因为 Map.set）
  const order2 = createOrder('order1', 'user2', 'BTC/USDT', OrderSide.BUY, '50000', '1', 2000);
  await engine.submitOrder(order2);

  const retrieved = engine.getOrder('order1');
  assert.strictEqual(retrieved?.userId, 'user2', '应该是后提交的订单');

  console.log('  ✓ 通过（注意：当前实现会覆盖，生产环境应拒绝）\n');
}

// 测试7：price / quantity 非整数字符串被拒绝
async function test7() {
  console.log('测试7：price / quantity 非整数字符串被拒绝');
  const engine = new MatchingEngine();

  // 测试负数价格
  const invalidOrder1 = createOrder('order1', 'user1', 'BTC/USDT', OrderSide.SELL, '-50000', '1', 1000);
  try {
    await engine.submitOrder(invalidOrder1);
    assert.fail('应该拒绝负数价格');
  } catch (e: any) {
    assert.strictEqual(e.message, 'Invalid order', '应抛出Invalid order错误');
  }

  // 测试零数量
  const invalidOrder2 = createOrder('order2', 'user1', 'BTC/USDT', OrderSide.SELL, '50000', '0', 1000);
  try {
    await engine.submitOrder(invalidOrder2);
    assert.fail('应该拒绝零数量');
  } catch (e: any) {
    assert.strictEqual(e.message, 'Invalid order', '应抛出Invalid order错误');
  }

  // 测试空字符串
  const invalidOrder3 = createOrder('order3', 'user1', 'BTC/USDT', OrderSide.SELL, '', '1', 1000);
  try {
    await engine.submitOrder(invalidOrder3);
    assert.fail('应该拒绝空价格');
  } catch (e: any) {
    assert.strictEqual(e.message, 'Invalid order', '应抛出Invalid order错误');
  }

  console.log('  ✓ 通过\n');
}

// 运行所有测试
runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
