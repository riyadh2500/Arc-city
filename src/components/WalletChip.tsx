import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract } from 'wagmi'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

/** Shows the real USDC balance (ERC-20 view) of the connected wallet on Arc Testnet. */
export function WalletChip() {
  const { address, isConnected } = useAccount()
  const usdc = getUsdc(arcTestnet.id)
  const { data, isLoading } = useReadContract({
    address: usdc?.address as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(address && usdc), refetchInterval: 15000 },
  })

  return (
    <ConnectKitButton.Custom>
      {({ show, truncatedAddress }) => (
        <button
          type="button"
          onClick={show}
          className="flex min-h-11 items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/15"
        >
          {isConnected ? (
            <>
              <span className="tabular-nums text-white/90">{truncatedAddress}</span>
              <span className="h-4 w-px bg-white/25" />
              <span className="tabular-nums text-[#7cf0a8]">
                {isLoading || data === undefined ? '...' : `${Number(formatUsdc(data)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`}
              </span>
            </>
          ) : (
            'Connect wallet'
          )}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}
