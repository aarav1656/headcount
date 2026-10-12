import { address, type Address } from '@solana/kit'

export type ClusterKey = 'devnet' | 'mainnet'

export type ClusterConfig = {
  key: ClusterKey
  walletChain: 'solana:devnet' | 'solana:mainnet'
  rpcUrl: string
  rewardMint: Address
  rewardLabel: string
  explorerParam: string
}

/** One entry per cluster. A mainnet build flips EXPO_PUBLIC_CLUSTER=mainnet and nothing else. */
export const CLUSTERS: Record<ClusterKey, ClusterConfig> = {
  devnet: {
    key: 'devnet',
    walletChain: 'solana:devnet',
    rpcUrl: process.env.EXPO_PUBLIC_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com',
    rewardMint: address('3BySLyP6nGFKDfFdfcsuT4ZmcndDsnsiLsHMCToT5i5V'),
    rewardLabel: 'SKR (devnet)',
    explorerParam: '?cluster=devnet',
  },
  mainnet: {
    key: 'mainnet',
    walletChain: 'solana:mainnet',
    rpcUrl: process.env.EXPO_PUBLIC_MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
    rewardMint: address('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'),
    rewardLabel: 'SKR',
    explorerParam: '',
  },
}

export const ACTIVE_CLUSTER: ClusterConfig =
  process.env.EXPO_PUBLIC_CLUSTER === 'mainnet' ? CLUSTERS.mainnet : CLUSTERS.devnet

export const PROGRAM_ID = address('2bgD83ZSF8vehRfEadp5iPW1YGhnMpQDQPD5jZLzCccW')
export const ATTESTOR_PUBKEY = address('9zSRzo8Fm1NQ8xAk2EV4Jeqtk5eaUBwvy4YbJmpQBfAX')

export const ATTEST_URL = process.env.EXPO_PUBLIC_ATTEST_URL ?? 'https://headcount-attest.fly.dev/api/attest'

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${ACTIVE_CLUSTER.explorerParam}`
}
