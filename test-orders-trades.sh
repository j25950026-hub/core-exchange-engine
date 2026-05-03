#!/bin/bash

# 测试订单历史和成交记录 API（使用正确的数值）

BASE_URL="http://localhost:3000/api"

# 测试用的 token
TOKEN1="token-user1-abc123"
TOKEN2="token-user2-def456"
TOKEN3="token-user3-ghi789"

echo "=========================================="
echo "测试订单历史和成交记录 API"
echo "=========================================="
echo ""

# 1. 健康检查
echo "【步骤 1】健康检查"
curl -s "$BASE_URL/health"
echo -e "\n"

# 2. 查看初始余额
echo "【步骤 2】查看初始余额"
echo "user1 USDT 余额:"
curl -s "$BASE_URL/balance?asset=USDT" -H "Authorization: Bearer $TOKEN1"
echo -e "\nuser1 BTC 余额:"
curl -s "$BASE_URL/balance?asset=BTC" -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 3. user1 创建订单
echo "【步骤 3】user1 创建订单"
echo "创建订单 1: BTC/USDT 买单 (价格 50000, 数量 1)"
curl -s -X POST "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-user1-001",
    "symbol": "BTC/USDT",
    "side": "BUY",
    "price": "50000",
    "quantity": "1"
  }'
echo -e "\n"

echo "创建订单 2: BTC/USDT 卖单 (价格 51000, 数量 2)"
curl -s -X POST "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-user1-002",
    "symbol": "BTC/USDT",
    "side": "SELL",
    "price": "51000",
    "quantity": "2"
  }'
echo -e "\n"

echo "创建订单 3: BTC/USDT 买单 (价格 49500, 数量 3)"
curl -s -X POST "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-user1-003",
    "symbol": "BTC/USDT",
    "side": "BUY",
    "price": "49500",
    "quantity": "3"
  }'
echo -e "\n"

# 4. user2 创建订单（会与 user1 撮合）
echo "【步骤 4】user2 创建订单（触发撮合）"
echo "创建订单 4: BTC/USDT 卖单 (价格 49000, 数量 2) - 会与 user1 的买单撮合"
curl -s -X POST "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN2" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-user2-001",
    "symbol": "BTC/USDT",
    "side": "SELL",
    "price": "49000",
    "quantity": "2"
  }'
echo -e "\n"

echo "创建订单 5: BTC/USDT 买单 (价格 52000, 数量 1) - 会与 user1 的卖单撮合"
curl -s -X POST "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN2" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-user2-002",
    "symbol": "BTC/USDT",
    "side": "BUY",
    "price": "52000",
    "quantity": "1"
  }'
echo -e "\n"

# 5. user3 创建订单
echo "【步骤 5】user3 创建订单"
curl -s -X POST "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN3" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-user3-001",
    "symbol": "BTC/USDT",
    "side": "BUY",
    "price": "48000",
    "quantity": "5"
  }'
echo -e "\n"

# 6. user1 查询所有订单
echo "【步骤 6】user1 查询所有订单"
curl -s "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 7. user1 查询 BTC/USDT 订单
echo "【步骤 7】user1 查询 BTC/USDT 订单"
curl -s "$BASE_URL/orders?symbol=BTC/USDT" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 8. user1 查询买单
echo "【步骤 8】user1 查询买单"
curl -s "$BASE_URL/orders?side=BUY" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 9. user1 查询 FILLED 状态订单
echo "【步骤 9】user1 查询已成交订单"
curl -s "$BASE_URL/orders?status=FILLED" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 10. user1 查询 PARTIAL 状态订单
echo "【步骤 10】user1 查询部分成交订单"
curl -s "$BASE_URL/orders?status=PARTIAL" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 11. user1 查询成交记录
echo "【步骤 11】user1 查询所有成交记录"
curl -s "$BASE_URL/trades" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 12. user1 查询 BTC/USDT 成交记录
echo "【步骤 12】user1 查询 BTC/USDT 成交记录"
curl -s "$BASE_URL/trades?symbol=BTC/USDT" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 13. user1 查询特定订单的成交记录
echo "【步骤 13】user1 查询订单 order-user1-001 的成交记录"
curl -s "$BASE_URL/trades?orderId=order-user1-001" \
  -H "Authorization: Bearer $TOKEN1"
echo -e "\n"

# 14. user2 查询订单（验证隔离性）
echo "【步骤 14】user2 查询订单（验证隔离性）"
curl -s "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN2"
echo -e "\n"

# 15. user2 查询成交记录
echo "【步骤 15】user2 查询成交记录"
curl -s "$BASE_URL/trades" \
  -H "Authorization: Bearer $TOKEN2"
echo -e "\n"

# 16. user3 查询订单（应该只有自己的）
echo "【步骤 16】user3 查询订单"
curl -s "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN3"
echo -e "\n"

# 17. 测试无效 token
echo "【步骤 17】测试无效 token"
curl -s "$BASE_URL/orders" \
  -H "Authorization: Bearer invalid-token"
echo -e "\n"

# 18. 测试缺少 token
echo "【步骤 18】测试缺少 token"
curl -s "$BASE_URL/orders"
echo -e "\n"

# 19. 查看订单簿
echo "【步骤 19】查看 BTC/USDT 订单簿"
curl -s "$BASE_URL/orderbook?symbol=BTC/USDT"
echo -e "\n"

echo "=========================================="
echo "测试完成"
echo "=========================================="
