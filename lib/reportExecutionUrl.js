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
            const value = params[i];
            if (value.ParameterTypeName === "DateTime") {
                urlParts.push(value.Name + "=" + dayjs(value.Value).format("MM.DD.YYYY"))
            } else if (Array.isArray(value.Value)) {
                // result paramName=paramValue1%2CparamValue2%2CparamValue3
                const parts = [];
                for (var j = 0; j < value.Value.length; j++) {
                    parts.push(encodeURIComponent(value.Value[j].Value))
                }
                urlParts.push(`${value.Name}=${parts.join('%2C')}`)
            } else {
                urlParts.push(`${value.Name}=${encodeURIComponent(value.Value)}`)
            }
        }
    } else { // { name: value }
        for (var key in params) {
            const value = params[key];
            if (value instanceof Date && !isNaN(value.valueOf())) {
                urlParts.push(key + "=" + dayjs(value).format("MM/DD/YYYY"))
            } else if (Array.isArray(value)) {
                // result paramName=paramValue1%2CparamValue2%2CparamValue3
                const parts = [];
                for (var j = 0; j < value.length; j++) {
                    parts.push(encodeURIComponent(value[j]))
                }
                urlParts.push(value + "=" + parts.join('%2C'))
            } else if (typeof value === 'boolean') {
                urlParts.push(key + "=" + (value ? 'True' : 'False'))
            } else {
                urlParts.push(key + (value === null || value === undefined ? ':IsNull=True' : "=" + encodeURIComponent(value)))
            }
        }
    }
    return urlParts.length > 0 ? '&' + urlParts.join('&') : ''
}