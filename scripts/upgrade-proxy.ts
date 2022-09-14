import { ethers, upgrades } from "hardhat";

const PROXY = "0x6aC7a9e53E496e70FcfeeC153c1Fe73AD61c5c79";

async function main() {
  const CalculatorV2 = await ethers.getContractFactory("CalculatorV2");
  console.log("Upgrading Calculator...");
  await upgrades.upgradeProxy(PROXY, CalculatorV2);
  console.log("Calculator upgraded: ");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
