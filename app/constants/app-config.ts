import { AppIdentity, createSolanaDevnet, createSolanaMainnet, SolanaCluster } from '@wallet-ui/react-native-kit'
import { ACTIVE_CLUSTER } from '@/constants/headcount'

export class AppConfig {
  static identity: AppIdentity = {
    name: 'Headcount',
    uri: 'headcount://app',
  }
  static networks: SolanaCluster[] = [
    ACTIVE_CLUSTER.key === 'mainnet'
      ? createSolanaMainnet({ url: ACTIVE_CLUSTER.rpcUrl })
      : createSolanaDevnet({ url: ACTIVE_CLUSTER.rpcUrl }),
  ]
}
