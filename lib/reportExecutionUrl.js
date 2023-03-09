const dayjs = require('dayjs');
const { NtlmClient } = require('axios-ntlm');

const utils = require('./utils');

module.exports = class ReportExecutionUrl {
    constructor(url, auth, options, axiosConfig) {
        this.soapInstance = utils.createSoapInstance(url, options);
        this.axiosCfg = axiosConfig;
        this.auth = auth;
    }

    async getReport(reportPath, fileType, params, axiosConfig) {
        if (!this.client) {
            const credentials = this.soapInstance.createAuthObj(this.auth);
            const defaults = { method: 'get', responseType: 'arraybuffer' };
            this.client = NtlmClient(credentials, Object.assign(defaults, this.axiosCfg, axiosConfig));
        }
        const urlPath = utils.testReportPath(this.soapInstance.getRootFolder(), reportPath).replace(/\s/g, '+');
        const urlParams = `&rs:Command=Render&rs:Format=${utils.reportFileFormat(fileType)}${formatParamsToUrl(params)}`;
        return await this.client(`${this.soapInstance.getServerUrl()}?${encodeURIComponent(urlPath)}${urlParams}`);
    }
}

/**
 * param1=value1&param2=value2&param3=value3
 * 
 * for multiple params {sameName: [...]}
 * 
 * sameName=value1%2Cvalue2
 */
function formatParamsToUrl(params) {
    const urlParts = [];
    if (Array.isArray(params)) { // [{Name: nume, Value: valoare}]
        for (var i = 0; i < params.length; i++) {
            if (params[i].ParameterTypeName === "DateTime") {
                urlParts.push(params[i].Name + "=" + dayjs(params[i].Value).format("MM.DD.YYYY"))
            } else if (Array.isArray(params[i].Value)) {
                // result paramName=paramValue1%2CparamValue2%2CparamValue3
                const parts = [];
                for (var j = 0; j < params[i].Value.length; j++) {
                    parts.push(encodeURIComponent(params[i].Value[j].Value))
                }
                urlParts.push(`${params[i].Name}=${parts.join('%2C')}`)
            } else {
                urlParts.push(`${params[i].Name}=${encodeURIComponent(params[i].Value)}`)
            }
        }
    } else { // { name: value }
        for (var key in params) {
            if (params[key] instanceof Date && !isNaN(params[key].valueOf())) {
                urlParts.push(key + "=" + dayjs(params[key]).format("MM/DD/YYYY"))
            } else if (Array.isArray(params[key])) {
                // result paramName=paramValue1%2CparamValue2%2CparamValue3
                const parts = [];
                for (var j = 0; j < params[key].length; j++) {
                    parts.push(encodeURIComponent(params[key][j]))
                }
                urlParts.push(params[key] + "=" + parts.join('%2C'))
            } else if (typeof params[key] === 'boolean') {
                urlParts.push(key + "=" + (params[key] ? 'True' : 'False'))
            } else {
                urlParts.push(key + (params[key] === null || params[key] === undefined ? ':IsNull=True' : "=" + encodeURIComponent(params[key])))
            }
        }
    }
    return urlParts.length > 0 ? '&' + urlParts.join('&') : ''
}