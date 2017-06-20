module.exports = {
    createClient: createClient,
    getRootFolder: getRootFolder,
    setRootFolder: setRootFolder,
    setServerUrl: setServerUrl,
    getServerUrl: getServerUrl
}

const soap = require('soap-ntlm-2');
var cfg = { url: '', rootFolder: '/' };

async function createClient(url, config, security) {
    var auth = createAuthObj(config);
    return new Promise(function (resolve, reject) {
        soap.createClient(url, auth, function (err, client) {
            if (err) {
                reject(err)
            } else {
                //security = security || new soap.NtlmSecurity(auth.wsdl_options.userName, auth.wsdl_options.password);
                security = security || new soap.NtlmSecurity(auth.wsdl_options);
                client.setSecurity(security);
                resolve(client);
            }
        })
    })
}

function getRootFolder() { return cfg.rootFolder }
function setRootFolder(rootFolder) { cfg.rootFolder = rootFolder || '/' }
function getServerUrl() { return cfg.url }
function setServerUrl(config) {
    cfg.url = typeof config === 'string' ? config : (config.isHttps ? 'https' : 'http') + '://' + config.server + ':' + config.port + '/' + config.instance
}
function createAuthObj(config) {
    return {
        wsdl_options: {
            ntlm: true,
            username: config.userName,
            password: config.password,
            workstation: config.workstation,
            domain: config.domain
        }
    }
}