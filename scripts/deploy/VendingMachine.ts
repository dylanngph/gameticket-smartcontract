import {ethers, network} from "hardhat";
import {NETWORK_CONFIG} from "../../network.config";
import {TicketVendingMachine__factory} from "../../types";

async function main() {
    const [admin] = await ethers.getSigners();
    const chainId = network.config.chainId!;

    const CURRENCY = ethers.constants.AddressZero;
    const TICKET_PRICE = ethers.utils.parseEther("0.01");

    const vendingMachine = await (<TicketVendingMachine__factory>await ethers.getContractFactory("TicketVendingMachine"))
        .connect(admin)
        .deploy(NETWORK_CONFIG[chainId].bionTicket!, CURRENCY, TICKET_PRICE);

    console.log("Vending Machine deployed to:", vendingMachine.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
