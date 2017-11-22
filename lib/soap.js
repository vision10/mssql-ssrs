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
    var auth = createAuthObj(config, security);
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
    cfg.url = typeof config === 'string'
        ? config
        : (config.isHttps ? 'https' : 'http') + '://'
            + config.server + (config.port ? ':' + config.port : '')
            + '/ReportServer' + (config.instance ? '_' + config.instance : '')
    return getServerUrl();
}
function createAuthObj(config, security) {
    var obj = {
        wsdl_options: {
            ntlm: !security,
            username: (config.userName || config.username),
            password: config.password,
            workstation: config.workstation,
            domain: config.domain
        }
    };
    if (security) {
        obj.wsdl_headers = {
            "Authorization": "Basic " + Buffer.from((config.userName || config.username) + ':' + config.password).toString('base64')
        }
    }
    return obj;
}