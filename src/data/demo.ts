// Données d'exemple FICTIVES (prix inventés) pour découvrir l'app avant d'importer ses propres exports.
export const DEMO_CSV = `date,type,received_asset,received_qty,sent_asset,sent_qty,fee_asset,fee_qty,usd_value,fee_usd,platform,income_type,note
2025-11-04 14:00:00,trade,BTC,0.0009901,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2025-12-02 14:00:00,trade,BTC,0.00108696,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-01-05 14:00:00,trade,BTC,0.00104167,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-02-03 14:00:00,trade,BTC,0.00113636,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-03-03 14:00:00,trade,BTC,0.00119048,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-04-02 14:00:00,trade,BTC,0.00111111,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-05-05 14:00:00,trade,BTC,0.0010101,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-06-02 14:00:00,trade,BTC,0.00096154,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-07-02 14:00:00,trade,BTC,0.00092593,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-08-04 14:00:00,trade,BTC,0.00089286,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-09-02 14:00:00,trade,BTC,0.00091743,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2026-10-02 14:00:00,trade,BTC,0.00086957,USD,100,USD,1.49,100,1.49,Coinbase,,Achat programmé
2025-11-10 15:30:00,trade,ETH,0.04285714,USD,150,USD,2.24,150,2.24,Coinbase,,
2026-01-12 15:30:00,trade,ETH,0.046875,USD,150,USD,2.24,150,2.24,Coinbase,,
2026-03-10 15:30:00,trade,ETH,0.06,USD,150,USD,2.24,150,2.24,Coinbase,,
2026-06-09 15:30:00,trade,ETH,0.05172414,USD,150,USD,2.24,150,2.24,Coinbase,,
2026-09-08 15:30:00,trade,ETH,0.03947368,USD,150,USD,2.24,150,2.24,Coinbase,,
2026-08-20 16:00:00,trade,USD,190,ETH,0.05,USD,2.84,190,2.84,Coinbase,,Vente partielle
2026-06-15 09:00:00,transfer_out,,,BTC,0.004,,,,,Coinbase,,Vers Ledger
2026-06-15 09:20:00,transfer_in,BTC,0.00399,,,,,,,Ledger,,Depuis Coinbase
2026-02-10 10:00:00,trade,USDC,500,USD,500,USD,0,500,0,Coinbase,,
2026-02-10 11:00:00,transfer_out,,,USDC,500,,,,,Coinbase,,Vers Binance
2026-02-10 11:15:00,transfer_in,USDC,499,,,,,,,Binance,,
2026-02-11 08:00:00,trade,SOL,2.5,USDC,300,SOL,0.0025,300,,Binance,,
2026-05-20 08:00:00,trade,LINK,8,USDC,120,BNB,0.0002,120,0.12,Binance,,
2026-03-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-04-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-05-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-06-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-07-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-08-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-09-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-10-01 00:00:00,income,SOL,0.012,,,,,1.8,,Binance,staking,Simple Earn
2026-04-15 12:00:00,income,BNB,0.001,,,,,0.6,,Binance,airdrop,
`;
