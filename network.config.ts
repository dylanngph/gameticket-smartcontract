type NetworkConfigItem = {
    rpc: string;
    scanApiKey?: string;
    bionTicket?: string;
    bionGameSlot?: string;
    vrfCoordinator?: string;
    vrfSubId?: string;
    vrfKeyHash?: string;
    signerAddress?: string;
    ticketMachine?: string;
};

type NetworkConfigMap = {
    [chainId: number]: NetworkConfigItem;
};

export const NETWORK_CONFIG: NetworkConfigMap = {
    97: {
        rpc: "https://data-seed-prebsc-2-s1.binance.org:8545",
        scanApiKey: "JZY7IPB1EU9339JSK9452I8JH1ZA8CPFM2",
        vrfCoordinator: "0x6A2AAd07396B36Fe02a22b33cf443582f682c82f",
        vrfKeyHash: "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314",
        vrfSubId: "2024",
        bionTicket: "0x999145Ed32318360c6B363bE729Bb0ca3af30B3a",
        bionGameSlot: "0x8f2Ab42504db5Bc3998157ea382594462b8819AD",
        signerAddress: "0xEa9de5994d34aD46bCFdb87C49f2070810fA53CE",
        ticketMachine: "0xFa0B3E2E58409EeA2F406f2Ef8cA72Edbe1F782b",
    },
};

export function getDeployerPrivateKey() {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("DEPLOYER_PRIVATE_KEY is not set");
    }
    return privateKey;
}
