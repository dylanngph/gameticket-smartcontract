import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";
import {BionTicket, BionTicket__factory} from "../types";

describe("BionTicket", () => {
    let admin: SignerWithAddress;
    let user1: SignerWithAddress;
    let bionTicket: BionTicket;

    async function setupDeployments() {
        [admin, user1] = await ethers.getSigners();

        const bionTicket = await (<BionTicket__factory>await ethers.getContractFactory("BionTicket")).deploy();
        await bionTicket.grantMinterRole(user1.address);

        return {bionTicket, grantedMinter: user1};
    }

    beforeEach(async function () {
        ({bionTicket, grantedMinter: user1} = await loadFixture(setupDeployments));
    });

    describe("ACCESS CONTROL", () => {
        it("should let minter mint", async () => {
            await bionTicket.connect(user1).mint(admin.address, 1, 0);
            expect(await bionTicket.balanceOf(admin.address, 0)).to.equal(1);
        });

        it("should revoke minter role", async () => {
            await bionTicket.revokeRole(await bionTicket.MINTER_ROLE(), user1.address);
            await expect(bionTicket.connect(user1).mint(admin.address, 1, 0)).to.be.revertedWith("BionTicket: only minter");
        });

        it("should grant co-admin role", async () => {
            await bionTicket.grantRole(await bionTicket.DEFAULT_ADMIN_ROLE(), user1.address);
            await bionTicket.connect(user1).revokeRole(await bionTicket.DEFAULT_ADMIN_ROLE(), admin.address);

            await expect(bionTicket.connect(admin).grantMinterRole(user1.address)).to.be.revertedWith("BionTicket: only admin");
        });
    });
});
