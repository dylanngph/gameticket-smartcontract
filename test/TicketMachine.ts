import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";
import {TicketMachine, TicketMachine__factory, MockToken, MockToken__factory, BionTicket, BionTicket__factory} from "../types";
import {getTokenBalanceChange} from "./utils";

describe("TicketMachine", function () {
    let admin: SignerWithAddress;
    let signer: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let bionTicket: BionTicket;
    let ticketMachine: TicketMachine;
    let mockToken: MockToken;

    async function setupDeployments() {
        [admin, signer, user1, user2] = await ethers.getSigners();

        const mockToken = await (<MockToken__factory>await ethers.getContractFactory("MockToken")).deploy("MockToken", "MTK", 18);
        const bionTicket = await (<BionTicket__factory>await ethers.getContractFactory("BionTicket")).deploy();

        const ticketMachine = await (<TicketMachine__factory>await ethers.getContractFactory("TicketMachine")).deploy(
            bionTicket.address,
            signer.address,
            admin.address
        );

        bionTicket.grantMinterRole(ticketMachine.address);
        mockToken.mint(user1.address, ethers.utils.parseEther("1000000"));

        return {bionTicket, ticketMachine, mockToken};
    }

    beforeEach(async function () {
        ({bionTicket, ticketMachine, mockToken} = await loadFixture(setupDeployments));
    });

    describe("BUY TICKET", function () {
        it("should buy ticket by token by sig", async () => {
            const chainId = 31337;
            const currency = mockToken.address;
            const amount = 5;
            const totalPay = amount * 3;
            const pTotalPay = ethers.utils.parseEther(totalPay.toString());
            const referrer = ethers.constants.AddressZero;
            const refReward = 0;
            const pRefReward = ethers.utils.parseEther(refReward.toString());
            const now = await time.latest();
            const deadline = now + 60;

            const message = ethers.utils.solidityPack(
                ["uint256", "address", "address", "uint256", "uint256", "address", "uint256", "uint256"],
                [chainId, user1.address, currency, amount, pTotalPay, referrer, pRefReward, deadline]
            );
            const signature = signer.signMessage(ethers.utils.arrayify(ethers.utils.solidityKeccak256(["bytes"], [message])));

            await mockToken.connect(user1).approve(ticketMachine.address, pTotalPay);
            const [user1TokenBalanceChange, adminTokenBalanceChange] = await getTokenBalanceChange(
                [user1.address, admin.address],
                mockToken,
                async () => {
                    await expect(
                        ticketMachine
                            .connect(user1)
                            .buyTicketsByTokenBySig(
                                currency,
                                amount,
                                pTotalPay,
                                referrer,
                                pRefReward,
                                deadline,
                                signature
                            )
                    ).to.emit(ticketMachine, "PurchaseTickets");
                }
            );

            expect(user1TokenBalanceChange).to.equal("-" + pTotalPay);
            expect(adminTokenBalanceChange).to.equal(pTotalPay);
        });
    });
});
