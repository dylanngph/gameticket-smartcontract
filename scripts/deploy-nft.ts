import { ethers } from "hardhat";

import { MyERC721 } from "../types/MyERC721";
import { MyERC721__factory } from "../types/factories/MyERC721__factory";

async function main() {
  const [deployer] = await ethers.getSigners();

  const erc721Factory: MyERC721__factory = <MyERC721__factory>(
    await ethers.getContractFactory("MyERC721")
  );

  // for deploy
  //   const nft: MyERC721 = <MyERC721>(
  //     await erc721Factory.deploy("BIG NFT", "BIGNFT")
  //   );
  //   await nft.deployed();
  //   console.log("BIGNFT deployed to: ", nft.address);

  // for config
  const nft: MyERC721 = <MyERC721>(
    erc721Factory.attach(process.env.NFT_ADDRESS!)
  );

  await nft.mint(deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
