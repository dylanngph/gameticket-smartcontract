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
        rpc: "https://data-seed-prebsc-1-s1.binance.org:8545",
        scanApiKey: "JZY7IPB1EU9339JSK9452I8JH1ZA8CPFM2",
        vrfCoordinator: "0x6A2AAd07396B36Fe02a22b33cf443582f682c82f",
        vrfKeyHash: "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314",
        vrfSubId: "2024",
        bionTicket: "0x999145Ed32318360c6B363bE729Bb0ca3af30B3a",
        bionGameSlot: "0xfbaE63cc14707d2ff47Cc718085F860c56c62991",
        signerAddress: "0xEa9de5994d34aD46bCFdb87C49f2070810fA53CE",
        ticketMachine: "0xb426Be9414Cb7F4D9b14BC71519c2663a9332263",
    },
};

export function getDeployerPrivateKey() {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("DEPLOYER_PRIVATE_KEY is not set");
    }
    return privateKey;
}
