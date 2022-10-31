import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai, {expect} from "chai";
import {loadFixture, solidity} from "ethereum-waffle";
import {ethers} from "hardhat";
import {BionGameSlot} from "../types/BionGameSlot";
import {BionTicket} from "../types/BionTicket";
import {BionGameSlot__factory} from "../types/factories/BionGameSlot__factory";
import {BionTicket__factory} from "../types/factories/BionTicket__factory";

chai.use(solidity);
const {assert} = chai;

describe("BionGameSlot", function () {
    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let bionGameSlot: BionGameSlot;
    let bionTicket: BionTicket;

    const BION_TICKET = 0;

    async function setupDeployments() {
        [admin, user1, user2] = await ethers.getSigners();

        const bionTicket = await (<BionTicket__factory>await ethers.getContractFactory("BionTicket")).deploy();
        await bionTicket.grantMinterRole(admin.address);

        const bionGameSlot = await (<BionGameSlot__factory>await ethers.getContractFactory("BionGameSlot")).deploy(
            bionTicket.address,
            admin.address,
            10,
            3,
            [5, 1, 1]
        );

        return {bionGameSlot, bionTicket};
    }

    async function setupParticipants() {
        const participants = (await ethers.getSigners()).slice(1, 11);

        for (const participant of participants) {
            await bionTicket.mint(participant.address, 100);
            await bionTicket.connect(participant).setApprovalForAll(bionGameSlot.address, true);

            await bionGameSlot.connect(participant).deposit(0);
        }
    }

    beforeEach(async () => {
        ({bionGameSlot, bionTicket} = await loadFixture(setupDeployments));
    });

    describe("DEPLOYMENT", () => {
        it("should deploy", async () => {
            expect(await bionGameSlot.bionTicket()).to.eq(bionTicket.address);
            expect(await bionGameSlot.BION_TICKET()).to.eq(BION_TICKET);
            expect(await bionGameSlot.totalSlots()).to.eq(10);
        });
    });

    describe("DEPOSIT", () => {
        it("should deposit", async () => {
            await bionTicket.mint(user1.address, 100);
            await bionTicket.connect(user1).setApprovalForAll(bionGameSlot.address, true);

            const firstRoundId = 0;
            await bionGameSlot.connect(user1).deposit(firstRoundId);

            expect(await bionTicket.balanceOf(user1.address, BION_TICKET)).to.equal(99);
            expect(await bionTicket.balanceOf(bionGameSlot.address, BION_TICKET)).to.equal(1);
            expect(await bionGameSlot.seatOf(user1.address, firstRoundId)).to.equal(1);
            expect(await bionGameSlot.holderOf(firstRoundId, 1)).to.equal(user1.address);
        });
    });

    // describe("onRandomReceiced", () => {
    //     it("should draw unique numbers", async () => {
    //         await bionGameSlot.onRandomReceived("9999999999999999999922");
    //     });
    // });
});
