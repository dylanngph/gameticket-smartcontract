import {ethers} from "hardhat";
import {BionTicket__factory} from "../../types";

async function main() {
    const [admin] = await ethers.getSigners();

    const bionTicket = await (<BionTicket__factory>await ethers.getContractFactory("BionTicket")).connect(admin).deploy();

    console.log("BionTicket deployed to:", bionTicket.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
