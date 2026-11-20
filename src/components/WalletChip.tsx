import { ConnectKitButton } from 'connectkit'
import { erc20Abi, formatUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract } from 'wagmi'

// USDC on Arc Testnet (ERC-20 view, 6 decimals)
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const USDC_DECIMALS = 6

/** Shows the real USDC balance (ERC-20 view) of the connected wallet on Arc Testnet. */
export function WalletChip() {
  const { address, isConnected } = useAccount()
  const { data, isLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(address), refetchInterval: 15000 },
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
                {isLoading || data === undefined ? '...' : `${Number(formatUnits(data, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`}
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
