const { InstanceBase, Regex, runEntrypoint, InstanceStatus} = require('@companion-module/base')

const configs = require('./configs')
const actions = require('./actions')

const snmp = require('net-snmp')

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		Object.assign(this, {
			...configs,
			...actions,
		})
	}

	async init(config) {
		this.config = config

		this.updateStatus(InstanceStatus.Ok)
		this.initActions()
		this.connectAgent()
	}


	async configUpdated(config) {
		this.config = config
		this.connectAgent()
	}

	connectAgent() {
		this.disconnectAgent()

		if (this.config.ip === undefined || this.config.ip === '') {
			this.log('warn', 'Please configure your instance')
			this.updateStatus(InstanceStatus.unknown_error, 'Missing configuration')
			return
		}

		// create v1/v2c session
		if (this.config.version === 'v1' || this.config.version === 'v2c') {
			const options = {
				port: this.config.port,
				version: this.config.version === 'v1' ? snmp.Version1 : snmp.Version2c,
			}

			if (this.config.community === undefined || this.config.community === '') {
				this.log('warn', 'When using SNMP v1 or v2c please specify a community.')
				this.updateStatus(InstanceStatus.unknown_error, 'Missing community')
				return
			}

			this.session = snmp.createSession(this.config.ip, this.config.community, options)
			this.updateStatus(InstanceStatus.Ok)
			return
		}

		// create v3 session
		if (this.config.engineID === undefined || this.config.engineID === '') {
			this.log('warn', 'When using SNMP v3 please specify an Engine ID.')
			this.updateStatus(InstanceStatus.unknown_error, 'Missing Engine ID')
			return
		}

		if (this.config.username === undefined || this.config.username === '') {
			this.log('warn', 'When using SNMP v3 please specify an User Name.')
			this.updateStatus(InstanceStatus.unknown_error, 'Missing User Name')
			return
		}

		const options = {
			port: this.config.port,
			engineID: this.config.engineID,
			version: snmp.Version3,
		}
		const user = {
			name: this.config.username,
			level: snmp.SecurityLevel[this.config.securityLevel],
		}

		if (this.config.securityLevel !== 'noAuthNoPriv') {
			if (this.config.authKey === undefined || this.config.authKey === '') {
				this.log('warn', 'please specify an Auth Key when Security level is authNoPriv or authPriv.')
				this.updateStatus(InstanceStatus.unknown_error, 'Missing Auth Key')
				return
			}

			user.authProtocol = snmp.AuthProtocols[this.config.authProtocol]
			user.authKey = this.config.authKey

			if (this.config.securityLevel == 'authPriv') {
				if (this.config.privKey === undefined || this.config.privKey === '') {
					this.log('warn', 'Please specify a Priv Key when Security level is authPriv.')
					this.updateStatus(InstanceStatus.unknown_error, 'Missing Priv Key')
					return
				}
				user.privProtocol = snmp.PrivProtocols[this.config.privProtocol]
				user.privKey = this.config.privKey
			}
		}

		this.session = snmp.createV3Session(this.config.ip, user, options)
		this.updateStatus(InstanceStatus.Ok)
	}

	disconnectAgent() {
		if (this.session) {
			this.session.close()
			this.session = null
		}
	}

	parse(value) {
		if (value.includes('$(')) {
			this.parseVariablesInString(value, (parsed) => {
				value = parsed
			})
		}
		return value
	}

	setOid(oid, type, value) {
		this.session.set([{ oid, type, value }], (error) => {
			if (error) {
				this.log('error', error.toString())
			}
		})
	}

	async destroy() {
		this.disconnectAgent()
		this.log('debug', 'destroy')
	}
}


runEntrypoint(ModuleInstance, [])
//module.exports = Instance