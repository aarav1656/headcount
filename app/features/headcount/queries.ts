import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { Address } from '@solana/kit'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import {
  fetchAllPolls,
  fetchAnswerForPoll,
  fetchAnswersByAnswerer,
  fetchMintInfo,
  fetchPoll,
  fetchPollsByAddress,
  fetchPollsByCreator,
  fetchTokenBalance,
  type HeadcountRpc,
} from '@/lib/headcount/client'

function useRpc(): HeadcountRpc {
  return useMobileWallet().client.rpc as HeadcountRpc
}

const cluster = ACTIVE_CLUSTER.key

export function useMint() {
  const rpc = useRpc()
  return useQuery({
    queryKey: ['mint', cluster, ACTIVE_CLUSTER.rewardMint],
    queryFn: () => fetchMintInfo(rpc, ACTIVE_CLUSTER.rewardMint),
    staleTime: Infinity,
  })
}

export function usePolls() {
  const rpc = useRpc()
  return useQuery({ queryKey: ['polls', cluster], queryFn: () => fetchAllPolls(rpc), refetchInterval: 30_000 })
}

export function usePoll(address: Address | undefined) {
  const rpc = useRpc()
  return useQuery({
    queryKey: ['poll', cluster, address],
    queryFn: () => fetchPoll(rpc, address as Address),
    enabled: !!address,
  })
}

export function useMyAnswerForPoll(poll: Address | undefined, wallet: Address | undefined) {
  const rpc = useRpc()
  return useQuery({
    queryKey: ['answer', cluster, poll, wallet],
    queryFn: () => fetchAnswerForPoll(rpc, poll as Address, wallet as Address),
    enabled: !!poll && !!wallet,
  })
}

export function useMyAnswers(wallet: Address | undefined) {
  const rpc = useRpc()
  return useQuery({
    queryKey: ['my-answers', cluster, wallet],
    queryFn: async () => {
      const answers = await fetchAnswersByAnswerer(rpc, wallet as Address)
      const polls = await fetchPollsByAddress(
        rpc,
        answers.map((a) => a.poll),
      )
      return { answers, polls: new Map(polls.map((p) => [p.address, p])) }
    },
    enabled: !!wallet,
  })
}

export function useMyPolls(wallet: Address | undefined) {
  const rpc = useRpc()
  return useQuery({
    queryKey: ['my-polls', cluster, wallet],
    queryFn: () => fetchPollsByCreator(rpc, wallet as Address),
    enabled: !!wallet,
  })
}

export function useRewardBalance(wallet: Address | undefined) {
  const rpc = useRpc()
  const mint = useMint()
  return useQuery({
    queryKey: ['reward-balance', cluster, wallet],
    queryFn: () =>
      fetchTokenBalance(
        rpc,
        wallet as Address,
        ACTIVE_CLUSTER.rewardMint,
        (mint.data as { tokenProgram: Address }).tokenProgram,
      ),
    enabled: !!wallet && !!mint.data,
  })
}

export function useRefreshHeadcount() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) =>
        ['polls', 'poll', 'answer', 'my-answers', 'my-polls', 'reward-balance'].includes(String(q.queryKey[0])),
    })
}
