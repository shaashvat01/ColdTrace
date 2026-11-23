require("@nomicfoundation/hardhat-toolbox");

// set AMOY_RPC_URL and PRIVATE_KEY in your shell before deploying to amoy
const { AMOY_RPC_URL, PRIVATE_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  // run npm run gas to write gas used per function to gas-report.txt
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    outputFile: "gas-report.txt",
    noColors: true,
  },
  networks: {
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
