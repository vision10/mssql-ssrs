const soap = require('soap');

module.exports = class Soap {
    constructor(defaultUrlOrServerConfig, rootFolder) {
        defaultUrlOrServerConfig && this.setServerUrl(defaultUrlOrServerConfig);
        rootFolder && this.setRootFolder(rootFolder);
    }

    async createClient(url, config, security) {
        if (url) { this.setServerUrl(url) }
        config = config || {};
        if (!security) { security = 'ntlm' }
        const auth = this.createAuthObj(config);
        const secure = this.getSecurity(security, auth);

        const cfg = this.setOptions(config, security, secure);
        this.client = await soap.createClientAsync(this.url, cfg);
        if (secure) { this.client.setSecurity(secure) }

        return this.client;
    }

    getRootFolder() { return this.rootFolder }
    setRootFolder(rootFolder) { this.rootFolder = rootFolder || '/' }

    getServerUrl() { return this.url }
    setServerUrl(config) {
        this.url = typeof config === 'string'
            ? config
            : (config.isHttps ? 'https' : 'http') + '://'
            + config.server + (config.port ? ':' + config.port : '')
            + '/ReportServer' + (config.instance ? '_' + config.instance : '')
    }

    createAuthObj(config) {
        if (config.wsdl_options) { return config.wsdl_options }
        return {
            username: (config.username || config.userName),
            password: config.password || '',
            workstation: config.workstation || '',
            domain: config.domain || ''
        }
    }

    setOptions(config, securityType, security) {
        switch (securityType) {
            case 'ntlm':
                config.wsdl_options = security.defaults;
                config.wsdl_headers = config.wsdl_headers || {};
                security && security.addHeaders && security.addHeaders(config.wsdl_headers);
                break;
            case 'basic':
                config.wsdl_headers = config.wsdl_headers || {};
                security && security.addHeaders && security.addHeaders(config.wsdl_headers);
                break;
        }
        return config;
    }

    getSecurity(security, auth) {
        switch (security) {
            case 'ntlm': return new soap.security.NTLMSecurity(auth.username, auth.password, auth.domain, auth.workstation);
            case 'basic': return new soap.security.BasicAuthSecurity(auth.username, auth.password);
            default: return security;
        }
    }
}