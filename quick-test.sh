#!/bin/bash

# 快速测试命令 - 订单历史和成交记录 API

BASE_URL="http://localhost:3000/api"
TOKEN="token-user1-abc123"

echo "🔍 快速测试订单历史和成交记录 API"
echo ""

case "$1" in
  "orders")
    echo "📋 查询所有订单:"
    curl -s "$BASE_URL/orders" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    ;;

  "trades")
    echo "💰 查询所有成交:"
    curl -s "$BASE_URL/trades" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    ;;

  "btc")
    echo "📋 查询 BTC/USDT 订单:"
    curl -s "$BASE_URL/orders?symbol=BTC/USDT" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    ;;

  "filled")
    echo "✅ 查询已成交订单:"
    curl -s "$BASE_URL/orders?status=FILLED" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    ;;

  "buy")
    echo "📈 查询买单:"
    curl -s "$BASE_URL/orders?side=BUY" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    ;;

  "sell")
    echo "📉 查询卖单:"
    curl -s "$BASE_URL/orders?side=SELL" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    ;;

  "balance")
    echo "💵 查询余额:"
    echo "USDT:"
    curl -s "$BASE_URL/balance?asset=USDT" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    echo ""
    echo "BTC:"
    curl -s "$BASE_URL/balance?asset=BTC" -H "Authorization: Bearer $TOKEN" | python -m json.tool 2>/dev/null || cat
    ;;

  "health")
    echo "❤️ 健康检查:"
    curl -s "$BASE_URL/health" | python -m json.tool 2>/dev/null || cat
    ;;

  *)
    echo "用法: $0 {orders|trades|btc|filled|buy|sell|balance|health}"
    echo ""
    echo "命令说明:"
    echo "  orders  - 查询所有订单"
    echo "  trades  - 查询所有成交记录"
    echo "  btc     - 查询 BTC/USDT 订单"
    echo "  filled  - 查询已成交订单"
    echo "  buy     - 查询买单"
    echo "  sell    - 查询卖单"
    echo "  balance - 查询余额"
    echo "  health  - 健康检查"
    echo ""
    echo "示例:"
    echo "  $0 orders"
    echo "  $0 trades"
    echo "  $0 btc"
    exit 1
    ;;
esac

echo ""
