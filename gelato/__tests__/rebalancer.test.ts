import { handler } from "../web3-functions/rebalancer/index";

jest.mock("ethers", () => {
  const actual = jest.requireActual("ethers");

  class MockContract {
    address: string;
    constructor(address: string) {
      this.address = address;
    }

    // Hook contract stub
    getPoolState = async () => ({
      activeTickLower: "100",
      activeTickUpper: "200",
      priceFeed: "0xfeed",
      priceFeedInverted: false,
      decimals0: 18,
      decimals1: 6,
      tickSpacing: 60,
    });

    // Oracle stub
    latestRoundData = async () => [1, 1_0000_0000, 0, 1, 1];
    decimals = async () => 8;
    aggregator = async () => this.address;

    interface = {
      encodeFunctionData: () => "0xdeadbeef",
    };
  }

  return {
    ...actual,
    Contract: MockContract,
    utils: {
      id: () => "0x",
    },
  };
});

describe("Gelato rebalancer W3F", () => {
  it("returns canExec true with maintain callData", async () => {
    const result = await handler({
      provider: {
        getBlockNumber: async () => 100,
        getLogs: async () => [],
      },
      userArgs: {
        poolId: "0xpool",
        hookAddress: "0xhook",
        poolType: "ETH_USDC",
      },
    } as any);

    expect(result.canExec).toBe(true);
    if (result.canExec) {
      const callData = result.callData as Array<{ to: string; data: string }>;
      expect(callData?.[0]?.to).toBe("0xhook");
      expect(callData?.[0]?.data).toBe("0xdeadbeef");
    }
  });
});
