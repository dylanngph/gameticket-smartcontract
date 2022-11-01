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
    const FIRST_ROUND_ID = 0;

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
        await bionGameSlot.grantOperatorRole(admin.address);

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
            const participants = await setupParticipants();

            expect(await bionGameSlot.getParticipantsAtRound(FIRST_ROUND_ID)).to.have.lengthOf(10);
            expect(await bionTicket.balanceOf(participants[0].address, STANDARD)).to.equal(0);
            expect(await bionTicket.balanceOf(bionGameSlot.address, STANDARD)).to.equal(10);
            expect(await bionGameSlot.shareOf(participants[0].address, FIRST_ROUND_ID)).to.equal(1);
            expect(await bionGameSlot.holderOf(FIRST_ROUND_ID, 0)).to.equal(participants[0].address);

            await expect(bionGameSlot.connect(user1).deposit(FIRST_ROUND_ID, STANDARD, 1)).to.revertedWith(
                "BionGameSlot: not enough available slots"
            );
        });

        it("should deposit many", async () => {
            await bionTicket.mint(user1.address, 10, STANDARD);
            await bionTicket.connect(user1).setApprovalForAll(bionGameSlot.address, true);

            await bionGameSlot.connect(user1).deposit(FIRST_ROUND_ID, STANDARD, 9);
            await bionGameSlot.connect(user1).deposit(FIRST_ROUND_ID, STANDARD, 1);

            expect(await bionGameSlot.getParticipantsAtRound(FIRST_ROUND_ID)).to.have.lengthOf(1);
            expect(await bionTicket.balanceOf(user1.address, STANDARD)).to.equal(0);
            expect(await bionTicket.balanceOf(bionGameSlot.address, STANDARD)).to.equal(10);
            expect(await bionGameSlot.shareOf(user1.address, FIRST_ROUND_ID)).to.equal(10);
            expect(await bionGameSlot.holderOf(FIRST_ROUND_ID, 0)).to.equal(user1.address);
            expect(await bionGameSlot.holderOf(FIRST_ROUND_ID, 1)).to.equal(user1.address);
            expect(await bionGameSlot.holderOf(FIRST_ROUND_ID, 2)).to.equal(user1.address);
            expect(await bionGameSlot.holderOf(FIRST_ROUND_ID, 9)).to.equal(user1.address);
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
            await bionGameSlot.grantOperatorRole(admin.address);

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

            expect(winningSeats.length).to.equal(nPrizes);
            // is unique
            expect(winningSeats.every((seat, index) => winningSeats.indexOf(seat) === index)).to.be.true;
        });
    });

    describe("CLAIM", async () => {
        it("should claim", async () => {
            const participants = await setupParticipants();

            const firstRoundId = 0;
            /*
            seed: 111
            draw: 2, result: 2, drawnNumber: 1000002
            draw: 1, result: 1, drawnNumber: 1000102
            draw: 4, result: 4, drawnNumber: 1040102
            */
            await bionGameSlot.onRandomReceived("111"); // drawnNumber: 1040102

            expect(await bionGameSlot.getWinnersAtRound(firstRoundId)).to.have.members([
                participants[2].address,
                participants[1].address,
                participants[4].address,
            ]);

            // first prize
            await bionGameSlot.connect(participants[2]).claim(firstRoundId, 0);
            expect(await bionTicket.balanceOf(participants[2].address, STANDARD)).to.equal(PRIZE_DISTRIBUTION[0]);
            await expect(bionGameSlot.connect(participants[2]).claim(firstRoundId, 0)).to.revertedWith(
                "BionGameSlot: already claimed"
            );

            // second prize
            await bionGameSlot.connect(participants[1]).claim(firstRoundId, 1);
            expect(await bionTicket.balanceOf(participants[1].address, STANDARD)).to.equal(PRIZE_DISTRIBUTION[1]);
            await expect(bionGameSlot.connect(participants[1]).claim(firstRoundId, 1)).to.revertedWith(
                "BionGameSlot: already claimed"
            );

            // third prize
            await bionGameSlot.connect(participants[4]).claim(firstRoundId, 2);
            expect(await bionTicket.balanceOf(participants[4].address, STANDARD)).to.equal(PRIZE_DISTRIBUTION[2]);
            await expect(bionGameSlot.connect(participants[4]).claim(firstRoundId, 2)).to.revertedWith(
                "BionGameSlot: already claimed"
            );

            // not winner
            await expect(bionGameSlot.connect(participants[0]).claim(firstRoundId, 1)).to.revertedWith(
                "BionGameSlot: not winner"
            );
        });
    });
});
