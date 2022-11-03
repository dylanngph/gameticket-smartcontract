import {ethers, network} from "hardhat";
import {NETWORK_CONFIG} from "../../network.config";
import {TicketMachine__factory} from "../../types";

async function main() {
    const [admin] = await ethers.getSigners();
    const chainId = network.config.chainId!;
    const signerAddress = NETWORK_CONFIG[chainId].signerAddress!;

    const ticketMachine = await (<TicketMachine__factory>await ethers.getContractFactory("TicketMachine"))
        .connect(admin)
        .deploy(NETWORK_CONFIG[chainId].bionTicket!, signerAddress, admin.address);

    console.log("Ticket Machine deployed to:", ticketMachine.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
