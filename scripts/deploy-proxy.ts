import { ethers, upgrades } from "hardhat";

async function main() {
  const CalculatorV1 = await ethers.getContractFactory("CalculatorV1");
  console.log("Deploying Calculator...");
  const calculator = await upgrades.deployProxy(CalculatorV1, [42], {
    initializer: "initialize",
  });
  await calculator.deployed();
  console.log("Calculator Proxy deployed to:", calculator.address);

  console.log(
    "Implementation address: ",
    await upgrades.erc1967.getImplementationAddress(calculator.address)
  );

  console.log(
    "Admin address: ",
    await upgrades.erc1967.getAdminAddress(calculator.address)
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
