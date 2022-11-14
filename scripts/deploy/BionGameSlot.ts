import {ethers, network} from "hardhat";
import {NETWORK_CONFIG} from "../../network.config";
import {BionGameSlot__factory, VRFCoordinatorV2Interface, VRFCoordinatorV2Interface__factory} from "../../types";

async function main() {
    const [admin] = await ethers.getSigners();
    const chainId = network.config.chainId!;

    const TOTAL_SLOTS = 10;
    const NPRIZES = 3;
    const PRIZE_DISTRIBUTION = [5, 1, 1];
    const DELAY_DURATION = 90;

    const bionGameSlot = await (<BionGameSlot__factory>await ethers.getContractFactory("BionGameSlot"))
        .connect(admin)
        .deploy(
            NETWORK_CONFIG[chainId].bionTicket!,
            TOTAL_SLOTS,
            NPRIZES,
            PRIZE_DISTRIBUTION,
            NETWORK_CONFIG[chainId].vrfCoordinator!,
            NETWORK_CONFIG[chainId].vrfSubId!,
            NETWORK_CONFIG[chainId].vrfKeyHash!,
            DELAY_DURATION
        );

    console.log("BionGameSlot deployed to:", bionGameSlot.address);

    // Add consumer to VRFCoordinator
    const vrfCoordinator = (await ethers.getContractAt(
        VRFCoordinatorV2Interface__factory.abi,
        NETWORK_CONFIG[chainId].vrfCoordinator!
    )) as VRFCoordinatorV2Interface;

    console.log("Adding consumer to VRFCoordinator...");
    await vrfCoordinator.addConsumer(NETWORK_CONFIG[chainId].vrfSubId!, bionGameSlot.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
