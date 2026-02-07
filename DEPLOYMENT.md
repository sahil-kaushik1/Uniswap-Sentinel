
# == Logs ==
#   ========================================
#     SENTINEL FULL + AUTOMATION DEPLOY
#   ========================================
#   Deployer: 0x48089CcF5e579Ab41703Acd85E54a9151d6B0D6C
#   Functions Router: 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0
#   Subscription ID: 6243
  
# --- 1. Deploying Mock Tokens ---
#   mETH:   0x728cAd9d02119FbD637279079B063A58F5DC39b8
#   mUSDC:  0xc5bFb66e99EcA697a5Cb914390e02579597d45f9
#   mWBTC:  0xE9c7d8b803e38a22b26c8eE618203A433ADD8AfA
#   mUSDT:  0x757532BDebcf3568fDa48aD7dea78B5644D70E41
  
# --- 2. Minting Tokens ---
#   Minted: 1000 mETH, 10M mUSDC, 100 mWBTC, 10M mUSDT
  
# --- 3. Deploying Mock Aave ---
#   MockAave: 0x5D1359bC5442bA7dA9821E2FDee4d277730451D5
#   maETH:    0x8beCc1B30084d0404b79bdDb5dB4F30f56c67C95
#   maUSDC:   0xfE5080cA75Af4612F31f39107d7E8782D644bf80
#   maWBTC:   0x6648c432Fa3Cf44681FdCaE58e7A1174b11c70b2
#   maUSDT:   0x85284b6EF7e443A27b54BC6914befdD2f2A6c61A
  
# --- 4. Deploying RatioOracle ---
#   BTC/ETH Oracle: 0x0f8C8f8D3F1D74B959a83393eaE419558277dd8d
  
# --- 5. Deploying SentinelHook ---
#   SentinelHook: 0x8ba4d5c59748D6AA896fa32a64D51C4fef3b6080
#   Hook permissions verified OK
  
# --- 6. Deploying SwapHelper ---
#   SwapHelper: 0xFE9047BaA04072Caf988Ee11160585952828866f
  
# --- 7. Initializing Pools ---
#   Pool 1 (mETH/mUSDC): 0x90b5f49d49079bfe71c1fb9787a0381eeca7f4ccee7ba0d8de387e2fffd96d8b
#   Pool 2 (mWBTC/mETH): 0xe422877004fdcad519eb76f4a080371ac9a9d631ba2b5d27c771d479862e1d9c
#   Pool 3 (mETH/mUSDT): 0x3d41b451e3c6abf6f5c8b1aa2aaa157dd28f55a4bb6f78c511ff6c529782bd69
  
# --- 8. Setting Approvals ---
#   All approvals set
  
# --- 9. Seeding Pools with Initial Liquidity ---
#   Pool 1 seeded, shares: 25000000000
#   Pool 2 seeded, shares: 100000000
#   Pool 3 seeded, shares: 25000000000
  
# --- 10. Deploying SentinelAutomation ---
#   SentinelAutomation: 0xc3aD45d5feC747B5465783c301580BfC4A1Bcd85
  
# --- 11. Setting Maintainer ---
#   Current maintainer: 0x48089CcF5e579Ab41703Acd85E54a9151d6B0D6C
#   New maintainer: 0xc3aD45d5feC747B5465783c301580BfC4A1Bcd85
  
# --- 12. Registering Pools ---
#   Pool 1 registered as type 0
#   Pool 2 registered as type 1
#   Pool 3 registered as type 2
  
# ========================================
#     DEPLOYMENT COMPLETE - ADDRESSES
#   ========================================
#   POOL_MANAGER:        0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A
#   SENTINEL_HOOK:       0x8ba4d5c59748D6AA896fa32a64D51C4fef3b6080
#   SWAP_HELPER:         0xFE9047BaA04072Caf988Ee11160585952828866f
#   MOCK_AAVE:           0x5D1359bC5442bA7dA9821E2FDee4d277730451D5
#   BTC_ETH_ORACLE:      0x0f8C8f8D3F1D74B959a83393eaE419558277dd8d
#   SENTINEL_AUTOMATION: 0xc3aD45d5feC747B5465783c301580BfC4A1Bcd85
#   ---
#   mETH:               0x728cAd9d02119FbD637279079B063A58F5DC39b8
#   mUSDC:              0xc5bFb66e99EcA697a5Cb914390e02579597d45f9
#   mWBTC:              0xE9c7d8b803e38a22b26c8eE618203A433ADD8AfA
#   mUSDT:              0x757532BDebcf3568fDa48aD7dea78B5644D70E41
#   ---
#   maETH:              0x8beCc1B30084d0404b79bdDb5dB4F30f56c67C95
#   maUSDC:             0xfE5080cA75Af4612F31f39107d7E8782D644bf80
#   maWBTC:             0x6648c432Fa3Cf44681FdCaE58e7A1174b11c70b2
#   maUSDT:             0x85284b6EF7e443A27b54BC6914befdD2f2A6c61A
#   ---
#   POOL1 (mETH/mUSDC):  0x90b5f49d49079bfe71c1fb9787a0381eeca7f4ccee7ba0d8de387e2fffd96d8b
#   POOL2 (mWBTC/mETH):  0xe422877004fdcad519eb76f4a080371ac9a9d631ba2b5d27c771d479862e1d9c
#   POOL3 (mETH/mUSDT):  0x3d41b451e3c6abf6f5c8b1aa2aaa157dd28f55a4bb6f78c511ff6c529782bd69
#   ========================================
  
# === REMAINING MANUAL STEPS ===
#   1. Add SentinelAutomation as consumer to your Functions subscription:
#      -> https://functions.chain.link
#      -> Subscription 6243
#      -> Add Consumer: 0xc3aD45d5feC747B5465783c301580BfC4A1Bcd85
#   2. Register Custom Logic Upkeep on Chainlink Automation:
#      -> https://automation.chain.link/sepolia
#      -> Register new upkeep -> Custom logic
#      -> Target contract: 0xc3aD45d5feC747B5465783c301580BfC4A1Bcd85
#      -> Fund with LINK (3-5 LINK recommended)
#   ========================================