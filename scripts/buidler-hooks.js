/*
 * These hooks are called by the Aragon Buidler plugin during the start task's lifecycle. Use them to perform custom tasks at certain entry points of the development build process, like deploying a token before a proxy is initialized, etc.
 *
 * Link them to the main buidler config file (buidler.config.js) in the `aragon.hooks` property.
 *
 * All hooks receive two parameters:
 * 1) A params object that may contain other objects that pertain to the particular hook.
 * 2) A "bre" or BuidlerRuntimeEnvironment object that contains enviroment objects like web3, Truffle artifacts, etc.
 *
 * Please see AragonConfigHooks, in the plugin's types for further details on these interfaces.
 * https://github.com/aragon/buidler-aragon/blob/develop/src/types.ts#L31
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const TOKEN_NAME = 'Tollgate DAO Token'
const TOKEN_SYMBOL = 'TDT'
const TOKEN_TRANSFERABLE = true
const TOKEN_DECIMALS = 18
const TOKEN_MAX_PER_ACCOUNT = 0
const FEE_TOKEN_NAME = 'Tollgate Fee Token'
const FEE_TOKEN_SYMBOL = 'TFT'
const VOTING_SETTINGS = [
  '500000000000000000',
  '200000000000000000',
  '86400',
]
const DEFAULT_FINANCE_PERIOD = 30 * 24 * 60 * 60

let feeToken, finance

const getDeployToken = ({ artifacts, web3, _experimentalAppInstaller }) =>
  async (tokenName, tokenSymbol, installManager = true) => {
    const MiniMeToken = artifacts.require('MiniMeToken')
    const accounts = await web3.eth.getAccounts()
    const token = await MiniMeToken.new(
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0,
      tokenName,
      TOKEN_DECIMALS,
      tokenSymbol,
      TOKEN_TRANSFERABLE
    )

    await token.generateTokens(accounts[0], '100000000000000000000')

    if (installManager) {
      const tm = await _experimentalAppInstaller('token-manager', {
        skipInitialize: true,
      })

      await token.changeController(tm.address)
      await tm.initialize([
        token.address,
        TOKEN_TRANSFERABLE,
        TOKEN_MAX_PER_ACCOUNT,
      ])
      await tm.createPermission('MINT_ROLE')
    }
    return token
  }

module.exports = {
  // Called before a dao is deployed.
  preDao: async ({ log }, { web3, artifacts }) => {},

  // Called after a dao is deployed.
  postDao: async (
    { dao, _experimentalAppInstaller, log },
    { web3, artifacts }
  ) => {},

  // Called after the app's proxy is created, but before it's initialized.
  preInit: async (
    { proxy: tollgate, _experimentalAppInstaller, log },
    { web3, artifacts }
  ) => {
    const deployToken = getDeployToken({ artifacts, web3, _experimentalAppInstaller })
    const token = await deployToken(TOKEN_NAME, TOKEN_SYMBOL)
    const _feeToken = await deployToken(FEE_TOKEN_NAME, FEE_TOKEN_SYMBOL, false)
    feeToken = _feeToken

    const voting = await _experimentalAppInstaller('voting', {
      initializeArgs: [token.address, ...VOTING_SETTINGS],
    })
    const vault = await _experimentalAppInstaller('vault')
    const _finance = await _experimentalAppInstaller('finance', {
      initializeArgs: [vault.address, DEFAULT_FINANCE_PERIOD],
    })
    finance = _finance

    await voting.createPermission('CREATE_VOTES_ROLE', tollgate.address)
    await vault.createPermission('TRANSFER_ROLE', finance.address)
    await finance.createPermission('CREATE_PAYMENTS_ROLE', voting.address)
  },

  // Called after the app's proxy is initialized.
  postInit: async (
    { proxy, _experimentalAppInstaller, log },
    { web3, artifacts }
  ) => {},

  // Called when the start task needs to know the app proxy's init parameters.
  // Must return an array with the proxy's init parameters.
  getInitParams: async ({ log }, { web3, artifacts }) => {
    return [feeToken.address, '' + 1e18, finance.address]
  },

  // Called after the app's proxy is updated with a new implementation.
  postUpdate: async ({ proxy, log }, { web3, artifacts }) => {},
}