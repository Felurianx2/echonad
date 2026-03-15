# ECHONAD - Monad Prediction Radar

Real-time MON/USD micro prediction bets on Monad Testnet.

## Smart Contract
- **Address**: `0x2c350284Eb76537FF8Ba287B6FDa369D1Bd34339`
- **Network**: Monad Testnet (Chain ID: 10143)
- **RPC**: https://testnet-rpc.monad.xyz

## Features
- Radar-style price prediction interface
- 4 risk levels (2x, 5x, 12x, 30x multipliers)
- Deposit system for seamless betting
- Real-time price updates via RedStone oracle

## Deploy

### Frontend (Next.js)
```bash
cd app
npm install
npm run build
npm start
```

### Contract (Foundry)
```bash
cd contracts
forge build
forge create --rpc-url https://testnet-rpc.monad.xyz --private-key YOUR_KEY --legacy src/EchoNad.sol:EchoNad
```

## Environment Variables
Create `app/.env.local`:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x2c350284Eb76537FF8Ba287B6FDa369D1Bd34339
```

## Monad Blitz Rio Hackathon - March 2026
