module.exports = {
    createClient: createClient,
    getRootFolder: getRootFolder,
    setRootFolder: setRootFolder,
    setServerUrl: setServerUrl,
    getServerUrl: getServerUrl
}

const url = require('url');
const soap = require('soap');
const httpntlm = require('httpntlm');

var cfg = { url: '', rootFolder: '/' };

async function createClient(url, config, security) {
    config = config || {};
    var auth = createAuthObj(config);
    var s = getSecurity(auth, security || 'ntlm');
    config = setOptions(config, auth, security || 'ntlm', s);

    var client = await soap.createClientAsync(url, config);
    client.setSecurity(s);
    return client;
}

function ntlmRequest(options, callback) {
    options.url = options.uri.href; // url.format(options.uri)
    httpntlm[options.body ? 'post' : 'get'](options, function (err, res) {
        if (err) {
            return callback(err);
        }
        // if result is stream (like getReport)
        if (typeof res.body != 'string')
            res.body = res.body.toString();

        res.body = soap.HttpClient.prototype.handleResponse(null, res, res.body);
        callback(null, res, res.body);
    });
}

function getRootFolder() { return cfg.rootFolder }
function setRootFolder(rootFolder) { cfg.rootFolder = rootFolder || '/' }
function getServerUrl() { return cfg.url }
function setServerUrl(config) {
    cfg.url = typeof config === 'string'
        ? config
        : (config.isHttps ? 'https' : 'http') + '://'
        + config.server + (config.port ? ':' + config.port : '')
        + '/ReportServer' + (config.instance ? '_' + config.instance : '')
    return getServerUrl();
}

function createAuthObj(config) {
    if (config.wsdl_options) return config.wsdl_options;
    return {
        username: (config.userName || config.username),
        password: config.password,
        workstation: config.workstation,
        domain: config.domain
    };
}

function setOptions(config, auth, security, s) {
    switch (security) {
        case 'ntlm':
            config.request = ntlmRequest;
            config.wsdl_options = config.wsdl_options || auth;
            break;
        case 'basic':
            config.wsdl_headers = config.wsdl_headers || {};
            s && s.addHeaders && s.addHeaders(config.wsdl_headers);
            break;
    }
    return config;
}

function getSecurity(auth, security) {
    switch (security) {
        case 'ntlm': return new soap.security.NTLMSecurity(auth.username, auth.password, auth.domain, auth.workstation);
        case 'basic': return new soap.security.BasicAuthSecurity(auth.username, auth.password);
        default: return security;
    }
}