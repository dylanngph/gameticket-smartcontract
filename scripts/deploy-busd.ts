import { ethers } from "hardhat";

import { MyERC20 } from "../types/MyERC20";
import { MyERC20__factory } from "../types/factories/MyERC20__factory";

async function main() {
  const erc20Factory: MyERC20__factory = <MyERC20__factory>(
    await ethers.getContractFactory("MyERC20")
  );

  const currency: MyERC20 = <MyERC20>(
    await erc20Factory.deploy("BUSD", "BUSD", 18)
  );
  await currency.deployed();
  console.log("BUSD deployed to: ", currency.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
