import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";
import {
    BionGameSlot,
    BionGameSlot__factory,
    BionTicket,
    BionTicket__factory,
    VRFCoordinatorV2Mock__factory,
    VRFCoordinatorV2Mock,
} from "../types";
import {getNFT1155BatchBalanceChange} from "./utils";

describe("BionGameSlot", function () {
    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let bionGameSlot: BionGameSlot;
    let bionTicket: BionTicket;
    let mockVRFCoordinator: VRFCoordinatorV2Mock;

    const STANDARD = 0;
    const UNMERCHANTABLE = 1;

    const TICKET_TYPE_TO_USE = UNMERCHANTABLE;

    const TOTAL_SLOTS = 10;
    const NPRIZES = 3;
    const PRIZE_DISTRIBUTION = [5, 1, 1];
    const FIRST_ROUND_ID = 0;
    const MOCK_SUBSCRIPTION_ID = 1;
    const MOCK_KEY_HASH = "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314";
    const DELAY_DURATION = 90;

    async function setupDeployments() {
        [admin, user1, user2] = await ethers.getSigners();

        const bionTicket = await (<BionTicket__factory>await ethers.getContractFactory("BionTicket")).deploy();
        await bionTicket.grantMinterRole(admin.address);

        const mockVRFCoordinator = await (<VRFCoordinatorV2Mock__factory>(
            await ethers.getContractFactory("VRFCoordinatorV2Mock")
        )).deploy(0, 0);

        await mockVRFCoordinator.createSubscription();
        await mockVRFCoordinator.fundSubscription(MOCK_SUBSCRIPTION_ID, ethers.utils.parseEther("1"));

        const bionGameSlot = await (<BionGameSlot__factory>await ethers.getContractFactory("BionGameSlot")).deploy(
            bionTicket.address,
            TOTAL_SLOTS,
            NPRIZES,
            PRIZE_DISTRIBUTION,
            mockVRFCoordinator.address,
            MOCK_SUBSCRIPTION_ID,
            MOCK_KEY_HASH,
            DELAY_DURATION
        );
        await mockVRFCoordinator.addConsumer(MOCK_SUBSCRIPTION_ID, bionGameSlot.address);
        await bionGameSlot.grantOperatorRole(admin.address);
        await bionTicket.mint(bionGameSlot.address, 1000, STANDARD);

        return {bionGameSlot, bionTicket, mockVRFCoordinator};
    }

    async function setupParticipants(
        roundId: number,
        nParticipants: number = 10,
        nTicketsForEachParticipant: number = 1,
        ticketTypeToUse: number = TICKET_TYPE_TO_USE,
        fromIndex: number = 0
    ) {
        const participants = (await ethers.getSigners()).slice(fromIndex + 1, fromIndex + nParticipants + 1);
        for (const participant of participants) {
            await bionTicket.mint(participant.address, nTicketsForEachParticipant, ticketTypeToUse);
            await bionTicket.connect(participant).setApprovalForAll(bionGameSlot.address, true);

            await bionGameSlot.connect(participant).deposit(roundId, ticketTypeToUse, nTicketsForEachParticipant);
        }
        return participants;
    }

    async function setupDraw() {
        await bionGameSlot.requestRandom();
        const requestId = await bionGameSlot.lastRequestId();
        await mockVRFCoordinator.fulfillRandomWords(requestId, bionGameSlot.address);
    }

    async function setupClaim(roundId: number, participants: SignerWithAddress[]) {
        const drawnNumber = await bionGameSlot.snapshots(roundId);
        const winningSeats = getWinningSeatsFromDrawnNumber(drawnNumber, NPRIZES);

        // claim prize
        for (let i = 0; i < winningSeats.length; i++) {
            await bionGameSlot.connect(participants[winningSeats[i]]).claim(roundId);
        }
    }

    function getWinningSeatsFromDrawnNumber(drawnNumber: BigNumber, nPrizes: number) {
        const winningSeats: number[] = [];
        for (let i = 0; i < nPrizes; i++) {
            winningSeats.push(
                drawnNumber
                    .mod((100 ** (i + 1)).toString())
                    .div((100 ** i).toString())
                    .toNumber()
            );
        }
        return winningSeats;
    }

    beforeEach(async () => {
        ({bionGameSlot, bionTicket, mockVRFCoordinator} = await loadFixture(setupDeployments));
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
            const firstRoundId = 0;
            const participants = await setupParticipants(firstRoundId);

            expect(await bionGameSlot.getParticipantsAtRound(FIRST_ROUND_ID)).to.have.lengthOf(10);
            expect(await bionTicket.balanceOf(participants[0].address, TICKET_TYPE_TO_USE)).to.equal(0);
            expect(await bionTicket.balanceOf(bionGameSlot.address, TICKET_TYPE_TO_USE)).to.equal(10);
            expect(await bionGameSlot.shareOf(participants[0].address, FIRST_ROUND_ID)).to.equal(1);
            expect(await bionGameSlot.holderOf(FIRST_ROUND_ID, 0)).to.equal(participants[0].address);

            await expect(bionGameSlot.connect(user1).deposit(FIRST_ROUND_ID, TICKET_TYPE_TO_USE, 1)).to.revertedWith(
                "BionGameSlot: not enough available slots"
            );
        });

        it("should deposit many", async () => {
            await bionTicket.mint(user1.address, 10, TICKET_TYPE_TO_USE);
            await bionTicket.connect(user1).setApprovalForAll(bionGameSlot.address, true);

            await bionGameSlot.connect(user1).deposit(FIRST_ROUND_ID, TICKET_TYPE_TO_USE, 9);
            await bionGameSlot.connect(user1).deposit(FIRST_ROUND_ID, TICKET_TYPE_TO_USE, 1);

            expect(await bionGameSlot.getParticipantsAtRound(FIRST_ROUND_ID)).to.have.lengthOf(1);
            expect(await bionTicket.balanceOf(user1.address, TICKET_TYPE_TO_USE)).to.equal(0);
            expect(await bionTicket.balanceOf(bionGameSlot.address, TICKET_TYPE_TO_USE)).to.equal(10);
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
                totalSlots,
                nPrizes,
                prizeDistribution,
                mockVRFCoordinator.address,
                MOCK_SUBSCRIPTION_ID,
                MOCK_KEY_HASH,
                DELAY_DURATION
            );
            await bionGameSlot.grantOperatorRole(admin.address);

            const drawnNumber = await bionGameSlot.drawSlots("111");

            const winningSeats = getWinningSeatsFromDrawnNumber(drawnNumber, nPrizes);

            expect(winningSeats.length).to.equal(nPrizes);
            // is unique
            expect(winningSeats.every((seat, index) => winningSeats.indexOf(seat) === index)).to.be.true;
        });

        it("should draw by requesting and receiving random", async () => {
            const firstRoundId = 0;
            await setupParticipants(firstRoundId);

            await expect(bionGameSlot.requestRandom()).to.emit(bionGameSlot, "StartDrawSlots");
            await expect(bionGameSlot.requestRandom()).to.revertedWith("BionGameSlot: is drawing");

            const requestId = await bionGameSlot.lastRequestId();
            await expect(mockVRFCoordinator.fulfillRandomWords(requestId, bionGameSlot.address)).to.emit(
                bionGameSlot,
                "EndDrawSlots"
            );
        });
    });

    describe("CLAIM", () => {
        it("should claim", async () => {
            const firstRoundId = 0;
            const participants = await setupParticipants(firstRoundId);
            await setupDraw();

            const drawnNumber = await bionGameSlot.snapshots(firstRoundId);
            const winningSeats = getWinningSeatsFromDrawnNumber(drawnNumber, NPRIZES);

            const winners = await bionGameSlot.getWinnersAtRound(firstRoundId);
            expect(winners).to.have.members(winningSeats.map((seat) => participants[seat].address));

            // claim prize
            for (let i = 0; i < winningSeats.length; i++) {
                await expect(bionGameSlot.connect(participants[winningSeats[i]]).claim(firstRoundId)).to.emit(
                    bionGameSlot,
                    "Claim"
                );
                expect(await bionTicket.balanceOf(participants[winningSeats[i]].address, STANDARD)).to.equal(
                    PRIZE_DISTRIBUTION[i]
                );
                await expect(bionGameSlot.connect(participants[winningSeats[i]]).claim(firstRoundId)).to.revertedWith(
                    "BionGameSlot: no prize to claim"
                );
            }

            // not winner
            await expect(bionGameSlot.connect(admin).claim(firstRoundId)).to.revertedWith("BionGameSlot: no prize to claim");
        });
    });

    describe("E2E", () => {
        it("should E2E", async () => {
            const firstRoundId = 0;
            const participants = await setupParticipants(firstRoundId);
            await setupDraw();
            await setupClaim(firstRoundId, participants);
            expect(await bionGameSlot.currentRoundId()).to.equal(firstRoundId + 1);

            await expect(bionGameSlot.connect(user1).deposit(firstRoundId + 1, STANDARD, 1)).to.revertedWith(
                "BionGameSlot: not yet"
            );
            await time.increaseTo((await bionGameSlot.lastDrawnTime()).add(DELAY_DURATION + 1));
            await setupParticipants(firstRoundId + 1);
            await setupDraw();
            await setupClaim(firstRoundId + 1, participants);
            expect(await bionGameSlot.currentRoundId()).to.equal(firstRoundId + 2);
        });
    });

    describe("STOP POOL", () => {
        it("should stop pool", async () => {
            const firstRoundId = 0;
            await setupParticipants(firstRoundId);
            await expect(bionGameSlot.connect(admin).withdraw()).to.revertedWith("BionGameSlot: not stopped");
            await expect(bionGameSlot.setStop()).to.emit(bionGameSlot, "StopPool");
            await expect(bionGameSlot.connect(user1).deposit(firstRoundId + 1, STANDARD, 1)).to.revertedWith(
                "BionGameSlot: stopped"
            );
        });
        it("should let participants withdraw", async () => {
            const firstRoundId = 0;
            await setupParticipants(firstRoundId, 1, 2, STANDARD, 0);
            const [user1] = await setupParticipants(firstRoundId, 1, 2, UNMERCHANTABLE, 0);
            const [user2] = await setupParticipants(firstRoundId, 1, 3, STANDARD, 1);
            const [user3] = await setupParticipants(firstRoundId, 1, 3, UNMERCHANTABLE, 2);

            await bionGameSlot.setStop();

            const [
                user1StandardBalanceChange,
                user1UnmerchantableBalanceChange,
                user2StandardBalanceChange,
                user2UnmerchantableBalanceChange,
                user3StandardBalanceChange,
                user3UnmerchantableBalanceChange,
            ] = await getNFT1155BatchBalanceChange(
                [user1.address, user1.address, user2.address, user2.address, user3.address, user3.address],
                bionTicket,
                [STANDARD, UNMERCHANTABLE, STANDARD, UNMERCHANTABLE, STANDARD, UNMERCHANTABLE],
                async () => {
                    await expect(bionGameSlot.connect(user1).withdraw())
                        .to.emit(bionGameSlot, "Withdraw")
                        .withArgs(firstRoundId, user1.address, 2, 2);

                    await expect(bionGameSlot.connect(user2).withdraw())
                        .to.emit(bionGameSlot, "Withdraw")
                        .withArgs(firstRoundId, user2.address, 3, 0);

                    await expect(bionGameSlot.connect(user3).withdraw())
                        .to.emit(bionGameSlot, "Withdraw")
                        .withArgs(firstRoundId, user3.address, 0, 3);
                }
            );
            expect(user1StandardBalanceChange).to.equal(2);
            expect(user1UnmerchantableBalanceChange).to.equal(2);
            expect(user2StandardBalanceChange).to.equal(3);
            expect(user2UnmerchantableBalanceChange).to.equal(0);
            expect(user3StandardBalanceChange).to.equal(0);
            expect(user3UnmerchantableBalanceChange).to.equal(3);

            await expect(bionGameSlot.connect(user1).withdraw()).to.revertedWith("BionGameSlot: already withdrawn");
            await expect(bionGameSlot.connect(user2).withdraw()).to.revertedWith("BionGameSlot: already withdrawn");
            await expect(bionGameSlot.connect(user3).withdraw()).to.revertedWith("BionGameSlot: already withdrawn");
            await expect(bionGameSlot.connect(admin).withdraw()).to.revertedWith("BionGameSlot: not deposited");
        });
    });
});
