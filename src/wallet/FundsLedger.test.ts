/**
 * FundsLedger 测试
 * 使用 Node.js 内置 assert
 */

import assert from 'assert';
import { FundsLedger } from './FundsLedger';

async function runTests() {
  console.log('开始测试 FundsLedger...\n');

  // 测试1：初始化余额
  await test1();

  // 测试2：冻结资金
  await test2();

  // 测试3：释放资金
  await test3();

  // 测试4：余额不足无法冻结
  await test4();

  // 测试5：结算交易
  await test5();

  // 测试6：冻结余额不足无法结算
  await test6();

  // 测试7：重复结算同一笔交易
  await test7();

  console.log('\n✅ 所有测试通过！');
}

// 测试1：初始化余额
async function test1() {
  console.log('测试1：初始化余额');
  const ledger = new FundsLedger();

  ledger.initBalance('user1', 'USDT', '10000');
  ledger.initBalance('user1', 'BTC', '5');

  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '10000', 'USDT余额应为10000');
  assert.strictEqual(ledger.getBalance('user1', 'BTC'), '5', 'BTC余额应为5');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '0', '冻结余额应为0');

  console.log('  ✓ 通过\n');
}

// 测试2：冻结资金
async function test2() {
  console.log('测试2：冻结资金');
  const ledger = new FundsLedger();

  ledger.initBalance('user1', 'USDT', '10000');

  const frozen = ledger.freeze('user1', 'USDT', '3000', 'order', 'order123');

  assert.strictEqual(frozen, true, '冻结应成功');
  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '7000', '可用余额应为7000');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '3000', '冻结余额应为3000');
  assert.strictEqual(ledger.getTotalBalance('user1', 'USDT'), '10000', '总余额应为10000');

  console.log('  ✓ 通过\n');
}

// 测试3：释放资金
async function test3() {
  console.log('测试3：释放资金');
  const ledger = new FundsLedger();

  ledger.initBalance('user1', 'USDT', '10000');
  ledger.freeze('user1', 'USDT', '3000', 'order', 'order123');

  const released = ledger.release('user1', 'USDT', '3000', 'cancel', 'order123');

  assert.strictEqual(released, true, '释放应成功');
  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '10000', '可用余额应恢复为10000');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '0', '冻结余额应为0');

  console.log('  ✓ 通过\n');
}

// 测试4：余额不足无法冻结
async function test4() {
  console.log('测试4：余额不足无法冻结');
  const ledger = new FundsLedger();

  ledger.initBalance('user1', 'USDT', '1000');

  const frozen = ledger.freeze('user1', 'USDT', '2000', 'order', 'order123');

  assert.strictEqual(frozen, false, '余额不足应冻结失败');
  assert.strictEqual(ledger.getBalance('user1', 'USDT'), '1000', '可用余额应保持不变');
  assert.strictEqual(ledger.getFrozen('user1', 'USDT'), '0', '冻结余额应为0');

  console.log('  ✓ 通过\n');
}

// 测试5：结算交易
async function test5() {
  console.log('测试5：结算交易');
  const ledger = new FundsLedger();

  // 买方有 100000 USDT
  ledger.initBalance('buyer', 'USDT', '100000');
  ledger.initBalance('buyer', 'BTC', '0');

  // 卖方有 5 BTC
  ledger.initBalance('seller', 'BTC', '5');
  ledger.initBalance('seller', 'USDT', '0');

  // 买方冻结 5000 USDT（买 0.1 BTC @ 50000）
  ledger.freeze('buyer', 'USDT', '50000', 'order', 'buy_order');

  // 卖方冻结 0.1 BTC
  ledger.freeze('seller', 'BTC', '1', 'order', 'sell_order');

  // 结算交易：1 BTC @ 50000 USDT
  const result = ledger.settleTrade({
    buyUserId: 'buyer',
    sellUserId: 'seller',
    price: '50000',
    quantity: '1',
    baseAsset: 'BTC',
    quoteAsset: 'USDT'
  });

  assert.strictEqual(result.success, true, '结算应成功');
  assert.strictEqual(result.buyerDeducted, '50000', '买方应扣除50000 USDT');

  // 买方：扣除 50000 USDT，获得 1 BTC
  assert.strictEqual(ledger.getBalance('buyer', 'USDT'), '50000', '买方USDT余额应为50000');
  assert.strictEqual(ledger.getFrozen('buyer', 'USDT'), '0', '买方USDT冻结应为0');
  assert.strictEqual(ledger.getBalance('buyer', 'BTC'), '1', '买方BTC余额应为1');

  // 卖方：扣除 1 BTC，获得 50000 USDT
  assert.strictEqual(ledger.getBalance('seller', 'BTC'), '4', '卖方BTC余额应为4');
  assert.strictEqual(ledger.getFrozen('seller', 'BTC'), '0', '卖方BTC冻结应为0');
  assert.strictEqual(ledger.getBalance('seller', 'USDT'), '50000', '卖方USDT余额应为50000');

  console.log('  ✓ 通过\n');
}

// 测试6：冻结余额不足无法结算
async function test6() {
  console.log('测试6：冻结余额不足无法结算');
  const ledger = new FundsLedger();

  ledger.initBalance('buyer', 'USDT', '10000');
  ledger.initBalance('seller', 'BTC', '5');

  // 买方只冻结 1000 USDT，但尝试结算 5000 USDT
  ledger.freeze('buyer', 'USDT', '1000', 'order', 'buy_order');
  ledger.freeze('seller', 'BTC', '1', 'order', 'sell_order');

  try {
    ledger.settleTrade({
      buyUserId: 'buyer',
      sellUserId: 'seller',
      price: '50000',
      quantity: '1',
      baseAsset: 'BTC',
      quoteAsset: 'USDT'
    });
    assert.fail('应该抛出余额不足错误');
  } catch (e: any) {
    assert.strictEqual(e.message, 'Buyer insufficient frozen balance', '应抛出买方冻结余额不足错误');
  }

  console.log('  ✓ 通过\n');
}

// 测试7：重复结算同一笔交易
async function test7() {
  console.log('测试7：重复结算同一笔交易');
  const ledger = new FundsLedger();

  // 初始化余额
  ledger.initBalance('buyer', 'USDT', '100000');
  ledger.initBalance('buyer', 'BTC', '0');
  ledger.initBalance('seller', 'BTC', '10');
  ledger.initBalance('seller', 'USDT', '0');

  // 冻结资金
  ledger.freeze('buyer', 'USDT', '50000', 'order', 'buy_order');
  ledger.freeze('seller', 'BTC', '1', 'order', 'sell_order');

  // 构造同一笔交易
  const trade = {
    id: 'trade-123',
    buyUserId: 'buyer',
    sellUserId: 'seller',
    price: '50000',
    quantity: '1',
    baseAsset: 'BTC',
    quoteAsset: 'USDT'
  };

  // 第一次结算：应成功
  const firstResult = ledger.settleTrade(trade);
  assert.strictEqual(firstResult.success, true, '第一次结算应成功');

  // 记录第一次结算后的余额
  const buyerUsdtAfterFirst = ledger.getBalance('buyer', 'USDT');
  const buyerBtcAfterFirst = ledger.getBalance('buyer', 'BTC');
  const sellerUsdtAfterFirst = ledger.getBalance('seller', 'USDT');
  const sellerBtcAfterFirst = ledger.getBalance('seller', 'BTC');

  console.log(`  第一次结算后 - 买方: ${buyerUsdtAfterFirst} USDT, ${buyerBtcAfterFirst} BTC`);
  console.log(`  第一次结算后 - 卖方: ${sellerUsdtAfterFirst} USDT, ${sellerBtcAfterFirst} BTC`);

  // 验证第一次结算结果
  assert.strictEqual(buyerUsdtAfterFirst, '50000', '买方USDT应为50000');
  assert.strictEqual(buyerBtcAfterFirst, '1', '买方BTC应为1');
  assert.strictEqual(sellerUsdtAfterFirst, '50000', '卖方USDT应为50000');
  assert.strictEqual(sellerBtcAfterFirst, '9', '卖方BTC应为9');

  // 第二次结算：使用同一个 trade 对象
  const secondResult = ledger.settleTrade(trade);

  // 第二次结算应返回 success: false（幂等性保护）
  assert.strictEqual(secondResult.success, false, '第二次结算应返回失败（幂等性保护）');

  // 记录第二次结算后的余额
  const buyerUsdtAfterSecond = ledger.getBalance('buyer', 'USDT');
  const buyerBtcAfterSecond = ledger.getBalance('buyer', 'BTC');
  const sellerUsdtAfterSecond = ledger.getBalance('seller', 'USDT');
  const sellerBtcAfterSecond = ledger.getBalance('seller', 'BTC');

  console.log(`  第二次结算后 - 买方: ${buyerUsdtAfterSecond} USDT, ${buyerBtcAfterSecond} BTC`);
  console.log(`  第二次结算后 - 卖方: ${sellerUsdtAfterSecond} USDT, ${sellerBtcAfterSecond} BTC`);

  // 验证第二次结算不能重复扣款和入账
  assert.strictEqual(buyerUsdtAfterSecond, buyerUsdtAfterFirst, '买方USDT余额不应改变（不能重复扣款）');
  assert.strictEqual(buyerBtcAfterSecond, buyerBtcAfterFirst, '买方BTC余额不应改变（不能重复入账）');
  assert.strictEqual(sellerUsdtAfterSecond, sellerUsdtAfterFirst, '卖方USDT余额不应改变（不能重复入账）');
  assert.strictEqual(sellerBtcAfterSecond, sellerBtcAfterFirst, '卖方BTC余额不应改变（不能重复扣款）');

  console.log('  ✓ 通过\n');
}

// 运行所有测试
runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
