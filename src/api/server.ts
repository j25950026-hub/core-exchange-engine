/**
 * API server
 */

import express from 'express';
import cors from 'cors';
import { MatchingEngine } from '../matching/MatchingEngine';
import { FundsLedger } from '../wallet/FundsLedger';
import { ExchangeService } from '../exchange/ExchangeService';
import { HistoryService } from '../history/HistoryService';
import { createRoutes } from './routes';
import { getAllTokens } from './auth';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

const engine = new MatchingEngine();
const ledger = new FundsLedger();
const exchange = new ExchangeService(engine, ledger);
const historyService = new HistoryService();

console.log('Initializing test balances...');
ledger.initBalance('user1', 'USDT', '1000000');
ledger.initBalance('user1', 'BTC', '10');
ledger.initBalance('user2', 'USDT', '500000');
ledger.initBalance('user2', 'BTC', '5');
ledger.initBalance('user3', 'USDT', '2000000');
ledger.initBalance('user3', 'BTC', '20');

console.log('Test balances initialized.');
console.log('  user1: 1000000 USDT, 10 BTC');
console.log('  user2: 500000 USDT, 5 BTC');
console.log('  user3: 2000000 USDT, 20 BTC');

app.use('/api', createRoutes(exchange, engine, historyService));

app.listen(PORT, () => {
  console.log(`\nAPI server started successfully!`);
  console.log(`Listening on port: ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  console.log(`\nAvailable endpoints:`);
  console.log(`POST   /api/orders          auth required`);
  console.log(`POST   /api/orders/cancel   auth required`);
  console.log(`GET    /api/orderbook?symbol=BTC/USDT`);
  console.log(`GET    /api/balance?asset=USDT   auth required`);
  console.log(`GET    /api/orders          auth required`);
  console.log(`GET    /api/trades          auth required`);
  console.log(`GET    /api/health`);

  console.log(`\nTest tokens:`);
  getAllTokens().forEach(({ token, userId }) => {
    console.log(`  ${userId}: ${token}`);
  });
});

export { app, exchange, engine, ledger };