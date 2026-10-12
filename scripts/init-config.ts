import { address, getAddressDecoder } from '@solana/kit'
import { ACCOUNT, configAddress, initConfigInstruction } from '../app/lib/headcount/program'
import { ATTESTOR_PUBKEY, PROGRAM_ID } from '../app/constants/headcount'
import { fetchData, loadSigner, sendAndConfirm } from './chain'

const admin = await loadSigner()
const config = configAddress()
console.log('program', PROGRAM_ID)
console.log('admin  ', admin.address)
console.log('config ', config)

const readConfig = async () => {
  const d = await fetchData(config)
  if (!d) return null
  for (let i = 0; i < 8; i++)
    if (d[i] !== ACCOUNT.config[i]) throw new Error('config account has a foreign discriminator')
  const dec = getAddressDecoder()
  return { admin: dec.decode(d, 8), attestor: dec.decode(d, 40), bump: d[72] }
}

let existing = await readConfig()
if (existing) {
  console.log('config already initialised, skipping init_config')
} else {
  const sig = await sendAndConfirm(admin, [initConfigInstruction({ admin: admin.address, attestor: ATTESTOR_PUBKEY })])
  console.log('init_config signature', sig)
  existing = await readConfig()
}
console.log('Config account read back:', existing)
if (!existing) throw new Error('config account missing after init_config')
if (existing.attestor !== address(ATTESTOR_PUBKEY))
  throw new Error('attestor on-chain differs from the expected attestor')
console.log('OK: Config.attestor == expected attestor', ATTESTOR_PUBKEY)
