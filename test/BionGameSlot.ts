import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {BionGameSlot} from "../types/contracts/BionGameSlot";
import {BionTicket} from "../types/contracts/BionTicket";
import {BionGameSlot__factory} from "../types/factories/contracts/BionGameSlot__factory";
import {BionTicket__factory} from "../types/factories/contracts/BionTicket__factory";

describe("BionGameSlot", function () {
    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let bionGameSlot: BionGameSlot;
    let bionTicket: BionTicket;

    const STANDARD = 0;
    const UNMERCHANTABLE = 1;

    const TOTAL_SLOTS = 10;
    const NPRIZES = 3;
    const PRIZE_DISTRIBUTION = [5, 1, 1];

    async function setupDeployments() {
        [admin, user1, user2] = await ethers.getSigners();

        const bionTicket = await (<BionTicket__factory>await ethers.getContractFactory("BionTicket")).deploy();
        await bionTicket.grantMinterRole(admin.address);

        const bionGameSlot = await (<BionGameSlot__factory>await ethers.getContractFactory("BionGameSlot")).deploy(
            bionTicket.address,
            admin.address,
            TOTAL_SLOTS,
            NPRIZES,
            PRIZE_DISTRIBUTION
        );

        return {bionGameSlot, bionTicket};
    }

    async function setupParticipants() {
        const participants = (await ethers.getSigners()).slice(1, 11);
        for (const participant of participants) {
            await bionTicket.mint(participant.address, 1, STANDARD);
            await bionTicket.connect(participant).setApprovalForAll(bionGameSlot.address, true);

            await bionGameSlot.connect(participant).deposit(0, STANDARD, 1);
        }
        return participants;
    }

    beforeEach(async () => {
        ({bionGameSlot, bionTicket} = await loadFixture(setupDeployments));
    });

    describe("DEPLOYMENT", () => {
        it("should deploy", async () => {
            expect(await bionGameSlot.bionTicket()).to.eq(bionTicket.address);
            expect(await bionGameSlot.STANDARD()).to.eq(STANDARD);
            expect(await bionGameSlot.UNMERCHANTABLE()).to.eq(UNMERCHANTABLE);
            expect(await bionGameSlot.totalSlots()).to.eq(TOTAL_SLOTS);
        });
    });

    describe("DEPOSIT", () => {
        it("should deposit", async () => {
            await bionTicket.mint(user1.address, 100, STANDARD);
            await bionTicket.connect(user1).setApprovalForAll(bionGameSlot.address, true);

            const firstRoundId = 0;
            await bionGameSlot.connect(user1).deposit(firstRoundId, STANDARD, 1);

            expect(await bionTicket.balanceOf(user1.address, STANDARD)).to.equal(99);
            expect(await bionTicket.balanceOf(bionGameSlot.address, STANDARD)).to.equal(1);
            expect(await bionGameSlot.shareOf(user1.address, firstRoundId)).to.equal(1);
            expect(await bionGameSlot.holderOf(firstRoundId, 0)).to.equal(user1.address);
        });
    });

    describe("DRAW NUMBERS", () => {
        it("should draw unique numbers", async () => {
            const totalSlots = 10;
            const nPrizes = 10;
            const prizeDistribution = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
            const bionGameSlot = await (<BionGameSlot__factory>await ethers.getContractFactory("BionGameSlot")).deploy(
                bionTicket.address,
                admin.address,
                totalSlots,
                nPrizes,
                prizeDistribution
            );

            /*
            seed: 111
            draw: 1, result: 1, drawnNumber: 1000001
            draw: 0, result: 0, drawnNumber: 1000001
            draw: 1, result: 9, drawnNumber: 1090001
            */
            await bionGameSlot.onRandomReceived("111");

            const drawnNumber = await bionGameSlot.snapshots(0);

            const winningSeats: number[] = [];
            for (let i = 0; i < nPrizes; i++) {
                winningSeats.push(
                    drawnNumber
                        .mod((100 ** (i + 1)).toString())
                        .div((100 ** i).toString())
                        .toNumber()
                );
            }
            console.log("winningSeats:", winningSeats);

            // is unique
            expect(winningSeats.every((seat, index) => winningSeats.indexOf(seat) === index)).to.be.true;
        });
    });

    describe("CLAIM", async () => {
        it("should claim", async () => {
            const participants = await setupParticipants();

            const firstRoundId = 0;
            await bionGameSlot.onRandomReceived("111"); // drawnNumber: 1090001

            // first prize
            await bionGameSlot.connect(participants[1]).claim(firstRoundId);
            expect(await bionTicket.balanceOf(user1.address, STANDARD)).to.equal(PRIZE_DISTRIBUTION[0]);

            // second prize
            await bionGameSlot.connect(participants[0]).claim(firstRoundId);
            expect(await bionTicket.balanceOf(user1.address, STANDARD)).to.equal(PRIZE_DISTRIBUTION[1]);

            // third prize
            await bionGameSlot.connect(participants[9]).claim(firstRoundId);
            expect(await bionTicket.balanceOf(user1.address, STANDARD)).to.equal(PRIZE_DISTRIBUTION[2]);
        });
    });
});
